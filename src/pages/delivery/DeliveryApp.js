import React, { useState, useCallback, useEffect, useRef } from "react";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import socketManager from "../../utils/socketManager";
import DeliveryMap from "../../components/Map/DeliveryMap";
import useLiveLocation from "../../hooks/useLiveLocation";

function Toast({ msg, icon, onDone }) {
    React.useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className="plat-toast" style={{ borderLeft: `4px solid ${P.accent}` }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{msg}</span>
            <button onClick={onDone} style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
    );
}

export function DeliveryApp({ activeTab }) {
    const { user } = useAuth();
    const { orders, startDelivery, markDelivered } = useStore();
    const [online, setOnline] = useState(false);
    const [searching, setSearching] = useState(false);
    const [activeOrder, setActiveOrder] = useState(null);
    const [availableOrders, setAvailableOrders] = useState([]);
    const [toast, setToast] = useState(null);
    const [earnings, setEarnings] = useState({ today: 1240, week: 6820, deliveries: 12 });

    // Local active order fallback for UI rendering
    const myActiveOrder = orders.find(o => o.riderId === user?.id && o.status === "OUT_FOR_DELIVERY");
    const currentOrder = activeOrder || myActiveOrder;

    // Derive readyOrders — only when online
    const readyOrders = online ? [
        ...availableOrders,
        ...orders.filter(o => o.status === "READY_FOR_PICKUP" && !availableOrders.some(a => (a._id || a.id) === (o._id || o.id))),
    ] : [];

    const [geofenceStatus, setGeofenceStatus] = useState(null); // { pickup: {valid, dist}, delivery: {valid, dist} }
    const socketRef = useRef(null);
    const processedEventIds = useRef(new Set()); // Deduplicate socket events

    // App Lifecycle: Restore active order(s) on mount
    useEffect(() => {
        const token = localStorage.getItem("nm_access_token");
        if (!token) return;
        fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/orders/my-active`, {
            headers: { "Authorization": `Bearer ${token}` }
        }).then(res => res.json()).then(data => {
            if (data.ok && data.orders?.length > 0) {
                setActiveOrder(data.orders[0]); // Restore UI tracking state
            }
        }).catch(err => console.error("Lifecycle restore failed", err));
    }, []);

    const { liveLocation, isTracking, startTracking, stopTracking, simulateMovement, haversineDistance } = useLiveLocation(currentOrder?._id || currentOrder?.id, "delivery", user?.id || user?._id);
    const [routeInfo, setRouteInfo] = useState({ distance: 0, duration: 0, polyline: null });
    const handleRouteCalculated = useCallback((info) => {
        setRouteInfo(prev => {
            if (prev.distance === info.distance && prev.duration === info.duration) return prev;
            return info;
        });
    }, []);

    // ── Fetch available delivery tasks from backend ─────────────────────────
    const fetchAvailableTasks = useCallback(async (lat, lng) => {
        try {
            const token = localStorage.getItem("nm_access_token");
            if (!token) return;

            let url = `${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/orders/available`;
            if (lat && lng) url += `?lat=${lat}&lng=${lng}`;

            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setAvailableOrders(data.orders);
            }
        } catch (err) { console.error("Failed to fetch tasks", err); }
    }, []);

    // Socket connection for geofence validation — use shared singleton
    useEffect(() => {
        const socket = socketManager.getSocket();
        if (!socket) return;
        socketRef.current = socket;

        const handlePickupValidation = ({ orderId, valid, distance }) => {
            setGeofenceStatus(prev => ({ ...prev, pickup: { valid, distance } }));
            if (!valid) setToast({ msg: `Too far from store: ${distance}m away`, icon: "📍" });
        };
        const handleDeliveryValidation = ({ orderId, valid, distance }) => {
            setGeofenceStatus(prev => ({ ...prev, delivery: { valid, distance } }));
            if (!valid) setToast({ msg: `Too far from customer: ${distance}m away`, icon: "📍" });
        };
        const handleStatusUpdate = ({ status }) => {
            if (status === "PICKED_UP") setToast({ msg: "Picked up! Heading to customer 🛵", icon: "✅" });
            if (status === "DELIVERED") {
                setToast({ msg: "Delivered! 🎉", icon: "🎉" });
                setActiveOrder(null);
                stopTracking();
            }
        };

        const triggerPriorityAlert = () => {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.2);
            } catch (e) { }
        };

        const handleNewTask = (data) => {
            if (processedEventIds.current.has(data.orderId)) return;
            processedEventIds.current.add(data.orderId);
            setAvailableOrders(prev => {
                if (prev.some(o => (o._id || o.id) === data.orderId)) return prev;
                triggerPriorityAlert();
                setToast({ msg: `New High-Priority Task Available!`, icon: "🚨" });
                // We'll fetch the full list to stay in sync
                fetchAvailableTasks(liveLocation?.lat, liveLocation?.lng);
                return prev;
            });
        };

        const handleRemoveTask = ({ orderId }) => {
            setAvailableOrders(prev => prev.filter(o => (o._id || o.id) !== orderId));
        };

        socket.on("pickupValidation", handlePickupValidation);
        socket.on("deliveryValidation", handleDeliveryValidation);
        socket.on("deliveryStatusUpdate", handleStatusUpdate);
        socket.on("orderNearbyAvailable", handleNewTask);
        socket.on("orderRemovedFromQueue", handleRemoveTask);

        return () => {
            socket.off("pickupValidation", handlePickupValidation);
            socket.off("deliveryValidation", handleDeliveryValidation);
            socket.off("deliveryStatusUpdate", handleStatusUpdate);
            socket.off("orderNearbyAvailable", handleNewTask);
            socket.off("orderRemovedFromQueue", handleRemoveTask);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopTracking, liveLocation, fetchAvailableTasks]);

    // Join order room when active order changes
    useEffect(() => {
        if (currentOrder && socketRef.current) {
            const oid = currentOrder._id || currentOrder.id;
            socketRef.current.emit("joinOrderRoom", oid);
        }
    }, [currentOrder]);


    const handleGoOnline = () => {
        if (online) { setOnline(false); setToast({ msg: "You're now offline 🌙", icon: "😴" }); return; }
        setSearching(true);
        // Force start tracking to get initial location if we don't have it
        if (!liveLocation) startTracking();

        // Pass current known location or let the backend do a broad search until socket kicks in
        const loc = liveLocation || {};
        fetchAvailableTasks(loc.lat, loc.lng).then(() => {
            setSearching(false);
            setOnline(true);
            setToast({ msg: `Online! Found available tasks`, icon: "📦" });
        });
    };

    const [accepting, setAccepting] = useState(null); // orderId being accepted

    const handleAcceptTask = useCallback(async (order) => {
        const orderId = order._id || order.id;
        if (accepting) return; // prevent double-click
        setAccepting(orderId);
        try {
            const token = localStorage.getItem("nm_access_token");
            let accepted = false;

            // Try backend API first (for real DB orders)
            if (token && order._id) {
                try {
                    const res = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/orders/${orderId}/accept-delivery`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.ok) {
                        setActiveOrder(data.order);
                        accepted = true;
                    }
                } catch (err) {
                    console.warn("Backend accept failed, using local fallback:", err.message);
                }
            }

            // Local state fallback (for mock orders or when backend is down)
            if (!accepted) {
                const localOrder = {
                    ...order,
                    status: "OUT_FOR_DELIVERY",
                    riderId: user?.id || user?._id,
                    riderName: user?.name,
                    updatedAt: Date.now(),
                };
                setActiveOrder(localOrder);
            }

            // Update global store for cross-component reactivity
            startDelivery(orderId, user?.id || user?._id, user?.name);

            // Remove from available list
            setAvailableOrders(prev => prev.filter(o => (o._id || o.id) !== orderId));

            setToast({ msg: `Navigating to pickup`, icon: "🗺" });
            startTracking();
        } catch (err) {
            setToast({ msg: "Failed to accept task", icon: "❌" });
        } finally {
            setAccepting(null);
        }
    }, [startDelivery, user, startTracking, accepting]);


    const handleSimulation = () => {
        if (routeInfo?.polyline?.coordinates) {
            simulateMovement(routeInfo.polyline.coordinates);
        } else {
            setToast({ msg: `Calculating route...`, icon: "⏳" });
        }
    };

    const handleDelivered = useCallback(() => {
        if (!activeOrder && !myActiveOrder) return;
        const ord = activeOrder || myActiveOrder;
        markDelivered(ord.id);
        stopTracking();
        const pay = Math.round(ord.total * 0.08) + 30; // ~8% + base
        setEarnings(e => ({ today: e.today + pay, week: e.week + pay, deliveries: e.deliveries + 1 }));
        setActiveOrder(null);
        setToast({ msg: `Delivered! Earned ₹${pay} 💸`, icon: "🎉" });
    }, [activeOrder, myActiveOrder, markDelivered, stopTracking]);

    // Geofence: attempt pickup confirmation — socket first, local haversine fallback
    const handleConfirmPickup = useCallback(() => {
        if (!currentOrder) return;
        const pickupLoc = currentOrder.pickupLocation;
        if (!pickupLoc) { setToast({ msg: "No pickup location set", icon: "❌" }); return; }

        // Try socket geofence validation
        if (socketRef.current?.connected) {
            socketRef.current.emit("confirmPickup", {
                orderId: currentOrder._id || currentOrder.id,
                pickupLocation: pickupLoc,
            });
        }

        // Local fallback: haversine check (500m threshold)
        if (liveLocation) {
            const dist = haversineDistance(liveLocation, pickupLoc);
            if (dist <= 500) {
                setGeofenceStatus(prev => ({ ...prev, pickup: { valid: true, distance: Math.round(dist) } }));
                setToast({ msg: "📦 Pickup confirmed!", icon: "✅" });
            } else {
                setGeofenceStatus(prev => ({ ...prev, pickup: { valid: false, distance: Math.round(dist) } }));
                setToast({ msg: `Too far from store: ${Math.round(dist)}m`, icon: "📍" });
            }
        } else {
            // No GPS — allow anyway for dev/demo
            setGeofenceStatus(prev => ({ ...prev, pickup: { valid: true, distance: 0 } }));
            setToast({ msg: "📦 Pickup confirmed (GPS unavailable)", icon: "✅" });
        }
    }, [liveLocation, currentOrder, haversineDistance]);

    // Geofence: attempt delivery confirmation — socket first, local haversine fallback
    const handleConfirmDelivery = useCallback(() => {
        if (!currentOrder) return;
        const dropLoc = currentOrder.dropLocation;
        if (!dropLoc) { setToast({ msg: "No delivery location set", icon: "❌" }); return; }

        // Try socket geofence validation
        if (socketRef.current?.connected) {
            socketRef.current.emit("confirmDelivery", {
                orderId: currentOrder._id || currentOrder.id,
                dropLocation: dropLoc,
            });
        }

        // Local fallback: haversine check (300m threshold)
        if (liveLocation) {
            const dist = haversineDistance(liveLocation, dropLoc);
            if (dist <= 300) {
                setGeofenceStatus(prev => ({ ...prev, delivery: { valid: true, distance: Math.round(dist) } }));
                // Complete the delivery locally
                handleDelivered();
            } else {
                setGeofenceStatus(prev => ({ ...prev, delivery: { valid: false, distance: Math.round(dist) } }));
                setToast({ msg: `Too far from customer: ${Math.round(dist)}m`, icon: "📍" });
            }
        } else {
            // No GPS — allow anyway for dev/demo
            setGeofenceStatus(prev => ({ ...prev, delivery: { valid: true, distance: 0 } }));
            handleDelivered();
        }
    }, [liveLocation, currentOrder, haversineDistance, handleDelivered]);

    // ── Render tab as inline JSX (NOT as sub-components — avoids infinite loop) ──
    const renderMap = (
        <div className="col gap0" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {currentOrder ? (
                <div style={{ flex: 1, minHeight: 200 }}>
                    <DeliveryMap
                        pickupLocation={currentOrder.pickupLocation}
                        dropLocation={currentOrder.dropLocation}
                        liveLocation={liveLocation}
                        precalculatedRoute={currentOrder.routePolyline}
                        onRouteCalculated={handleRouteCalculated}
                    />
                </div>
            ) : (
                <div style={{ flex: 1, minHeight: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#1a1a2e", borderRadius: 12 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>😴</div>
                    <div style={{ fontWeight: 700, color: P.textMuted }}>Go Online to Start</div>
                </div>
            )}
            <div style={{ background: P.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 16px", boxShadow: "0 -10px 30px rgba(0,0,0,.4)", position: "relative", zIndex: 10 }}>
                <div style={{ width: 40, height: 4, background: P.border, borderRadius: 4, margin: "0 auto 16px" }} />
                <div className="row-between mb14">
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 20 }}>₹{earnings.today.toLocaleString("en-IN")} <span style={{ fontSize: 13, fontWeight: 400, color: P.textMuted }}>today</span></div>
                        <div style={{ color: P.success, fontSize: 12, fontWeight: 600 }}>{earnings.deliveries} Deliveries</div>
                    </div>
                    <button onClick={handleGoOnline} disabled={searching}
                        className={online ? "status-pill-on" : "status-pill-off"}
                        style={{ cursor: "pointer", border: "none", minHeight: 44, fontSize: 14, transition: "all 0.3s ease" }}>
                        {searching ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />Searching...</> : online ? "● Online" : "○ Go Online"}
                    </button>
                </div>

                {currentOrder ? (
                    <div className="col gap10">
                        <div className="p-card" style={{ borderColor: `${P.primary}44`, background: `${P.primary}08` }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>🛵 {currentOrder.status === "OUT_FOR_DELIVERY" ? "Out for Delivery" : "Active Task"}</span>
                                {routeInfo?.duration > 0 && <span style={{ fontSize: 13, color: P.success }}>ETA: {Math.ceil(routeInfo.duration / 60)} min</span>}
                            </div>
                            <div style={{ fontSize: 13, color: P.textMuted, marginBottom: 12 }}>{currentOrder._id || currentOrder.id} · {currentOrder.storeName}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {geofenceStatus?.pickup && (
                                    <div style={{ fontSize: 12, color: geofenceStatus.pickup.valid ? P.success : P.danger, fontWeight: 600, textAlign: "center" }}>
                                        {geofenceStatus.pickup.valid ? "🟢 In pickup range" : `🔴 ${geofenceStatus.pickup.distance}m from store`}
                                    </div>
                                )}
                                {geofenceStatus?.delivery && (
                                    <div style={{ fontSize: 12, color: geofenceStatus.delivery.valid ? P.success : P.danger, fontWeight: 600, textAlign: "center" }}>
                                        {geofenceStatus.delivery.valid ? "🟢 In delivery range" : `🔴 ${geofenceStatus.delivery.distance}m from customer`}
                                    </div>
                                )}
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button className="p-btn w-100" style={{ background: P.accent, color: "white" }} onClick={handleConfirmPickup}>
                                        📦 Confirm Pickup
                                    </button>
                                    <button className="p-btn w-100" style={{ background: P.success, color: "white" }} onClick={handleConfirmDelivery}>
                                        ✅ Confirm Delivery
                                    </button>
                                </div>
                                <button className="p-btn w-100" style={{ background: P.surface, color: P.text, border: `1px solid ${P.border}` }} onClick={handleSimulation} disabled={isTracking}>
                                    {isTracking ? "Simulating GPS..." : "Dev: Simulate GPS"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : online && availableOrders.length > 0 ? (
                    <div className="col gap10">
                        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📦 New Tasks ({availableOrders.length})</h3>
                        {availableOrders.slice(0, 3).map(o => (
                            <div key={o._id || o.id} className="order-card" style={{ borderColor: `${P.primary}44` }}>
                                <div className="row-between mb8">
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{o._id || o.id} · Store</div>
                                        <div style={{ fontSize: 12, color: P.textMuted }}>📍 {(o.address || "").split(",")[0] || 'Customer Location'}</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ color: P.success, fontWeight: 700 }}>+₹{Math.round(o.total * 0.08) + 30}</div>
                                        <div style={{ fontSize: 11, color: P.textMuted }}>Est. earn</div>
                                    </div>
                                </div>
                                <button className="p-btn p-btn-primary w-100" style={{ fontSize: 14 }}
                                    onClick={() => handleAcceptTask(o)} disabled={accepting === (o._id || o.id)}>
                                    {accepting === (o._id || o.id) ? "Accepting..." : "Accept Task"}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : online ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: P.textMuted }}>
                        <div style={{ fontSize: 30, marginBottom: 8 }}>🔍</div>
                        <div>Looking for new orders...</div>
                    </div>
                ) : (
                    <div style={{ textAlign: "center", padding: "20px 0", color: P.textMuted }}>
                        <div>Go online to start receiving tasks</div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderTasks = (
        <div className="col gap14">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📋 Available Tasks ({readyOrders.length})</h2>
            {!online ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 40 }}>🌙</div><p>Go online to see tasks</p>
                </div>
            ) : readyOrders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 40 }}>📭</div><p>No tasks right now</p>
                </div>
            ) : readyOrders.map((o, idx) => {
                const oid = o._id || o.id || `fallback-${idx}`;
                return (
                    <div key={`task-${oid}`} className="p-card">
                        <div className="row-between mb8">
                            <div style={{ fontWeight: 700 }}>#{String(oid).slice(-6).toUpperCase()}</div>
                            <div style={{ color: P.success, fontWeight: 700 }}>+₹{Math.round((o.total || 0) * 0.08) + 30}</div>
                        </div>
                        <div style={{ fontSize: 13, color: P.textMuted, marginBottom: 4 }}>🏪 {o.storeName || "Store"} → 🏠 {o.address || "Customer"}</div>
                        <div style={{ fontSize: 13, marginBottom: 12 }}>{(o.items || []).map(i => `${i.emoji || "📦"}×${i.qty}`).join(" ")}</div>
                        <button className="p-btn p-btn-primary w-100"
                            onClick={() => handleAcceptTask(o)} disabled={accepting === oid}>
                            {accepting === oid ? "Accepting..." : "Accept Task 🛵"}
                        </button>
                    </div>
                );
            })}
        </div>
    );

    const renderEarnings = (
        <div className="col gap16">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>💸 Earnings</h2>
            <div className="stat-grid">
                {[
                    { label: "Today", val: `₹${earnings.today.toLocaleString("en-IN")}`, color: P.success },
                    { label: "This Week", val: `₹${earnings.week.toLocaleString("en-IN")}`, color: P.primary },
                    { label: "Deliveries", val: earnings.deliveries, color: P.accent },
                    { label: "Avg/Delivery", val: `₹${Math.round(earnings.today / Math.max(1, earnings.deliveries))}`, color: P.accent },
                ].map(s => (
                    <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                        <div className="p-label">{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderSettings = (
        <div className="col gap16">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>⚙ Settings</h2>
            <div className="p-card col gap14">
                {[
                    { label: "Rider Name", val: user?.name },
                    { label: "Vehicle", val: `${user?.vehicleType || ""} · ${user?.vehicleNo || ""}` },
                    { label: "Rating", val: `${user?.rating || "5.0"} ⭐` },
                    { label: "Status", val: online ? "🟢 Online" : "⚫ Offline" },
                ].map(s => (
                    <div key={s.label} className="row-between" style={{ padding: "10px 0", borderBottom: `1px solid ${P.border}44` }}>
                        <span style={{ color: P.textMuted, fontSize: 13 }}>{s.label}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{s.val}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    const tabContent = [renderMap, renderTasks, renderEarnings, renderSettings];
    return (
        <div>
            {tabContent[activeTab] ?? renderMap}
            {toast && <Toast msg={toast.msg} icon={toast.icon} onDone={() => setToast(null)} />}
        </div>
    );
}
