import { useState, useEffect, useRef, useCallback } from 'react';
import socketManager from '../utils/socketManager';

// Haversine distance in meters
function haversineDistance(a, b) {
    if (!a?.lat || !b?.lat) return Infinity;
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── GPS THROTTLE ─────────────────────────────────────────────────────────────
const GPS_EMIT_INTERVAL_MS = 3000; // 3 seconds
const GPS_MIN_DISTANCE_M = 5;    // 5 meters – skip updates if rider barely moved
const GPS_ACCURACY_MAX = 50;      // ignore readings with > 50m accuracy

// ── Location smoothing (Kalman-like simple filter) ───────────────────────────
function smoothLocation(prev, curr) {
    if (!prev) return curr;
    const weight = 0.7; // trust new position more
    return {
        lat: prev.lat * (1 - weight) + curr.lat * weight,
        lng: prev.lng * (1 - weight) + curr.lng * weight,
        heading: curr.heading ?? prev.heading ?? 0,
        speed: curr.speed ?? prev.speed ?? 0,
        accuracy: curr.accuracy,
    };
}

// ── Calculate heading from two points ────────────────────────────────────────
function calcHeading(from, to) {
    if (!from?.lat || !to?.lat) return 0;
    const toRad = d => d * Math.PI / 180;
    const dLng = toRad(to.lng - from.lng);
    const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
    const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
        Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

const useLiveLocation = (orderId, role = 'customer', userId = null) => {
    const [liveLocation, setLiveLocation] = useState(null);
    const [isTracking, setIsTracking] = useState(false);
    const [socketState, setSocketState] = useState('disconnected');
    const watchIdRef = useRef(null);
    const simIntervalRef = useRef(null);
    const lastEmitRef = useRef(0);
    const lastEmittedLocRef = useRef(null);  // separate from lastLocRef — used for distance check
    const lastLocRef = useRef(null);
    const lastMovementTimeRef = useRef(Date.now()); // For Battery Intelligence
    const orderIdRef = useRef(orderId);
    const userIdRef = useRef(userId);
    const locationQueueRef = useRef([]); // Offline buffer for location updates

    // Keep refs fresh
    useEffect(() => { orderIdRef.current = orderId; }, [orderId]);
    useEffect(() => { userIdRef.current = userId; }, [userId]);

    // ── Socket connection — shared singleton ─────────────────────────────────
    useEffect(() => {
        const socket = socketManager.getSocket();
        if (!socket) return;

        const handleConnect = () => {
            console.log('[LiveLoc] Socket connected.');
            if (role === 'delivery' && orderIdRef.current) {
                socket.emit('joinOrderRoom', orderIdRef.current);
                console.log('[LiveLoc] Joined room for order:', orderIdRef.current);

                // Drain offline location buffer
                if (locationQueueRef.current.length > 0) {
                    console.log(`[LiveLoc] Draining ${locationQueueRef.current.length} queued locations...`);
                    locationQueueRef.current.forEach(payload => {
                        socket.emit('updateLocation', payload);
                    });
                    locationQueueRef.current = []; // Clear the queue after draining
                }
            } else if (orderIdRef.current) { // For customer role, just join the room
                socket.emit('joinOrderRoom', orderIdRef.current);
                console.log('[LiveLoc] Joined room for order:', orderIdRef.current);
            }
        };

        const handleLocation = (data) => {
            if (data.orderId === orderIdRef.current) { // Ensure it's for the current order
                setLiveLocation(data.location);
            }
        };

        // If already connected, join immediately
        if (socket.connected && orderId) {
            socket.emit('joinOrderRoom', orderId);
            console.log('[LiveLoc] Already connected, joined room order_' + orderId);
        }

        socket.on('connect', handleConnect);

        // Only listen for location updates if NOT the delivery partner
        if (role !== 'delivery') {
            socket.on('locationUpdated', handleLocation);
        }

        const unsub = socketManager.onStateChange(setSocketState);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('locationUpdated', handleLocation);
            unsub();
        };
    }, [orderId, role]);

    // ── Mobile sleep/wake: re-emit position on visibility change ─────────────
    useEffect(() => {
        if (role !== 'delivery') return;

        let appStateListener = null;

        const setupAppListener = async () => {
            try {
                const { App } = await import('@capacitor/app').catch(() => ({}));
                if (App) {
                    appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
                        if (isActive) {
                            console.log('[LiveLoc] Capacitor App resumed — restoring tracking/socket');
                            const socket = socketManager.getSocket();
                            if (socket?.disconnected) {
                                socket.connect();
                            }
                            if (lastLocRef.current && orderIdRef.current && socket?.connected) {
                                socket.emit('updateLocation', {
                                    orderId: orderIdRef.current,
                                    deliveryPartnerId: userIdRef.current,
                                    location: lastLocRef.current,
                                    isOnline: true,
                                    timestamp: Date.now(),
                                });
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn('[LiveLoc] Capacitor App listener error', e);
            }
        };

        setupAppListener();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && lastLocRef.current && orderIdRef.current) {
                const socket = socketManager.getSocket();
                if (socket?.connected) {
                    console.log('[LiveLoc] Web visibility resumed — re-emitting last position');
                    socket.emit('updateLocation', {
                        orderId: orderIdRef.current,
                        deliveryPartnerId: userIdRef.current,
                        location: lastLocRef.current,
                        isOnline: true,
                        timestamp: Date.now(),
                    });
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            if (appStateListener) appStateListener.remove();
        };
    }, [role]);

    // ── Throttled location emitter ───────────────────────────────────────────
    const emitLocation = useCallback((rawLoc) => {
        // Apply smoothing filter
        const smoothed = smoothLocation(lastLocRef.current, rawLoc);
        lastLocRef.current = smoothed;
        setLiveLocation(smoothed);

        // Calculate heading if GPS didn't provide one
        if ((smoothed.heading === 0 || smoothed.heading == null) && lastEmittedLocRef.current) {
            smoothed.heading = calcHeading(lastEmittedLocRef.current, smoothed);
        }

        // Throttle: check time + distance since last EMIT
        const now = Date.now();
        const timeSinceLastEmit = now - lastEmitRef.current;
        const distFromLastEmit = lastEmittedLocRef.current
            ? haversineDistance(lastEmittedLocRef.current, smoothed)
            : Infinity;

        // Battery Intelligence: Track stationary time
        if (distFromLastEmit >= GPS_MIN_DISTANCE_M) {
            lastMovementTimeRef.current = now; // Reset idle timer if moved
        }

        const timeSinceLastMovement = now - lastMovementTimeRef.current;

        // Dynamic interval: 3s normally, but 10s if stationary for > 2 minutes (120,000 ms)
        const currentInterval = timeSinceLastMovement > 120000 ? 10000 : GPS_EMIT_INTERVAL_MS;

        if (timeSinceLastEmit < currentInterval && distFromLastEmit < GPS_MIN_DISTANCE_M) {
            return; // skip — too soon and barely moved
        }

        lastEmitRef.current = now;
        lastEmittedLocRef.current = smoothed;

        const socket = socketManager.getSocket();
        const payload = {
            orderId: orderIdRef.current,
            deliveryPartnerId: userIdRef.current,
            location: smoothed,
            isOnline: true,
            timestamp: now,
        };

        if (socket?.connected && orderIdRef.current) {
            socket.emit('updateLocation', payload);
        } else if (orderIdRef.current) {
            // Buffer when offline (max 50 to prevent memory leak)
            if (locationQueueRef.current.length < 50) {
                locationQueueRef.current.push(payload);
            } else {
                // Drop oldest, push newest 
                locationQueueRef.current.shift();
                locationQueueRef.current.push(payload);
            }
        }
    }, []);

    const startTracking = useCallback(async () => {
        if (role !== 'delivery') return;

        try {
            // Try Capacitor geolocation first (for mobile)
            const { Geolocation } = await import('@capacitor/geolocation').catch(() => ({}));

            if (Geolocation) {
                const perms = await Geolocation.checkPermissions();
                if (perms.location !== 'granted') {
                    const req = await Geolocation.requestPermissions();
                    if (req.location !== 'granted') {
                        console.warn('[GPS] Permission denied');
                        return;
                    }
                }

                const id = await Geolocation.watchPosition({
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                }, (position, err) => {
                    if (err) { console.warn('[GPS] Watch error:', err); return; }
                    if (!position) return;
                    const { coords } = position;
                    // Skip if accuracy too low
                    if (coords.accuracy && coords.accuracy > GPS_ACCURACY_MAX) {
                        console.log('[GPS] Skipping low-accuracy reading:', coords.accuracy, 'm');
                        return;
                    }
                    emitLocation({
                        lat: coords.latitude,
                        lng: coords.longitude,
                        heading: coords.heading ?? 0,
                        speed: coords.speed ?? 0,
                        accuracy: coords.accuracy,
                    });
                });
                watchIdRef.current = id;
                setIsTracking(true);
                console.log('[GPS] Capacitor watch started');
            } else {
                // Fallback: HTML5 Geolocation API
                if (navigator.geolocation) {
                    const id = navigator.geolocation.watchPosition(
                        (position) => {
                            const { coords } = position;
                            if (coords.accuracy && coords.accuracy > GPS_ACCURACY_MAX) return;
                            emitLocation({
                                lat: coords.latitude,
                                lng: coords.longitude,
                                heading: coords.heading || 0,
                                speed: coords.speed || 0,
                                accuracy: coords.accuracy,
                            });
                        },
                        (err) => console.warn('[GPS] HTML5 error:', err.message),
                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                    );
                    watchIdRef.current = id;
                    setIsTracking(true);
                    console.log('[GPS] HTML5 watch started');
                } else {
                    console.warn('[GPS] No geolocation API available');
                }
            }
        } catch (error) {
            console.warn('[GPS] Error starting tracking:', error.message);
        }
    }, [role, emitLocation]);

    const stopTracking = useCallback(async () => {
        if (simIntervalRef.current) {
            clearInterval(simIntervalRef.current);
            simIntervalRef.current = null;
        }

        if (watchIdRef.current !== null) {
            try {
                const { Geolocation } = await import('@capacitor/geolocation').catch(() => ({}));
                if (Geolocation) {
                    await Geolocation.clearWatch({ id: watchIdRef.current });
                } else if (navigator.geolocation) {
                    navigator.geolocation.clearWatch(watchIdRef.current);
                }
            } catch { /* ignore cleanup errors */ }
            watchIdRef.current = null;
        }
        setIsTracking(false);
        console.log('[GPS] Tracking stopped');
    }, []);

    const simulateMovement = useCallback((routeCoords) => {
        if (role !== 'delivery' || !routeCoords || routeCoords.length === 0) return;
        if (simIntervalRef.current) clearInterval(simIntervalRef.current);

        setIsTracking(true);
        let index = 0;
        const step = Math.max(1, Math.floor(routeCoords.length / 30));

        simIntervalRef.current = setInterval(() => {
            if (index >= routeCoords.length) {
                clearInterval(simIntervalRef.current);
                simIntervalRef.current = null;
                setIsTracking(false);
                return;
            }
            const coord = routeCoords[index];
            const lat = Array.isArray(coord) ? coord[1] || coord[0] : coord.lat;
            const lng = Array.isArray(coord) ? coord[0] || coord[1] : coord.lng;
            emitLocation({ lat, lng, heading: 0, speed: 5, accuracy: 10 });
            index += step;
        }, 1500);
    }, [role, emitLocation]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (simIntervalRef.current) clearInterval(simIntervalRef.current);
        };
    }, []);

    return { liveLocation, isTracking, socketState, startTracking, stopTracking, simulateMovement, haversineDistance };
};

export default useLiveLocation;
