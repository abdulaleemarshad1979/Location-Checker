"use strict"

const { createClient } = require("@supabase/supabase-js")
const fs = require("fs")
const path = require("path")

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

let supabase = null
if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey)
        console.log("[Supabase] Client initialized successfully.")
    } catch (e) {
        console.warn("[Supabase] Initialization warning:", e.message)
    }
} else {
    console.log("[Supabase] SUPABASE_URL / SUPABASE_KEY not provided in environment. Using disk-backed persistent storage.")
}

const LOCAL_DATA_PATH = path.join(__dirname, "data", "targets.json")

function ensureLocalDir() {
    const dir = path.dirname(LOCAL_DATA_PATH)
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true })
        } catch (_e) {}
    }
}

async function loadAllTargets() {
    const map = new Map()

    if (supabase) {
        try {
            const { data, error } = await supabase.from("targets").select("*")
            if (!error && Array.isArray(data)) {
                for (const row of data) {
                    const targetObj = typeof row.data === "object" && row.data !== null ? row.data : row
                    if (targetObj && targetObj.id) {
                        map.set(targetObj.id, targetObj)
                    }
                }
                console.log(`[Supabase] Loaded ${map.size} persistent target(s).`)
                return map
            } else if (error) {
                console.warn("[Supabase] Query error:", error.message)
            }
        } catch (err) {
            console.warn("[Supabase] Load error:", err.message)
        }
    }

    try {
        ensureLocalDir()
        if (fs.existsSync(LOCAL_DATA_PATH)) {
            const content = fs.readFileSync(LOCAL_DATA_PATH, "utf8")
            const json = JSON.parse(content)
            if (json && typeof json === "object") {
                Object.entries(json).forEach(([id, target]) => {
                    if (target && typeof target === "object") {
                        map.set(id, target)
                    }
                })
                console.log(`[Local Storage] Loaded ${map.size} persistent target(s).`)
            }
        }
    } catch (err) {
        console.warn("[Local Storage] Error reading file:", err.message)
    }

    return map
}

function persistTarget(target) {
    if (!target || !target.id) return

    if (supabase) {
        try {
            const row = {
                id: target.id,
                lat: target.lat,
                lng: target.lng,
                accuracy: target.accuracy,
                location_source: target.locationSource,
                location_type: target.locationType,
                location_quality: target.locationQuality,
                last_seen: target.lastSeen || Date.now(),
                template: target.template || "location-share",
                data: target,
                updated_at: new Date().toISOString()
            }
            supabase.from("targets").upsert(row, { onConflict: "id" }).then(({ error }) => {
                if (error) console.warn("[Supabase] Upsert warning:", error.message)
            }).catch(e => console.warn("[Supabase] Upsert failed:", e.message))
        } catch (_e) {}
    }

    try {
        ensureLocalDir()
        setTimeout(() => {
            try {
                if (global._TARGETS_MAP) {
                    const allTargets = Object.fromEntries(global._TARGETS_MAP.entries())
                    fs.writeFileSync(LOCAL_DATA_PATH, JSON.stringify(allTargets, null, 2))
                }
            } catch (_e) {}
        }, 100)
    } catch (_e) {}
}

function removeTarget(id) {
    if (!id) return

    if (supabase) {
        try {
            supabase.from("targets").delete().eq("id", id).then(({ error }) => {
                if (error) console.warn("[Supabase] Delete warning:", error.message)
            }).catch(() => {})
        } catch (_e) {}
    }

    try {
        ensureLocalDir()
        if (global._TARGETS_MAP) {
            const allTargets = Object.fromEntries(global._TARGETS_MAP.entries())
            fs.writeFileSync(LOCAL_DATA_PATH, JSON.stringify(allTargets, null, 2))
        }
    } catch (_e) {}
}

module.exports = {
    supabase,
    loadAllTargets,
    persistTarget,
    removeTarget
}
