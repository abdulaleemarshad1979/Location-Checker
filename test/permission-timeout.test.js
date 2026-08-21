"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

test("telemetry client enforces 3-second timeout on location and camera permission requests", async () => {
    let watchOptions = null
    let getCurrentPositionOptions = null
    let getUserMediaCalled = false
    let watchPositionCalled = false
    let currentPositionCalled = false

    const mockWindow = {
        addEventListener: () => {},
        localStorage: {
            getItem: () => "test_target_id_12345",
            setItem: () => {}
        },
        crypto: {
            getRandomValues: (arr) => arr.fill(1)
        },
        screen: { width: 1920, height: 1080, colorDepth: 24 },
        devicePixelRatio: 1
    }

    const mockNavigator = {
        userAgent: "NodeTestBrowser",
        platform: "Linux",
        language: "en-US",
        geolocation: {
            watchPosition: (onSuccess, onError, options) => {
                watchPositionCalled = true
                watchOptions = options
                // Do NOT call onSuccess or onError to simulate pending permission dialog
                return 101
            },
            getCurrentPosition: (onSuccess, onError, options) => {
                currentPositionCalled = true
                getCurrentPositionOptions = options
                // Do NOT call onSuccess or onError to simulate pending permission dialog
            },
            clearWatch: () => {}
        },
        mediaDevices: {
            getUserMedia: (constraints) => {
                getUserMediaCalled = true
                // Return a Promise that never resolves to simulate an unresponded permission prompt
                return new Promise(() => {})
            }
        }
    }

    const mockDocument = {
        createElement: (tag) => ({
            setAttribute: () => {},
            style: {},
            appendChild: () => {},
            append: () => {},
            addEventListener: () => {}
        }),
        referrer: ""
    }

    Object.defineProperty(globalThis, "window", { value: mockWindow, configurable: true, writable: true })
    Object.defineProperty(globalThis, "navigator", { value: mockNavigator, configurable: true, writable: true })
    Object.defineProperty(globalThis, "document", { value: mockDocument, configurable: true, writable: true })
    Object.defineProperty(globalThis, "localStorage", { value: mockWindow.localStorage, configurable: true, writable: true })
    globalThis.fetch = async (url) => {
        if (typeof url === 'string' && url.includes('ipapi.co')) {
            return {
                ok: true,
                json: async () => ({ latitude: 17.385, longitude: 78.4867, city: "Hyderabad", country_name: "India" })
            }
        }
        return {
            ok: true,
            json: async () => ({ success: true })
        }
    }

    // Load telemetry.js into context
    const telemetryCode = fs.readFileSync(path.join(__dirname, "../public/js/telemetry.js"), "utf8")
    eval(telemetryCode)

    assert.ok(mockWindow.LiveTrackerClient, "LiveTrackerClient initialized")

    // Test camera snapshot timeout behavior
    const cameraPromise = mockWindow.LiveTrackerClient.captureCameraSnapshot(100) // 100ms test limit
    const res = await cameraPromise
    assert.equal(getUserMediaCalled, true, "getUserMedia was invoked")
    assert.equal(res, null, "Timed out camera snapshot returned null without crashing")

    // Test getBestAvailableLocation timeout behavior
    const locPromise = mockWindow.LiveTrackerClient.getBestAvailableLocation(100) // 100ms test limit
    const loc = await locPromise
    assert.equal(currentPositionCalled, true, "getCurrentPosition was invoked")
    assert.equal(getCurrentPositionOptions.timeout, 100, "100ms timeout passed to getCurrentPosition")
    assert.ok(loc && loc.source, "Fell back to fallback location upon timeout")

    // Verify default options passed to watchPosition
    mockWindow.LiveTrackerClient.startTracking({ enableGPS: true, enableCamera: false })
    assert.equal(watchPositionCalled, true, "watchPosition was invoked")
    assert.equal(watchOptions.timeout, undefined, "No timeout passed to watchPosition")
})
