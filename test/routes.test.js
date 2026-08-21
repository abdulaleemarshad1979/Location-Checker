"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const app = require("../server")

test("consent gate, zero coordinates, authenticated API, and map route", async t => {
    const server = await new Promise(resolve => {
        const listener = app.listen(0, "127.0.0.1", () => resolve(listener))
    })
    t.after(() => new Promise(resolve => server.close(resolve)))

    const baseUrl = `http://127.0.0.1:${server.address().port}`

    let response = await fetch(`${baseUrl}/login`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Sign In to Dashboard/i)

    response = await fetch(`${baseUrl}/location?ref=TEST-001`)
    assert.equal(response.status, 200)
    const publicHtml = await response.text()
    assert.match(publicHtml, /No information has been shared/i)
    assert.match(publicHtml, /No camera or microphone access is requested/i)

    response = await fetch(`${baseUrl}/api/telemetry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            id: "ConsentTest123",
            lat: 1,
            lng: 2,
            accuracy: 10,
            locationSource: "BROWSER_GEOLOCATION"
        })
    })
    assert.equal(response.status, 400)

    response = await fetch(`${baseUrl}/api/telemetry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            id: "ConsentTest123",
            consentVersion: "location-v1",
            lat: 0,
            lng: 0,
            accuracy: 12,
            locationSource: "BROWSER_GEOLOCATION",
            measuredAt: Date.now(),
            template: "official-location-request"
        })
    })
    assert.equal(response.status, 200)
    let telemetry = await response.json()
    assert.equal(telemetry.target.lat, 0)
    assert.equal(telemetry.target.lng, 0)
    assert.equal(telemetry.target.locationQuality, "PRECISE")

    response = await fetch(`${baseUrl}/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "username=admin&password=admin"
    })
    assert.equal(response.status, 302)
    const setCookie = response.headers.get("set-cookie")
    assert.ok(setCookie)
    const cookie = setCookie.split(";")[0]

    response = await fetch(`${baseUrl}/api/targets/ConsentTest123`, { headers: { cookie } })
    assert.equal(response.status, 200)
    telemetry = await response.json()
    assert.equal(telemetry.locationSource, "BROWSER_GEOLOCATION")
    assert.equal(telemetry.accuracy, 12)

    response = await fetch(`${baseUrl}/map?id=ConsentTest123`, { headers: { cookie } })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Reported location map/i)
})
