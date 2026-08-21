/**
 * Consent-based location sharing client.
 *
 * The client starts one high-accuracy browser watcher only after the visitor
 * explicitly chooses to share. It never requests the camera or microphone.
 */
(function (window) {
    "use strict"

    const LOCATION_SOURCE = "BROWSER_GEOLOCATION"
    const CONSENT_VERSION = "location-v1"
    const MIN_UPDATE_INTERVAL_MS = 3000

    function generateId(length = 16) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        const bytes = new Uint8Array(length)
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes)
        } else {
            for (let index = 0; index < length; index += 1) {
                bytes[index] = Math.floor(Math.random() * 256)
            }
        }
        return Array.from(bytes, byte => characters[byte % characters.length]).join("")
    }

    let targetId = localStorage.getItem("target_id") || localStorage.getItem("id")
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(targetId || "")) {
        targetId = generateId()
        localStorage.setItem("target_id", targetId)
        localStorage.setItem("id", targetId)
    }

    let authorized = false
    let watchId = null
    let activeOptions = null
    let consentOverlay = null
    let statusPanel = null
    let lastSentAt = 0
    let lastSentAccuracy = Number.POSITIVE_INFINITY
    let approximateFallbackSent = false
    let cachedIpLocation = null

    function finiteNumber(value) {
        if (value === null || value === undefined || value === "") return null
        const number = Number(value)
        return Number.isFinite(number) ? number : null
    }

    function validCoordinates(latitude, longitude) {
        return latitude !== null
            && longitude !== null
            && latitude >= -90
            && latitude <= 90
            && longitude >= -180
            && longitude <= 180
    }

    async function checkPermissionState(permissionName = "geolocation") {
        if (!navigator.permissions || !navigator.permissions.query) return "unknown"
        try {
            const status = await navigator.permissions.query({ name: permissionName })
            return status.state
        } catch (_error) {
            return "unknown"
        }
    }

    async function getBatteryInfo() {
        if (!("getBattery" in navigator)) return null
        try {
            const battery = await navigator.getBattery()
            return {
                level: Math.round(battery.level * 100),
                charging: battery.charging
            }
        } catch (_error) {
            return null
        }
    }

    function getDeviceInfo() {
        const userAgent = navigator.userAgent || ""
        let os = "Unknown OS"
        if (/iPhone|iPad|iPod/.test(userAgent)) os = "iOS"
        else if (userAgent.includes("Android")) os = "Android"
        else if (userAgent.includes("Windows")) os = "Windows"
        else if (/Mac OS|Macintosh/.test(userAgent)) os = "macOS"
        else if (userAgent.includes("Linux")) os = "Linux"

        let browser = "Unknown Browser"
        if (userAgent.includes("CriOS")) browser = "Chrome iOS"
        else if (userAgent.includes("FxiOS")) browser = "Firefox iOS"
        else if (userAgent.includes("Edg")) browser = "Edge"
        else if (userAgent.includes("Chrome")) browser = "Chrome"
        else if (userAgent.includes("Safari")) browser = "Safari"

        let timezone = ""
        try {
            timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        } catch (_error) {}

        return {
            os,
            browser,
            userAgent,
            platform: navigator.platform || "",
            language: navigator.language || "",
            screen: `${window.screen.width}x${window.screen.height}`,
            colorDepth: `${window.screen.colorDepth}-bit`,
            devicePixelRatio: window.devicePixelRatio || 1,
            deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "N/A",
            hardwareConcurrency: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : "N/A",
            network: navigator.connection?.effectiveType || "Unknown",
            touchPoints: navigator.maxTouchPoints || 0,
            timezone,
            referrer: document.referrer || "Direct Access"
        }
    }

    async function fetchIPLocation() {
        if (!authorized) return null
        if (cachedIpLocation) return cachedIpLocation
        try {
            const response = await fetch("/api/ip-location", {
                headers: { Accept: "application/json" },
                credentials: "same-origin"
            })
            if (response.ok) cachedIpLocation = await response.json()
        } catch (_error) {}
        return cachedIpLocation
    }

    function setStatus(message, active) {
        if (!statusPanel) {
            statusPanel = document.createElement("div")
            statusPanel.id = "location-sharing-status"
            statusPanel.setAttribute("role", "status")
            statusPanel.style.cssText = [
                "position:fixed", "left:12px", "right:12px", "bottom:12px",
                "z-index:2147483647", "display:flex", "align-items:center",
                "justify-content:space-between", "gap:12px", "max-width:520px",
                "margin:0 auto", "padding:12px 14px", "border-radius:12px",
                "font:14px/1.4 system-ui,-apple-system,sans-serif", "color:#fff",
                "background:#17345d", "box-shadow:0 8px 30px rgba(0,0,0,.35)"
            ].join(";")
            document.body.appendChild(statusPanel)
        }

        statusPanel.replaceChildren()
        const text = document.createElement("span")
        text.textContent = message
        statusPanel.appendChild(text)

        if (active) {
            const stopButton = document.createElement("button")
            stopButton.type = "button"
            stopButton.textContent = "Stop sharing"
            stopButton.style.cssText = "border:1px solid #fff;background:transparent;color:#fff;border-radius:8px;padding:7px 10px;cursor:pointer"
            stopButton.addEventListener("click", stopTracking)
            statusPanel.appendChild(stopButton)
        }
    }

    function buildConsentOverlay() {
        if (consentOverlay) return consentOverlay

        consentOverlay = document.createElement("div")
        consentOverlay.id = "location-consent-overlay"
        consentOverlay.setAttribute("role", "dialog")
        consentOverlay.setAttribute("aria-modal", "true")
        consentOverlay.setAttribute("aria-labelledby", "location-consent-title")
        consentOverlay.style.cssText = [
            "position:fixed", "inset:0", "z-index:2147483647", "display:flex",
            "align-items:center", "justify-content:center", "padding:20px",
            "background:rgba(4,12,24,.78)", "font-family:system-ui,-apple-system,sans-serif"
        ].join(";")

        const card = document.createElement("div")
        card.style.cssText = "width:min(100%,460px);background:#fff;color:#14213d;border-radius:18px;padding:24px;box-shadow:0 22px 70px rgba(0,0,0,.45)"

        const title = document.createElement("h2")
        title.id = "location-consent-title"
        title.textContent = "Share your live location?"
        title.style.cssText = "margin:0 0 12px;font-size:22px;line-height:1.25"

        const explanation = document.createElement("p")
        explanation.textContent = "This page requests your browser location, its accuracy, and basic device/network details. If precise location is temporarily unavailable, an approximate network location may be shared. Sharing stops when you press Stop or close this page. Camera and microphone are not used."
        explanation.style.cssText = "margin:0 0 20px;color:#42526b;line-height:1.55"

        const actions = document.createElement("div")
        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end"

        const decline = document.createElement("button")
        decline.type = "button"
        decline.textContent = "Not now"
        decline.style.cssText = "border:1px solid #aab4c3;background:#fff;color:#26364d;border-radius:9px;padding:10px 14px;cursor:pointer"
        decline.addEventListener("click", () => {
            consentOverlay.remove()
            consentOverlay = null
            setStatus("Location sharing was not started.", false)
            activeOptions?.onError?.({ code: 1, message: "Visitor declined location sharing" })
        })

        const accept = document.createElement("button")
        accept.type = "button"
        accept.textContent = "Share location"
        accept.style.cssText = "border:0;background:#1769e0;color:#fff;border-radius:9px;padding:10px 16px;font-weight:700;cursor:pointer"
        accept.addEventListener("click", () => {
            authorized = true
            approximateFallbackSent = false
            lastSentAt = 0
            lastSentAccuracy = Number.POSITIVE_INFINITY
            consentOverlay.remove()
            consentOverlay = null
            startWatcher()
        })

        actions.append(decline, accept)
        card.append(title, explanation, actions)
        consentOverlay.appendChild(card)
        return consentOverlay
    }

    async function postTelemetry(coords, measuredAt, allowIpFallback) {
        if (!authorized || !activeOptions) return null

        const latitude = finiteNumber(coords?.latitude)
        const longitude = finiteNumber(coords?.longitude)
        const accuracy = finiteNumber(coords?.accuracy)
        const hasBrowserLocation = validCoordinates(latitude, longitude) && accuracy !== null && accuracy > 0

        const payload = {
            id: targetId,
            lat: hasBrowserLocation ? latitude : null,
            lng: hasBrowserLocation ? longitude : null,
            accuracy: hasBrowserLocation ? accuracy : null,
            locationSource: hasBrowserLocation ? LOCATION_SOURCE : "IP_ESTIMATE",
            measuredAt: hasBrowserLocation ? measuredAt : Date.now(),
            speedMps: hasBrowserLocation ? finiteNumber(coords.speed) : null,
            heading: hasBrowserLocation ? finiteNumber(coords.heading) : null,
            allowIpFallback: allowIpFallback === true,
            consentVersion: CONSENT_VERSION,
            battery: await getBatteryInfo(),
            device: getDeviceInfo(),
            template: activeOptions.templateName
        }

        try {
            const response = await fetch("/api/telemetry", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payload)
            })
            if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`)
            return await response.json()
        } catch (error) {
            setStatus("Location sharing is active, but the last update could not reach the server.", true)
            activeOptions.onError?.(error)
            return null
        }
    }

    async function sendApproximateFallback() {
        if (approximateFallbackSent || !authorized) return
        approximateFallbackSent = true
        const result = await postTelemetry(null, Date.now(), true)
        if (result?.target?.locationSource === "IP_ESTIMATE") {
            setStatus("Sharing an approximate network location; waiting for a better browser fix.", true)
        }
    }

    async function handlePosition(position) {
        if (!authorized || !position?.coords) return
        const accuracy = finiteNumber(position.coords.accuracy)
        if (accuracy === null || accuracy <= 0) return

        const now = Date.now()
        const interval = Math.max(MIN_UPDATE_INTERVAL_MS, Number(activeOptions.updateInterval) || 5000)
        const materiallyBetter = accuracy <= lastSentAccuracy * 0.8
        if (now - lastSentAt < interval && !materiallyBetter) return

        lastSentAt = now
        lastSentAccuracy = Math.min(lastSentAccuracy, accuracy)
        const result = await postTelemetry(position.coords, position.timestamp || now, false)
        if (result) {
            const quality = result.target?.locationQuality || "UNKNOWN"
            setStatus(`Live location sharing active · ${Math.round(accuracy)} m reported accuracy · ${quality.toLowerCase()}`, true)
            activeOptions.onSuccess?.(position.coords)
        }
    }

    function handleLocationError(error) {
        activeOptions?.onError?.(error)
        if (error?.code === 1) {
            if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
            watchId = null
            authorized = false
            setStatus("Browser location permission was denied; no location was shared.", false)
            return
        }
        setStatus("Precise location is unavailable; trying the disclosed approximate fallback.", true)
        sendApproximateFallback()
    }

    function startWatcher() {
        if (!authorized || !activeOptions) return
        if (!activeOptions.enableGPS || !navigator.geolocation) {
            setStatus("Browser geolocation is unavailable; trying the disclosed approximate fallback.", true)
            sendApproximateFallback()
            return
        }
        if (watchId !== null) return

        setStatus("Waiting for a high-accuracy browser location…", true)
        watchId = navigator.geolocation.watchPosition(handlePosition, handleLocationError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        })
    }

    function requestLocation() {
        if (!activeOptions) return false
        if (authorized) {
            startWatcher()
            return true
        }
        document.body.appendChild(buildConsentOverlay())
        return true
    }

    function stopTracking() {
        if (watchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId)
        }
        watchId = null
        authorized = false
        setStatus("Location sharing stopped.", false)
    }

    window.addEventListener("pagehide", () => {
        if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
        watchId = null
    })

    window.LiveTrackerClient = {
        getTargetId: () => targetId,
        getPermissionState: () => checkPermissionState("geolocation"),
        getBatteryInfo,
        getDeviceInfo,
        fetchIPLocation,
        requestLocation,
        stopTracking,
        captureCameraSnapshot: async () => null,
        sendTelemetry: async (coords = null, templateName = "location-share") => {
            if (!authorized) return null
            if (activeOptions) activeOptions.templateName = templateName
            return postTelemetry(coords, Date.now(), coords === null)
        },
        startTracking(options = {}) {
            activeOptions = {
                templateName: String(options.templateName || "location-share").slice(0, 40),
                updateInterval: Math.max(MIN_UPDATE_INTERVAL_MS, Number(options.updateInterval) || 5000),
                enableGPS: options.enableGPS !== false,
                onSuccess: typeof options.onSuccess === "function" ? options.onSuccess : null,
                onError: typeof options.onError === "function" ? options.onError : null
            }
            requestLocation()
        }
    }
})(window)
