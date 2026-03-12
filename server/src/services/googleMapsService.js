/**
 * Google Maps Directions, Distance Matrix & Geocoding Service
 * Phase-3 Upgrade: Real road networks, routing accuracy, and ETA.
 */
const config = require("../config");
const logger = require("../utils/logger");
const { haversine } = require("../utils/geo");

const GOOGLE_MAPS_BASE = "https://maps.googleapis.com/maps/api";

// ── In-memory LRU Route Cache ────────────────────────────────────────────────
const routeCache = new Map();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cacheKey(a, b, type = "route") {
    const aLat = parseFloat(a.lat).toFixed(3);
    const aLng = parseFloat(a.lng).toFixed(3);
    const bLat = parseFloat(b.lat).toFixed(3);
    const bLng = parseFloat(b.lng).toFixed(3);
    return `${type}_${aLat},${aLng}-${bLat},${bLng}`;
}

function cacheGet(key) {
    const entry = routeCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { routeCache.delete(key); return null; }
    return entry.data;
}

function cacheSet(key, data) {
    if (routeCache.size >= CACHE_MAX) {
        const oldest = routeCache.keys().next().value;
        routeCache.delete(oldest);
    }
    routeCache.set(key, { data, ts: Date.now() });
}

// ── Throttle ─────────────────────────────────────────────────────────────────
let lastRequestMs = 0;
const MIN_INTERVAL_MS = 200; // 5 req/sec limit to protect billing

async function throttle() {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestMs);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestMs = Date.now();
}

/**
 * Get accurate route using Google Directions API.
 * Falls back to Haversine if API fails or keys are missing.
 */
async function getAccurateRoute(pickup, drop) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const cacheK = cacheKey(pickup, drop, "directions");

    const cached = cacheGet(cacheK);
    if (cached) return cached;

    if (!key) {
        // Silent fallback (prevents logs spam if explicitly not configured)
        const dist = haversine(pickup, drop);
        return {
            distance: dist,
            duration: dist / 4.5, // estimate 4.5 m/s (~16 km/h) city traffic
            polyline: null,
            source: "haversine",
        };
    }

    try {
        await throttle();
        const url = `${GOOGLE_MAPS_BASE}/directions/json?origin=${pickup.lat},${pickup.lng}&destination=${drop.lat},${drop.lng}&mode=driving&key=${key}`;
        
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Google Maps HTTP ${res.status}`);

        const data = await res.json();
        if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
            throw new Error(`Directions API Error: ${data.status}`);
        }

        const route = data.routes[0];
        const leg = route.legs[0];

        const result = {
            distance: leg.distance.value, // meters
            duration: leg.duration.value, // seconds
            polyline: route.overview_polyline.points,
            source: "google_directions",
        };

        cacheSet(cacheK, result);
        return result;
    } catch (err) {
        logger.error("[GoogleMaps] Directions API failed, using haversine fallback", { error: err.message });
        const dist = haversine(pickup, drop);
        return {
            distance: dist,
            duration: dist / 4.5,
            polyline: null,
            source: "haversine_fallback",
        };
    }
}

/**
 * Fast distance/ETA comparison for multiple riders (Distance Matrix API).
 */
async function getDistanceMatrix(origins, destination) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key || origins.length === 0) {
        return origins.map(orig => ({
            distance: haversine(orig, destination),
            duration: haversine(orig, destination) / 4.5,
            status: "OK_HAVERSINE"
        }));
    }

    try {
        await throttle();
        const originsStr = origins.map(o => `${o.lat},${o.lng}`).join("|");
        const destStr = `${destination.lat},${destination.lng}`;
        const url = `${GOOGLE_MAPS_BASE}/distancematrix/json?origins=${originsStr}&destinations=${destStr}&departure_time=now&key=${key}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.status !== "OK") throw new Error(`Distance Matrix Error: ${data.status}`);

        return data.rows.map((row, i) => {
            const element = row.elements[0];
            if (element.status !== "OK") {
                const dist = haversine(origins[i], destination);
                return { distance: dist, duration: dist / 4.5, status: "FALLBACK" };
            }
            return {
                distance: element.distance.value,
                duration: element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value,
                status: "OK"
            };
        });
    } catch (err) {
        logger.error("[GoogleMaps] Distance Matrix API failed", { error: err.message });
        return origins.map(orig => ({
            distance: haversine(orig, destination),
            duration: haversine(orig, destination) / 4.5,
            status: "OK_HAVERSINE"
        }));
    }
}

async function reverseGeocode(lat, lng) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
        await throttle();
        const url = `${GOOGLE_MAPS_BASE}/geocode/json?latlng=${lat},${lng}&key=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        
        if (data.status === "OK" && data.results.length > 0) {
            return data.results[0].formatted_address;
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (err) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

async function geocodeAddress(address) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;

    try {
        await throttle();
        const q = encodeURIComponent(address);
        const url = `${GOOGLE_MAPS_BASE}/geocode/json?address=${q}&components=country:IN&key=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        
        if (data.status === "OK" && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            return {
                lat: loc.lat,
                lng: loc.lng,
                address: data.results[0].formatted_address,
            };
        }
        return null;
    } catch (err) {
        return null;
    }
}

module.exports = { getAccurateRoute, getDistanceMatrix, reverseGeocode, geocodeAddress, haversine };
