"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const {
    BROWSER_LOCATION_TTL_MS,
    LOCATION_SOURCES,
    isValidTargetId,
    normalizeLocationReading,
    shouldReplaceCurrent
} = require("../location-quality")

function browserReading(overrides = {}, receivedAt = 1_700_000_000_000) {
    return normalizeLocationReading({
        lat: 16.5062,
        lng: 80.648,
        accuracy: 18,
        locationSource: LOCATION_SOURCES.BROWSER,
        measuredAt: receivedAt,
        ...overrides
    }, null, receivedAt)
}

test("accepts valid zero-valued coordinates", () => {
    const reading = browserReading({ lat: 0, lng: 0 })
    assert.equal(reading.lat, 0)
    assert.equal(reading.lng, 0)
    assert.equal(reading.source, LOCATION_SOURCES.BROWSER)
})

test("rejects invalid coordinates and browser readings without accuracy", () => {
    assert.equal(browserReading({ lat: 91 }), null)
    assert.equal(browserReading({ lng: -181 }), null)
    assert.equal(browserReading({ accuracy: null }), null)
})

test("normalizes browser speed as metres per second", () => {
    const reading = browserReading({ speedMps: 12.5, heading: 270 })
    assert.equal(reading.speedMps, 12.5)
    assert.equal(reading.heading, 270)
    assert.equal(browserReading({ speedMps: 999 }).speedMps, null)
})

test("browser geolocation replaces an IP estimate", () => {
    const now = 1_700_000_000_000
    const ip = normalizeLocationReading(
        { locationSource: LOCATION_SOURCES.IP },
        { lat: 17.385, lng: 78.4867 },
        now
    )
    assert.equal(shouldReplaceCurrent(ip, browserReading({}, now + 1000), now + 1000), true)
})

test("IP estimate cannot overwrite a recent browser location", () => {
    const now = 1_700_000_000_000
    const current = browserReading({}, now)
    const ip = normalizeLocationReading(
        { locationSource: LOCATION_SOURCES.IP },
        { lat: 17.385, lng: 78.4867 },
        now + 10_000
    )
    assert.equal(shouldReplaceCurrent(current, ip, now + 10_000), false)
})

test("IP estimate may replace an expired browser location", () => {
    const measuredAt = 1_700_000_000_000
    const now = measuredAt + BROWSER_LOCATION_TTL_MS + 1
    const current = browserReading({}, measuredAt)
    const ip = normalizeLocationReading(
        { locationSource: LOCATION_SOURCES.IP },
        { lat: 17.385, lng: 78.4867 },
        now
    )
    assert.equal(shouldReplaceCurrent(current, ip, now), true)
})

test("a fresh precise reading is not replaced by a much poorer fix", () => {
    const now = 1_700_000_000_000
    const current = browserReading({ accuracy: 10 }, now)
    const incoming = browserReading({ accuracy: 500 }, now + 5000)
    assert.equal(shouldReplaceCurrent(current, incoming, now + 5000), false)
})

test("a newer reading of comparable quality replaces the current fix", () => {
    const now = 1_700_000_000_000
    const current = browserReading({ accuracy: 20 }, now)
    const incoming = browserReading({ accuracy: 30 }, now + 5000)
    assert.equal(shouldReplaceCurrent(current, incoming, now + 5000), true)
})

test("out-of-order browser readings are rejected", () => {
    const now = 1_700_000_000_000
    const current = browserReading({}, now)
    const incoming = browserReading({ accuracy: 5 }, now - 5000)
    assert.equal(shouldReplaceCurrent(current, incoming, now), false)
})

test("target identifiers block prototype keys and malformed values", () => {
    assert.equal(isValidTargetId("Abc12345_-"), true)
    assert.equal(isValidTargetId("__proto__"), false)
    assert.equal(isValidTargetId("constructor"), false)
    assert.equal(isValidTargetId("short"), false)
    assert.equal(isValidTargetId("bad id value"), false)
})
