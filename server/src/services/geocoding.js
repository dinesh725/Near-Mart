/**
 * Geocoding & Routing Service
 * Uses Mapbox Geocoding API and Mapbox Directions API
 * Falls back to haversine when Mapbox token is unavailable
 */

const config = require("../config");
const logger = require("../utils/logger");

const MAPBOX_BASE = "https://api.mapbox.com";

// Haversine distance in meters (fallback when Mapbox unavailable)
function haversine(a, b) {
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Reverse geocode lat/lng → formatted address string
 * Uses Mapbox Geocoding API
 */
async function reverseGeocode(lat, lng) {
    const token = config.mapbox.accessToken;
    if (!token) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
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

/**
 * Forward geocode address string → {lat, lng, address}
 * Uses Mapbox Geocoding API
 */
async function geocodeAddress(address) {
    const token = config.mapbox.accessToken;
    if (!token) return null;

    try {
        const q = encodeURIComponent(address);
        const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${q}.json` +
            `?limit=1&language=en&country=in&access_token=${token}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            const f = data.features[0];
            return { lat: f.center[1], lng: f.center[0], address: f.place_name };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Generate driving route between two points using Mapbox Directions API
 * Uses driving-traffic profile for traffic-aware routing
 */
async function generateRoute(pickup, drop) {
    const token = config.mapbox.accessToken;
    const straightLine = haversine(pickup, drop);
    const fallback = {
        distance: straightLine,
        duration: straightLine / 5.5,
        polyline: null,
        coords: [[pickup.lat, pickup.lng], [drop.lat, drop.lng]],
    };

    if (!token) {
        logger.warn("MAPBOX_ACCESS_TOKEN not set — using haversine fallback for routing");
        return fallback;
    }

    try {
        const url = `${MAPBOX_BASE}/directions/v5/mapbox/driving-traffic/` +
            `${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}` +
            `?geometries=geojson&overview=full&access_token=${token}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) return fallback;

        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const polylineStr = JSON.stringify(coords);

        return {
            distance: route.distance,
            duration: route.duration,
            polyline: polylineStr,
            coords,
        };
    } catch (err) {
        logger.error("Mapbox Directions failed", { error: err.message });
        return fallback;
    }
}

/**
 * Calculate delivery fee based on distance
 */
function calcDeliveryFee(distanceMeters) {
    const km = distanceMeters / 1000;
    if (km <= 2) return 20;
    if (km <= 5) return 30;
    if (km <= 10) return 50;
    return Math.round(30 + (km - 5) * 5);
}

module.exports = { reverseGeocode, geocodeAddress, generateRoute, calcDeliveryFee, haversine };
