/**
 * Geocoding & Routing Service
 * Phase-3 Upgrade: Points to Google Maps SDK instead of Mapbox
 */
const { reverseGeocode, geocodeAddress, getAccurateRoute, haversine } = require("./googleMapsService");

/**
 * Generate driving route between two points using Google Directions API
 */
async function generateRoute(pickup, drop) {
    return await getAccurateRoute(pickup, drop);
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
