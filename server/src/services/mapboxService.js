/**
 * Mapbox Directions & Geocoding Service
 * Replaces OSRM / Nominatim with Mapbox APIs
 */
const config = require("../config");
const logger = require("../utils/logger");
const { haversine } = require("../utils/geo");

const MAPBOX_BASE = "https://api.mapbox.com";

// ── In-memory LRU Route Cache ────────────────────────────────────────────────
const routeCache = new Map();
const CACHE_MAX = 100;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cacheKey(a, b) {
    return `${a.lat.toFixed(4)},${a.lng.toFixed(4)}-${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
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
const MIN_INTERVAL_MS = 1000;

async function throttle() {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestMs);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestMs = Date.now();
}



// ── Get Route (traffic-aware) ────────────────────────────────────────────────
async function getRoute(pickup, drop) {
    const token = config.mapbox.accessToken;
    const key = cacheKey(pickup, drop);

    // Check cache
    const cached = cacheGet(key);
    if (cached) return cached;

    // Fallback if no token
    if (!token) {
        logger.warn("MAPBOX_ACCESS_TOKEN not set — using haversine fallback");
        const dist = haversine(pickup, drop);
        return {
            distance: dist,
            duration: dist / 5.5,
            polyline: null,
            coords: [[pickup.lat, pickup.lng], [drop.lat, drop.lng]],
            source: "haversine",
        };
    }

    await throttle();

    try {
        const url = `${MAPBOX_BASE}/directions/v5/mapbox/driving-traffic/` +
            `${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}` +
            `?geometries=geojson&overview=full&annotations=duration,distance&access_token=${token}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);

        const data = await res.json();
        if (!data.routes || data.routes.length === 0) throw new Error("No routes returned");

        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

        const result = {
            distance: route.distance,
            duration: route.duration,
            polyline: JSON.stringify(coords),
            coords,
            geometry: route.geometry,
            source: "mapbox",
        };

        cacheSet(key, result);
        return result;
    } catch (err) {
        logger.error("Mapbox Directions failed, using haversine", { error: err.message });
        const dist = haversine(pickup, drop);
        return {
            distance: dist,
            duration: dist / 5.5,
            polyline: null,
            coords: [[pickup.lat, pickup.lng], [drop.lat, drop.lng]],
            source: "haversine",
        };
    }
}

// ── Reverse Geocode ──────────────────────────────────────────────────────────
async function reverseGeocode(lat, lng) {
    const token = config.mapbox.accessToken;
    if (!token) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
        await throttle();
        const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${lng},${lat}.json` +
            `?limit=1&language=en&access_token=${token}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// ── Forward Geocode ──────────────────────────────────────────────────────────
async function geocodeAddress(address) {
    const token = config.mapbox.accessToken;
    if (!token) return null;

    try {
        await throttle();
        const q = encodeURIComponent(address);
        const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${q}.json` +
            `?limit=1&language=en&country=in&access_token=${token}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            const f = data.features[0];
            return {
                lat: f.center[1],
                lng: f.center[0],
                address: f.place_name,
            };
        }
        return null;
    } catch {
        return null;
    }
}

module.exports = { getRoute, reverseGeocode, geocodeAddress, haversine };
