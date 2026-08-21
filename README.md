# NETRA Location Assistance

NETRA is a consent-based browser location-sharing demo with an authenticated operator dashboard. It is intended for authorized testing and lawful public-safety workflows—not covert tracking.

## Current behaviour

- The recipient sees an official location-assistance page and a plain-language disclosure.
- No telemetry is sent until the recipient chooses to continue and accepts the location prompt.
- One high-accuracy `watchPosition` watcher runs while the page is open.
- Browser coordinates include the device-reported accuracy and measurement time.
- A disclosed IP/network estimate is used only if the visitor consented and browser positioning is temporarily unavailable.
- Fresh, accurate readings are protected from being replaced by stale or much poorer fixes.
- The map distinguishes browser geolocation from an approximate IP estimate, accepts zero-valued coordinates, shows an accuracy circle, and converts speed from m/s to km/h.
- Camera and microphone collection are disabled.

Browsers cannot bypass location permission. Results depend on the phone, available satellite/Wi-Fi/cell signals, HTTPS, browser settings, and whether the page remains open.

## Local setup

```bash
git clone https://github.com/abdulaleemarshad1979/Location-Checker.git
cd Location-Checker
npm ci
npm test
npm start
```

Open `http://localhost:6589`. The repository still has development-only default credentials; set unique credentials and a strong random token before any controlled deployment.

## Deployment notes

`vercel.json` includes `views/**` and `public/**` in the function bundle. However, the current in-memory target store is suitable only for a single-process demonstration. A real deployment needs durable encrypted storage, signed case links, role-based access, audit logs, retention/deletion controls, rate limits, monitoring, and an approved legal operating procedure.

For a long-running SP-office installation, deploy behind HTTPS on a controlled Node server and validate the workflow with privacy, legal, and information-security officers before operational use.

## Verification

```bash
npm test
npm run check
```

The included tests cover coordinate validation, zero coordinates, location source priority, stale readings, accuracy degradation, speed units, and target-ID validation.

## Legal and ethical use

Use this project only with explicit authorization, informed consent, purpose limitation, and applicable legal process. Do not impersonate third-party services or use deceptive links to obtain location data.
