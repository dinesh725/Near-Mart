import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Mapbox Token ─────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

// ── Route Cache & Throttle ───────────────────────────────────────────────────
const routeCache = new Map();
const CACHE_MAX = 50;
let lastRouteRequest = 0;
const ROUTE_MIN_INTERVAL_MS = 2000;
const REROUTE_DISTANCE_M = 20; // re-route when rider moves > 20m from last route fetch

function routeCacheKey(pickup, drop) {
    return `${pickup.lat.toFixed(4)},${pickup.lng.toFixed(4)}-${drop.lat.toFixed(4)},${drop.lng.toFixed(4)}`;
}

function haversineFallback(a, b) {
    if (!a?.lat || !b?.lat) return Infinity;
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function fetchMapboxRoute(pickup, drop, retries = 2) {
    if (!MAPBOX_TOKEN) return null;
    const key = routeCacheKey(pickup, drop);
    if (routeCache.has(key)) return routeCache.get(key);

    const now = Date.now();
    const wait = ROUTE_MIN_INTERVAL_MS - (now - lastRouteRequest);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRouteRequest = Date.now();

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
                `${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}` +
                `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
            const response = await fetch(url);

            if (response.status === 429) {
                await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 16000)));
                continue;
            }
            if (!response.ok) throw new Error(`Mapbox HTTP ${response.status}`);

            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const result = { geometry: route.geometry, distance: route.distance, duration: route.duration };
                routeCache.set(key, result);
                if (routeCache.size > CACHE_MAX) routeCache.delete(routeCache.keys().next().value);
                return result;
            }
        } catch (err) {
            if (attempt === retries) console.warn('[Map] Mapbox route failed:', err.message);
        }
    }
    return null;
}

// ── Smooth Marker Animation ──────────────────────────────────────────────────
function animateMarker(marker, from, to, durationMs = 1200) {
    const startTime = performance.now();
    let animId;
    function frame(now) {
        const t = Math.min((now - startTime) / durationMs, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out quad
        const lat = from[1] + (to[1] - from[1]) * eased;
        const lng = from[0] + (to[0] - from[0]) * eased;
        marker.setLngLat([lng, lat]);
        if (t < 1) animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
}

// ── Create marker DOM element ────────────────────────────────────────────────
function createMarkerEl(emoji, bgColor, pulse = false) {
    const el = document.createElement('div');
    el.style.cssText = `
        width: 40px; height: 40px; border-radius: 50%;
        background: ${bgColor}; display: flex; align-items: center; justify-content: center;
        font-size: 22px; border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        cursor: pointer; position: relative;
    `;
    el.textContent = emoji;
    if (pulse) {
        const pulseEl = document.createElement('div');
        pulseEl.style.cssText = `
            position: absolute; width: 100%; height: 100%; border-radius: 50%;
            background: ${bgColor}; top: 0; left: 0; z-index: -1;
            animation: mapbox-pulse 1.5s infinite ease-out;
        `;
        el.appendChild(pulseEl);
    }
    return el;
}

// ── Inject pulse animation CSS once ──────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('mapbox-pulse-css')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'mapbox-pulse-css';
    styleEl.textContent = `
        @keyframes mapbox-pulse {
            0% { transform: scale(1); opacity: 0.8; }
            100% { transform: scale(2.5); opacity: 0; }
        }
        .mapboxgl-canvas { outline: none; }
        .mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-bottom-left { display: none !important; }
    `;
    document.head.appendChild(styleEl);
}

// ── Main DeliveryMap Component ───────────────────────────────────────────────
const DeliveryMap = ({ pickupLocation, dropLocation, liveLocation, precalculatedRoute, onRouteCalculated }) => {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const mapInitialized = useRef(false);
    const pickupMarkerRef = useRef(null);
    const dropMarkerRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const prevDriverPos = useRef(null);
    const animCancelRef = useRef(null);
    const initialBoundsSet = useRef(false);
    const lastRouteRiderPos = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    const onRouteCalcRef = useRef(onRouteCalculated);
    useEffect(() => { onRouteCalcRef.current = onRouteCalculated; }, [onRouteCalculated]);

    const center = useMemo(() => {
        if (pickupLocation?.lat) return [pickupLocation.lng, pickupLocation.lat];
        if (liveLocation?.lat) return [liveLocation.lng, liveLocation.lat];
        return [78.9629, 20.5937]; // India center
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally memoized once to prevent map re-center

    // ── Initialize Map (ONCE) ────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current || mapInitialized.current) return;

        if (!MAPBOX_TOKEN) {
            console.warn('[DeliveryMap] REACT_APP_MAPBOX_TOKEN not set');
            return;
        }

        // CRITICAL: clear container before Mapbox init to prevent "should be empty" error
        containerRef.current.innerHTML = '';
        mapInitialized.current = true;
        mapboxgl.accessToken = MAPBOX_TOKEN;

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: center,
            zoom: 14,
            attributionControl: false,
            pitchWithRotate: false,
            fadeDuration: 0,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.on('load', () => {
            mapRef.current = map;
            setMapReady(true);
            console.log('[Map] Mapbox loaded successfully');
        });

        return () => {
            setMapReady(false);
            mapRef.current = null;
            mapInitialized.current = false;
            // Clean up markers
            [pickupMarkerRef, dropMarkerRef, driverMarkerRef].forEach(ref => {
                if (ref.current) { ref.current.remove(); ref.current = null; }
            });
            if (animCancelRef.current) animCancelRef.current();
            initialBoundsSet.current = false;
            lastRouteRiderPos.current = null;
            prevDriverPos.current = null;
            map.remove();
        };
    }, [center]);

    // ── Pickup Marker ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current || !pickupLocation?.lat) return;
        if (pickupMarkerRef.current) {
            pickupMarkerRef.current.setLngLat([pickupLocation.lng, pickupLocation.lat]);
        } else {
            const el = createMarkerEl('🏪', '#4CAF50');
            pickupMarkerRef.current = new mapboxgl.Marker({ element: el })
                .setLngLat([pickupLocation.lng, pickupLocation.lat])
                .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML('<strong>Pickup</strong>'))
                .addTo(mapRef.current);
        }
    }, [mapReady, pickupLocation?.lat, pickupLocation?.lng]);

    // ── Drop Marker ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current || !dropLocation?.lat) return;
        if (dropMarkerRef.current) {
            dropMarkerRef.current.setLngLat([dropLocation.lng, dropLocation.lat]);
        } else {
            const el = createMarkerEl('📍', '#F44336');
            dropMarkerRef.current = new mapboxgl.Marker({ element: el })
                .setLngLat([dropLocation.lng, dropLocation.lat])
                .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML('<strong>Delivery</strong>'))
                .addTo(mapRef.current);
        }
    }, [mapReady, dropLocation?.lat, dropLocation?.lng]);

    // ── Live Driver Marker (animated) ────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current || !liveLocation?.lat) return;
        const newPos = [liveLocation.lng, liveLocation.lat];

        if (driverMarkerRef.current) {
            // Cancel any running animation
            if (animCancelRef.current) animCancelRef.current();
            const prevPos = prevDriverPos.current || newPos;
            animCancelRef.current = animateMarker(driverMarkerRef.current, prevPos, newPos, 1200);
        } else {
            const el = createMarkerEl('🛵', '#2196F3', true);
            driverMarkerRef.current = new mapboxgl.Marker({ element: el })
                .setLngLat(newPos)
                .addTo(mapRef.current);
        }
        prevDriverPos.current = newPos;
    }, [mapReady, liveLocation?.lat, liveLocation?.lng]);

    // ── Route Layer ──────────────────────────────────────────────────────────
    const setRouteOnMap = useCallback((geometry) => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        try {
            if (map.getSource('route')) {
                map.getSource('route').setData({ type: 'Feature', geometry });
            } else {
                map.addSource('route', {
                    type: 'geojson',
                    data: { type: 'Feature', geometry },
                });
                map.addLayer({
                    id: 'route-line',
                    type: 'line',
                    source: 'route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#4A90D9', 'line-width': 5, 'line-opacity': 0.85 },
                });
            }
        } catch (err) {
            console.warn('[Map] Failed to set route:', err.message);
        }
    }, []);

    // ── Fetch Route ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current || !pickupLocation?.lat || !dropLocation?.lat) return;
        let cancelled = false;

        const fetchRoute = async () => {
            // Try precalculated route first
            if (precalculatedRoute) {
                try {
                    const parsed = typeof precalculatedRoute === 'string'
                        ? JSON.parse(precalculatedRoute) : precalculatedRoute;
                    let geojson;
                    if (Array.isArray(parsed)) {
                        geojson = {
                            type: 'LineString',
                            coordinates: parsed.map(p => Array.isArray(p) ? [p[1], p[0]] : [p.lng, p.lat]),
                        };
                    } else if (parsed.coordinates) {
                        geojson = parsed;
                    }
                    if (geojson && !cancelled) {
                        setRouteOnMap(geojson);
                        return;
                    }
                } catch { /* fallthrough to Mapbox */ }
            }

            // Try Mapbox Directions
            try {
                const result = await fetchMapboxRoute(pickupLocation, dropLocation);
                if (result && !cancelled) {
                    setRouteOnMap(result.geometry);
                    lastRouteRiderPos.current = liveLocation || pickupLocation;
                    if (onRouteCalcRef.current) {
                        onRouteCalcRef.current({ distance: result.distance, duration: result.duration });
                    }
                    return;
                }
            } catch (err) {
                console.warn('[Map] Route fetch failed:', err.message);
            }

            // Fallback: straight line
            if (!cancelled) {
                const dist = haversineFallback(pickupLocation, dropLocation);
                setRouteOnMap({
                    type: 'LineString',
                    coordinates: [
                        [pickupLocation.lng, pickupLocation.lat],
                        [dropLocation.lng, dropLocation.lat],
                    ],
                });
                if (onRouteCalcRef.current) {
                    onRouteCalcRef.current({ distance: dist, duration: dist / 5.5 });
                }
            }
        };

        fetchRoute();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, pickupLocation?.lat, pickupLocation?.lng, dropLocation?.lat, dropLocation?.lng, precalculatedRoute, setRouteOnMap]);

    // ── Dynamic re-route when rider moves > 20m ──────────────────────────────
    useEffect(() => {
        if (!mapReady || !liveLocation?.lat || !dropLocation?.lat) return;
        const lastPos = lastRouteRiderPos.current;
        if (!lastPos) { lastRouteRiderPos.current = liveLocation; return; }

        const distMoved = haversineFallback(lastPos, liveLocation);
        if (distMoved < REROUTE_DISTANCE_M) return;

        let cancelled = false;
        (async () => {
            try {
                const result = await fetchMapboxRoute(liveLocation, dropLocation);
                if (result && !cancelled) {
                    setRouteOnMap(result.geometry);
                    lastRouteRiderPos.current = liveLocation;
                    if (onRouteCalcRef.current) {
                        onRouteCalcRef.current({ distance: result.distance, duration: result.duration });
                    }
                }
            } catch { /* ignore re-route failures */ }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, liveLocation?.lat, liveLocation?.lng, dropLocation?.lat, dropLocation?.lng, setRouteOnMap]);

    // ── Fit Bounds (once) ────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current || initialBoundsSet.current) return;
        const points = [pickupLocation, dropLocation, liveLocation].filter(p => p?.lat);
        if (points.length < 2) return;

        const bounds = new mapboxgl.LngLatBounds();
        points.forEach(p => bounds.extend([p.lng, p.lat]));
        mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
        initialBoundsSet.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, pickupLocation?.lat, dropLocation?.lat, liveLocation?.lat]);

    // ── No token fallback ────────────────────────────────────────────────────
    if (!MAPBOX_TOKEN) {
        return (
            <div style={{
                width: '100%', height: '100%', minHeight: '300px', backgroundColor: '#1a1a2e',
                borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#999', fontSize: 14, textAlign: 'center', padding: 20,
            }}>
                <div>🗺️ Map unavailable<br /><small>Mapbox token not configured</small></div>
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{
            width: '100%', height: '100%', minHeight: '300px',
            backgroundColor: '#1a1a2e', borderRadius: '12px', overflow: 'hidden',
        }} />
    );
};

export default React.memo(DeliveryMap);
