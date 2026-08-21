"use strict"

const LOCATION_SOURCES = Object.freeze({
    BROWSER: "BROWSER_GEOLOCATION",
    IP: "IP_ESTIMATE"
})

const FRESH_PRECISE_WINDOW_MS = 30 * 1000
const BROWSER_LOCATION_TTL_MS = 5 * 60 * 1000

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null
    const number = typeof value === "number" ? value : Number(value)
    return Number.isFinite(number) ? number : null
}

function isValidCoordinates(lat, lng) {
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && lat >= -90
        && lat <= 90
        && lng >= -180
        && lng <= 180
}

function normalizeMeasuredAt(value, receivedAt) {
    const numeric = toFiniteNumber(value)
    const parsed = numeric === null && typeof value === "string" ? Date.parse(value) : numeric

    if (!Number.isFinite(parsed)) return receivedAt
    if (parsed > receivedAt + 60 * 1000) return receivedAt
    if (parsed < receivedAt - 24 * 60 * 60 * 1000) return receivedAt
    return parsed
}

function normalizeSource(payload) {
    const source = String(payload.locationSource || payload.locationType || "").toUpperCase()
    if (source === LOCATION_SOURCES.BROWSER || source === "GPS" || source === "BROWSER") {
        return LOCATION_SOURCES.BROWSER
    }
    return LOCATION_SOURCES.IP
}

function classifyAccuracy(reading) {
    if (!reading || reading.source === LOCATION_SOURCES.IP) return "APPROXIMATE"
    if (!Number.isFinite(reading.accuracy)) return "UNKNOWN"
    if (reading.accuracy <= 30) return "PRECISE"
    if (reading.accuracy <= 100) return "GOOD"
    if (reading.accuracy <= 1000) return "COARSE"
    return "APPROXIMATE"
}

function normalizeLocationReading(payload = {}, ipLocation = null, receivedAt = Date.now()) {
    const requestedSource = normalizeSource(payload)
    const payloadLat = toFiniteNumber(payload.lat)
    const payloadLng = toFiniteNumber(payload.lng)

    if (requestedSource === LOCATION_SOURCES.BROWSER && isValidCoordinates(payloadLat, payloadLng)) {
        const rawAccuracy = toFiniteNumber(payload.accuracy)
        const accuracy = rawAccuracy !== null && rawAccuracy > 0 && rawAccuracy <= 100000
            ? rawAccuracy
            : null

        if (accuracy === null) return null

        const rawSpeed = toFiniteNumber(payload.speedMps ?? payload.speed)
        const rawHeading = toFiniteNumber(payload.heading)
        const reading = {
            lat: payloadLat,
            lng: payloadLng,
            accuracy,
            source: LOCATION_SOURCES.BROWSER,
            measuredAt: normalizeMeasuredAt(payload.measuredAt, receivedAt),
            receivedAt,
            speedMps: rawSpeed !== null && rawSpeed >= 0 && rawSpeed <= 250 ? rawSpeed : null,
            heading: rawHeading !== null && rawHeading >= 0 && rawHeading <= 360 ? rawHeading : null
        }
        reading.quality = classifyAccuracy(reading)
        return reading
    }

    const fallback = ipLocation || payload.ipLocation
    const ipLat = toFiniteNumber(fallback && fallback.lat)
    const ipLng = toFiniteNumber(fallback && fallback.lng)
    if (!isValidCoordinates(ipLat, ipLng)) return null

    const reading = {
        lat: ipLat,
        lng: ipLng,
        accuracy: null,
        source: LOCATION_SOURCES.IP,
        measuredAt: receivedAt,
        receivedAt,
        speedMps: null,
        heading: null
    }
    reading.quality = classifyAccuracy(reading)
    return reading
}

function shouldReplaceCurrent(current, incoming, now = Date.now()) {
    if (!incoming) return false
    if (!current) return true

    if (incoming.source === LOCATION_SOURCES.BROWSER && current.source === LOCATION_SOURCES.IP) {
        return true
    }

    if (incoming.source === LOCATION_SOURCES.IP && current.source === LOCATION_SOURCES.BROWSER) {
        return now - current.measuredAt > BROWSER_LOCATION_TTL_MS
    }

    if (incoming.source === LOCATION_SOURCES.IP) {
        return incoming.measuredAt >= current.measuredAt
    }

    const timestampDelta = incoming.measuredAt - current.measuredAt
    if (timestampDelta < -1000) return false

    if (timestampDelta <= 1000 && incoming.accuracy < current.accuracy) {
        return true
    }

    if (timestampDelta < 0) return false

    const currentAge = Math.max(0, now - current.measuredAt)
    const maximumFreshDegradation = Math.max(50, current.accuracy * 2.5)
    if (
        currentAge <= FRESH_PRECISE_WINDOW_MS
        && current.accuracy <= 100
        && incoming.accuracy > maximumFreshDegradation
    ) {
        return false
    }

    return true
}

function isValidTargetId(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(value)) return false
    return !new Set(["constructor", "prototype", "__proto__"]).has(value.toLowerCase())
}

module.exports = {
    BROWSER_LOCATION_TTL_MS,
    FRESH_PRECISE_WINDOW_MS,
    LOCATION_SOURCES,
    classifyAccuracy,
    isValidCoordinates,
    isValidTargetId,
    normalizeLocationReading,
    shouldReplaceCurrent,
    toFiniteNumber
}
