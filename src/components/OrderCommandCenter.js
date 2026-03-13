import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { P } from "../theme/theme";
import socketManager from "../utils/socketManager";
import api from "../api/client";

/**
 * OrderCommandCenter — Stage 2 of the new post-checkout UX.
 * Shows a vertical timeline of order status + conditional mini-map
 * that appears only when a rider is assigned.
 *
 * Props:
 *  - orderId: string (MongoDB _id)
 *  - initialOrder: order object (from checkout result — avoids extra fetch)
 *  - onClose: function
 *  - onViewFullMap: function(order) — opens the full TrackOrderModal
 */

const TIMELINE_STEPS = [
    { status: "CONFIRMED", label: "Order Confirmed", icon: "✅", description: "Your order has been received" },
    { status: "PREPARING", label: "Store Preparing", icon: "👨‍🍳", description: "Your food is being prepared" },
    { status: "RIDER_ASSIGNED", label: "Rider Assigned", icon: "🛵", description: "A delivery partner is heading to the store" },
    { status: "OUT_FOR_DELIVERY", label: "Out for Delivery", icon: "📍", description: "Your order is on the way!" },
    { status: "DELIVERED", label: "Delivered", icon: "🎉", description: "Enjoy your order!" },
];

// Map backend status to timeline index
function getStepIndex(status, hasRider) {
    if (status === "DELIVERED") return 4;
    if (status === "OUT_FOR_DELIVERY") return 3;
    if (status === "READY_FOR_PICKUP" && hasRider) return 2;
    if (status === "READY_FOR_PICKUP") return 1; // Searching for rider...
    if (status === "PREPARING") return 1;
    if (status === "CONFIRMED") return 0;
    if (status === "PENDING_PAYMENT" || status === "PENDING") return -1;
    return 0;
}

export function OrderCommandCenter({ orderId, initialOrder, onClose, onViewFullMap }) {
    const [order, setOrder] = useState(initialOrder || null);
    const [riderAssigned, setRiderAssigned] = useState(false);
    const [riderName, setRiderName] = useState(null);
    const [etaMin, setEtaMin] = useState(null);
    const [etaDistance, setEtaDistance] = useState(null);
    const [searching, setSearching] = useState(false);
    const socketJoinedRef = useRef(false);

    const effectiveOrderId = orderId || order?._id || order?.id;
    const status = order?.status || "CONFIRMED";
    const hasRider = riderAssigned || !!order?.acceptedByPartnerId || !!order?.deliveryPartnerId;
    const currentStep = getStepIndex(status, hasRider);

    // ── Fetch latest order data on mount ──
    useEffect(() => {
        if (!effectiveOrderId) return;
        (async () => {
            try {
                const res = await api.get(`/orders/${effectiveOrderId}`);
                if (res.ok && res.order) {
                    setOrder(res.order);
                    if (res.order.acceptedByPartnerId || res.order.deliveryPartnerId) {
                        setRiderAssigned(true);
                        setRiderName(res.order.riderName || res.order.deliveryPartnerName || null);
                    }
                }
            } catch (e) {
                console.warn("[OCC] Failed to fetch order:", e.message);
            }
        })();
    }, [effectiveOrderId]);

    // ── Socket: join order room + listen for events ──
    useEffect(() => {
        const socket = socketManager.getSocket();
        if (!socket || !effectiveOrderId) return;

        // Join the order room so we receive events
        if (!socketJoinedRef.current) {
            socket.emit("joinOrderRoom", effectiveOrderId);
            socketJoinedRef.current = true;
        }

        const handleStatusUpdate = (data) => {
            if (data.orderId !== effectiveOrderId) return;
            console.log("[OCC] Status update:", data.status);

            if (data.status === "RIDER_ASSIGNED") {
                setRiderAssigned(true);
                setRiderName(data.riderName || null);
                setSearching(false);
            }

            // Update local order status
            setOrder(prev => prev ? { ...prev, status: data.status, riderName: data.riderName || prev?.riderName } : prev);
        };

        const handleEta = (data) => {
            if (data.orderId !== effectiveOrderId) return;
            if (data.etaSeconds != null) setEtaMin(Math.ceil(data.etaSeconds / 60));
            if (data.distanceMeters != null) setEtaDistance(Math.round(data.distanceMeters));
        };

        socket.on("deliveryStatusUpdate", handleStatusUpdate);
        socket.on("etaUpdate", handleEta);

        return () => {
            socket.off("deliveryStatusUpdate", handleStatusUpdate);
            socket.off("etaUpdate", handleEta);
        };
    }, [effectiveOrderId]);

    // Detect "searching for rider" phase
    useEffect(() => {
        if (status === "READY_FOR_PICKUP" && !hasRider) {
            setSearching(true);
        } else {
            setSearching(false);
        }
    }, [status, hasRider]);

    const handleOpenFullMap = useCallback(() => {
        if (order) onViewFullMap?.(order);
    }, [order, onViewFullMap]);

    const isTerminal = status === "DELIVERED" || status === "CANCELLED" || status === "REJECTED";

    if (typeof document === 'undefined') return null;

    return ReactDOM.createPortal(
        <div className="modal-overlay" style={{ zIndex: 9600 }} onClick={onClose}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{
                maxWidth: 480, maxHeight: "92vh", padding: 0, overflow: "hidden",
                display: "flex", flexDirection: "column",
            }}>
                {/* ── Header ── */}
                <div style={{
                    padding: "20px 20px 16px",
                    background: `linear-gradient(135deg, ${P.success}08, transparent)`,
                    borderBottom: `1px solid ${P.border}`,
                    flexShrink: 0,
                }}>
                    <div className="modal-handle" />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ fontSize: 11, color: P.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                                Order Tracking
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 20 }}>
                                #{effectiveOrderId?.slice(-6).toUpperCase() || "------"}
                            </div>
                            {order?.storeName && (
                                <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>
                                    🏪 {order.storeName}
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} style={{
                            background: P.surface, border: `1px solid ${P.border}`, borderRadius: "50%",
                            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: P.textMuted, fontSize: 16,
                        }}>✕</button>
                    </div>
                </div>

                {/* ── Scrollable Content ── */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 24px" }}>

                    {/* ── Vertical Timeline ── */}
                    <div style={{ paddingLeft: 8 }}>
                        {TIMELINE_STEPS.map((step, idx) => {
                            const isComplete = currentStep >= idx;
                            const isCurrent = currentStep === idx;
                            const isSearching = step.status === "RIDER_ASSIGNED" && searching && !hasRider;

                            let label = step.label;
                            let desc = step.description;
                            if (step.status === "RIDER_ASSIGNED" && !hasRider && status === "READY_FOR_PICKUP") {
                                label = "Finding delivery partner...";
                                desc = "We're assigning the nearest available rider";
                            }
                            if (step.status === "RIDER_ASSIGNED" && hasRider && riderName) {
                                label = `${riderName} assigned`;
                                desc = "Heading to the store for pickup";
                            }
                            if (step.status === "OUT_FOR_DELIVERY" && isCurrent && etaMin) {
                                desc = `Arriving in ~${etaMin} min${etaDistance ? ` (${etaDistance}m away)` : ""}`;
                            }

                            return (
                                <div key={step.status} style={{ display: "flex", gap: 14, position: "relative" }}>
                                    {/* Vertical line */}
                                    {idx < TIMELINE_STEPS.length - 1 && (
                                        <div style={{
                                            position: "absolute", left: 15, top: 32, bottom: -8,
                                            width: 2,
                                            background: isComplete ? P.success : P.border,
                                            transition: "background 0.6s ease",
                                        }} />
                                    )}

                                    {/* Circle */}
                                    <div style={{
                                        width: 32, height: 32, borderRadius: "50%",
                                        background: isComplete ? `${P.success}20` :
                                            isSearching ? `${P.warning}20` : P.surface,
                                        border: `2px solid ${isComplete ? P.success :
                                            isSearching ? P.warning : P.border}`,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 15, flexShrink: 0, zIndex: 1,
                                        transition: "all 0.4s ease",
                                        boxShadow: isCurrent ? `0 0 16px ${P.success}44` :
                                            isSearching ? `0 0 16px ${P.warning}44` : "none",
                                        animation: isSearching ? "searchPulse 1.5s ease-in-out infinite" : "none",
                                    }}>
                                        {isComplete ? step.icon :
                                            isSearching ? "🔍" :
                                                <span style={{ color: P.border }}>●</span>}
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, paddingBottom: 22 }}>
                                        <div style={{
                                            fontWeight: isCurrent ? 700 : 600,
                                            fontSize: 14,
                                            color: isComplete ? P.text : P.textMuted,
                                            display: "flex", alignItems: "center", gap: 8,
                                        }}>
                                            {label}
                                            {isCurrent && !isSearching && (
                                                <span style={{
                                                    fontSize: 9, padding: "2px 8px",
                                                    background: `${P.success}20`, color: P.success,
                                                    borderRadius: 10, fontWeight: 800,
                                                }}>CURRENT</span>
                                            )}
                                            {isSearching && (
                                                <span className="spinner" style={{
                                                    width: 14, height: 14, borderWidth: 2,
                                                    borderTopColor: P.warning,
                                                }} />
                                            )}
                                        </div>
                                        <div style={{
                                            fontSize: 12, color: P.textMuted, marginTop: 3,
                                            opacity: isComplete || isCurrent ? 1 : 0.5,
                                        }}>
                                            {desc}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Mini-Map (shows only after rider assigned) ── */}
                    {hasRider && (status === "READY_FOR_PICKUP" || status === "OUT_FOR_DELIVERY") && (
                        <div style={{
                            marginTop: 8,
                            background: P.surface,
                            border: `1px solid ${P.border}`,
                            borderRadius: 16,
                            overflow: "hidden",
                            animation: "miniMapFadeIn 0.6s ease forwards",
                        }}>
                            {/* Mini map placeholder — shows store/rider info */}
                            <div style={{
                                height: 160,
                                background: `linear-gradient(135deg, #0D1926 0%, #0A1520 50%, #0D1926 100%)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                position: "relative",
                            }}>
                                {/* Animated rider icon */}
                                <div style={{
                                    fontSize: 36,
                                    animation: "riderMove 4s ease-in-out infinite alternate",
                                }}>
                                    🛵
                                </div>
                                <div style={{
                                    position: "absolute", bottom: 12, left: 12, right: 12,
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}>
                                    <div style={{
                                        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                                        padding: "6px 12px", borderRadius: 10,
                                        fontSize: 12, color: "white", fontWeight: 600,
                                    }}>
                                        {riderName ? `🛵 ${riderName}` : "🛵 Rider en route"}
                                    </div>
                                    {etaMin && (
                                        <div style={{
                                            background: `${P.primary}CC`, backdropFilter: "blur(8px)",
                                            padding: "6px 12px", borderRadius: 10,
                                            fontSize: 12, color: "white", fontWeight: 700,
                                        }}>
                                            ~{etaMin} min
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Full map button */}
                            <button onClick={handleOpenFullMap} style={{
                                width: "100%", padding: "12px 16px",
                                background: "transparent", border: "none",
                                borderTop: `1px solid ${P.border}`,
                                color: P.primary, fontWeight: 700, fontSize: 13,
                                cursor: "pointer", display: "flex",
                                alignItems: "center", justifyContent: "center", gap: 8,
                                fontFamily: "'Sora', sans-serif",
                            }}>
                                🗺️ Open Full Map <span style={{ fontSize: 16 }}>↗</span>
                            </button>
                        </div>
                    )}

                    {/* ── Order Summary ── */}
                    <div style={{
                        marginTop: 16, background: P.surface,
                        border: `1px solid ${P.border}`, borderRadius: 14,
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                            Order Summary
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                            {order?.items?.slice(0, 5).map((item, idx) => (
                                <div key={idx} style={{
                                    background: P.card, border: `1px solid ${P.border}`,
                                    borderRadius: 10, padding: "6px 10px",
                                    fontSize: 12, fontWeight: 600, color: P.text,
                                }}>
                                    {item.emoji || "📦"} {item.name} ×{item.qty}
                                </div>
                            ))}
                            {(order?.items?.length || 0) > 5 && (
                                <div style={{
                                    background: P.card, border: `1px solid ${P.border}`,
                                    borderRadius: 10, padding: "6px 10px",
                                    fontSize: 12, fontWeight: 600, color: P.textMuted,
                                }}>
                                    +{order.items.length - 5} more
                                </div>
                            )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16 }}>
                            <span>Total</span>
                            <span>₹{(order?.total || 0).toLocaleString("en-IN")}</span>
                        </div>
                    </div>
                </div>

                {/* ── Footer Actions ── */}
                <div style={{
                    padding: "14px 20px", borderTop: `1px solid ${P.border}`,
                    display: "flex", gap: 10, flexShrink: 0,
                    background: P.card,
                }}>
                    <button className="p-btn p-btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                        ← Continue Shopping
                    </button>
                    {!isTerminal && order?.pickupLocation && order?.dropLocation && (
                        <button className="p-btn p-btn-primary" style={{ flex: 1 }} onClick={handleOpenFullMap}>
                            🗺️ Live Map
                        </button>
                    )}
                </div>

                {/* Inline keyframes */}
                <style>{`
                    @keyframes miniMapFadeIn {
                        0% { opacity: 0; transform: translateY(12px); max-height: 0; }
                        100% { opacity: 1; transform: translateY(0); max-height: 300px; }
                    }
                    @keyframes searchPulse {
                        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 ${P.warning}44; }
                        50% { transform: scale(1.08); box-shadow: 0 0 20px ${P.warning}44; }
                    }
                `}</style>
            </div>
        </div>,
        document.body
    );
}

export default OrderCommandCenter;
