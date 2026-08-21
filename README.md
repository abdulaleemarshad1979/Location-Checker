# NETRA - THE EYE
### Advanced Telemetry, Location & Surveillance Operations Platform

> ⚠️ **DISCLAIMER: FOR EDUCATIONAL & RESEARCH PURPOSES ONLY**
> 
> **NETRA - THE EYE** is developed strictly for **educational, security research, and authorized testing purposes**. It is designed to demonstrate web browser telemetry mechanisms, device permission handling, geolocation APIs, and decoy URL routing in modern web applications.
> 
> **Unauthorized tracking of individuals without explicit consent is illegal and unethical.** The developer assumes no responsibility or liability for misuse or damage caused by this program.

---

## 👁️ About NETRA - THE EYE

**NETRA** (Sanskrit for *"Eye"*) is a modern web application designed to collect high-fidelity telemetry metrics through customizable decoy pages (YouTube videos, weather forecast pages, or custom site embeds).

---

## 📌 Features

- 📍 **GPS & Geolocation Tracking**: Real-time Leaflet map visualization of target locations.
- 🌐 **Instant IP Geolocation Fallback**: Zero-permission IP lookup (City, Region, Country, Carrier/ISP) for immediate location reporting.
- 🔋 **Mobile Battery Telemetry**: Battery percentage indicator, charging status, and power state monitoring.
- 📱 **Mobile & Device Specifications**: Operating System (Android/iOS), Browser, Screen Resolution, Network Type (4G/Wi-Fi), Memory, and Hardware Cores.
- 📷 **HD Camera Photo Snapshots**: 1080p camera snapshot capture with iOS Safari & Android mobile browser compatibility.
- 🔗 **Universal Decoy Link Generator**:
  - ▶️ **YouTube Video Decoy Player** (`/youtube?v=...`)
  - 🌐 **Any Custom Website Decoy** (`/link?url=...`)
  - 🌦️ **Weather Forecast Decoy** (`/weather`)
  - 🔗 **Custom Media Preview Decoy** (`/custom?...`)
- ⚡ **Vercel & Cloudflare Tunnel Support**: Zero-config deployment via `vercel.json`.

---

## 🚀 Quick Start (Local Setup)

1. Clone repository:
   ```bash
   git clone https://github.com/abdulaleemarshad1979/Location-Checker.git
   cd Location-Checker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start server:
   ```bash
   npm start
   ```

4. Open Admin Dashboard:
   - **Local URL**: `http://localhost:6589`
   - **Default Credentials**: `admin` / `admin`

---

## ⚡ Deployment on Vercel

1. Push code to your GitHub repository.
2. Go to [Vercel Dashboard](https://vercel.com/new).
3. Import your GitHub repository **`Location-Checker`**.
4. Click **Deploy** (Vercel automatically detects `vercel.json`).

---

## ⚖️ Legal Notice

This repository is published for educational demonstration of web technology capabilities. By downloading or using this repository, you agree to comply with all applicable local, national, and international laws regarding digital privacy and consent.