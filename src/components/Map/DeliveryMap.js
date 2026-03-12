import React, { useEffect, useState, useRef, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Polyline, Marker } from '@react-google-maps/api';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.REACT_APP_MAPBOX_TOKEN || '';

const libraries = ['geometry'];

const mapContainerStyle = {
    width: '100%',
    height: '100%',
    minHeight: '300px',
    borderRadius: '12px'
};

const defaultCenter = { lat: 20.5937, lng: 78.9629 };

function haversineFallback(a, b) {
    if (!a?.lat || !b?.lat) return Infinity;
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const DeliveryMap = ({ pickupLocation, dropLocation, liveLocation, precalculatedRoute, onRouteCalculated }) => {
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_KEY,
        libraries,
    });

    const mapRef = useRef(null);
    const [path, setPath] = useState([]);
    const [driverPos, setDriverPos] = useState(null);
    const onRouteCalcRef = useRef(onRouteCalculated);

    useEffect(() => { onRouteCalcRef.current = onRouteCalculated; }, [onRouteCalculated]);

    // ── Smooth Animation for Rider ──
    const animRef = useRef(null);
    useEffect(() => {
        if (!liveLocation?.lat) return;
        const newPos = { lat: liveLocation.lat, lng: liveLocation.lng };

        if (!driverPos) {
            setDriverPos(newPos);
            return;
        }

        const from = driverPos;
        const to = newPos;
        const durationMs = 1200;
        const start = performance.now();

        const animate = (now) => {
            const t = Math.min((now - start) / durationMs, 1);
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            setDriverPos({
                lat: from.lat + (to.lat - from.lat) * eased,
                lng: from.lng + (to.lng - from.lng) * eased
            });
            if (t < 1) animRef.current = requestAnimationFrame(animate);
        };

        if (animRef.current) cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(animate);

        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveLocation?.lat, liveLocation?.lng]);

    // ── Decode Polylines ──
    const decodePolyline = (encoded) => {
        if (!window.google) return [];
        return window.google.maps.geometry.encoding.decodePath(encoded).map(p => ({
            lat: p.lat(),
            lng: p.lng()
        }));
    };

    useEffect(() => {
        if (!isLoaded || !pickupLocation?.lat || !dropLocation?.lat) return;

        if (precalculatedRoute) {
            try {
                let parsed = typeof precalculatedRoute === "string" ? JSON.parse(precalculatedRoute) : precalculatedRoute;
                if (typeof parsed === "string") {
                    setPath(decodePolyline(parsed));
                } else if (Array.isArray(parsed)) {
                    setPath(parsed.map(p => ({ lat: p[0], lng: p[1] })));
                }
                return;
            } catch (err) {
                console.warn("Failed parsing precalculated route polyline:", err);
            }
        }
        
        // Haversine straight line fallback
        const dist = haversineFallback(pickupLocation, dropLocation);
        setPath([
            { lat: pickupLocation.lat, lng: pickupLocation.lng },
            { lat: dropLocation.lat, lng: dropLocation.lng }
        ]);
        if (onRouteCalcRef.current) {
            onRouteCalcRef.current({ distance: dist, duration: dist / 4.5 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, pickupLocation?.lat, dropLocation?.lat, precalculatedRoute]);

    const onLoad = useCallback((map) => {
        mapRef.current = map;
        const bounds = new window.google.maps.LatLngBounds();
        if (pickupLocation?.lat) bounds.extend({ lat: pickupLocation.lat, lng: pickupLocation.lng });
        if (dropLocation?.lat) bounds.extend({ lat: dropLocation.lat, lng: dropLocation.lng });
        if (liveLocation?.lat) bounds.extend({ lat: liveLocation.lat, lng: liveLocation.lng });
        map.fitBounds(bounds, 60);
    }, [pickupLocation, dropLocation, liveLocation]);

    const onUnmount = useCallback(() => {
        mapRef.current = null;
    }, []);

    if (loadError) return <div>🗺️ Error loading Google Maps</div>;
    if (!isLoaded) return <div>🗺️ Loading map...</div>;
    if (!GOOGLE_MAPS_KEY) return <div>🗺️ Google Maps key not defined</div>;

    return (
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            zoom={14}
            center={pickupLocation?.lat ? { lat: pickupLocation.lat, lng: pickupLocation.lng } : defaultCenter}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
                disableDefaultUI: true,
                styles: [
                    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
                    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
                    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
                    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
                ]
            }}
        >
            {pickupLocation?.lat && (
                <Marker position={{ lat: pickupLocation.lat, lng: pickupLocation.lng }} label="🏪" />
            )}
            {dropLocation?.lat && (
                <Marker position={{ lat: dropLocation.lat, lng: dropLocation.lng }} label="📍" />
            )}
            {driverPos?.lat && (
                <Marker position={driverPos} label="🛵" />
            )}
            {path.length > 0 && (
                <Polyline
                    path={path}
                    options={{
                        strokeColor: "#4A90D9",
                        strokeOpacity: 0.85,
                        strokeWeight: 5,
                    }}
                />
            )}
        </GoogleMap>
    );
};

export default React.memo(DeliveryMap);
