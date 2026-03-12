/**
 * Shared geospatial utility — single source of truth for Haversine calculations.
 * Used across dispatch engine, routing services, order routes, and WebSocket tracking.
 */

/**
 * Haversine distance between two { lat, lng } points.
 * @returns {number} Distance in meters
 */
function haversine(a, b) {
    if (!a || !b) return 0;
    const R = 6371e3; // Earth radius in meters
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Haversine distance returning Infinity for null inputs (dispatch-safe variant).
 * @returns {number} Distance in meters, or Infinity if inputs are missing
 */
function haversineStrict(a, b) {
    if (!a || !b) return Infinity;
    return haversine(a, b);
}

/**
 * Haversine distance in kilometers.
 * @returns {number} Distance in km
 */
function haversineKm(coords1, coords2) {
    if (!coords1 || !coords2) return 0;
    const toRad = x => (x * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLng = toRad(coords2.lng - coords1.lng);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { haversine, haversineStrict, haversineKm };
