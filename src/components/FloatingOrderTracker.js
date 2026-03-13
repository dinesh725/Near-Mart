import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { P } from "../theme/theme";
import socketManager from "../utils/socketManager";
import api from "../api/client";

/**
 * FloatingOrderTracker — Stage 3 of the new post-checkout UX.
 * A persistent, minimized widget that docks above the bottom nav bar.
 * Shows current order status + ETA. Tapping opens the Order Command Center.
 *
 * Props:
 *  - onTap: function(order) — opens Order Command Center or full tracking
 *  - onDismiss: function — user explicitly closes the tracker
 */

const STATUS_LABELS = {
    PENDING_PAYMENT: { label: "Processing Payment...", icon: "⏳", color: "#FFB800" },
    CONFIRMED: { label: "Order Confirmed ✓", icon: "✅", color: P.success },
    PREPARING: { label: "Preparing your order...", icon: "👨‍🍳", color: "#8B5CF6" },
    READY_FOR_PICKUP: { label: "Ready for pickup", icon: "📦", color: P.accent },
    RIDER_ASSIGNED: { label: "Rider assigned", icon: "🛵", color: P.primary },
    OUT_FOR_DELIVERY: { label: "On the way!", icon: "🛵", color: P.primary },
    DELIVERED: { label: "Delivered!", icon: "🎉", color: P.success },
    CANCELLED: { label: "Cancelled", icon: "❌", color: P.danger },
    REJECTED: { label: "Rejected", icon: "🚫", color: P.danger },
};

export function FloatingOrderTracker({ onTap, onDismiss }) {
    const [activeOrder, setActiveOrder] = useState(null);
    const [etaMin, setEtaMin] = useState(null);
    const [riderName, setRiderName] = useState(null);
    const [statusOverride, setStatusOverride] = useState(null);
    const socketJoinedRef = useRef(false);
    const fetchedRef = useRef(false);

    // ── Fetch active order on mount (survives refresh/restart) ──
    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        (async () => {
            try {
                const token = typeof localStorage !== "undefined" ? localStorage.getItem("nm_access_token") : null;
                if (!token) return;

                const res = await api.get("/orders?status=CONFIRMED,PREPARING,READY_FOR_PICKUP,OUT_FOR_DELIVERY&limit=1");
                if (res.ok && res.orders && res.orders.length > 0) {
                    const o = res.orders[0];
                    setActiveOrder(o);
                    if (o.acceptedByPartnerId || o.deliveryPartnerId) {
                        setRiderName(o.riderName || o.deliveryPartnerName || null);
                        if (!statusOverride) setStatusOverride("RIDER_ASSIGNED");
                    }
                }
            } catch (e) {
                console.warn("[FT] Failed to fetch active order:", e.message);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Socket listeners ──
    useEffect(() => {
        const socket = socketManager.getSocket();
        if (!socket || !activeOrder?._id) return;

        // Join order room
        if (!socketJoinedRef.current) {
            socket.emit("joinOrderRoom", activeOrder._id);
            socketJoinedRef.current = true;
        }

        const handleStatus = (data) => {
            if (data.orderId !== activeOrder._id) return;

            if (data.status === "RIDER_ASSIGNED") {
                setRiderName(data.riderName || null);
                setStatusOverride("RIDER_ASSIGNED");
            } else {
                setStatusOverride(null);
                setActiveOrder(prev => prev ? { ...prev, status: data.status } : prev);
            }

            // Auto-dismiss on terminal states
            if (data.status === "DELIVERED" || data.status === "CANCELLED" || data.status === "REJECTED") {
                setTimeout(() => {
                    setActiveOrder(null);
                    socketJoinedRef.current = false;
                }, 5000); // Show for 5s then hide
            }
        };

        const handleEta = (data) => {
            if (data.orderId !== activeOrder._id) return;
            if (data.etaSeconds != null) setEtaMin(Math.ceil(data.etaSeconds / 60));
        };

        socket.on("deliveryStatusUpdate", handleStatus);
        socket.on("etaUpdate", handleEta);

        return () => {
            socket.off("deliveryStatusUpdate", handleStatus);
            socket.off("etaUpdate", handleEta);
        };
    }, [activeOrder?._id]);

    // ── Expose a way to set active order from parent ──
    const setTrackedOrder = useCallback((order) => {
        setActiveOrder(order);
        setStatusOverride(null);
        setEtaMin(null);
        setRiderName(null);
        socketJoinedRef.current = false;
    }, []);

    // Attach to window for parent access
    useEffect(() => {
        window.__nm_setTrackedOrder = setTrackedOrder;
        return () => { delete window.__nm_setTrackedOrder; };
    }, [setTrackedOrder]);

    // Don't render if no active order
    if (!activeOrder) return null;

    const effectiveStatus = statusOverride || activeOrder.status;
    const sc = STATUS_LABELS[effectiveStatus] || STATUS_LABELS.CONFIRMED;
    const isLive = effectiveStatus === "OUT_FOR_DELIVERY";

    return ReactDOM.createPortal(
        <div
            onClick={() => onTap?.(activeOrder)}
            style={{
                position: "fixed",
                bottom: "calc(65px + env(safe-area-inset-bottom, 0px))",
                left: 12, right: 12,
                zIndex: 8500,
                background: P.card,
                border: `1.5px solid ${sc.color}55`,
                borderRadius: 16,
                padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
                cursor: "pointer",
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${sc.color}15`,
                animation: "trackerSlideUp 0.4s cubic-bezier(.34,1.56,.64,1)",
                transition: "all 0.3s ease",
            }}
        >
            {/* Status icon with pulse */}
            <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${sc.color}20`,
                border: `1.5px solid ${sc.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
                animation: isLive ? "trackerPulse 2s ease-in-out infinite" : "none",
            }}>
                {sc.icon}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: 700, fontSize: 13, color: P.text,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {sc.label}
                    {riderName && effectiveStatus !== "OUT_FOR_DELIVERY" && (
                        <span style={{ color: P.textMuted, fontWeight: 500 }}> · {riderName}</span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>#{activeOrder._id?.slice(-6).toUpperCase()}</span>
                    {etaMin && <span style={{ color: sc.color, fontWeight: 700 }}>· ETA ~{etaMin} min</span>}
                    {riderName && isLive && <span>· 🛵 {riderName}</span>}
                </div>
            </div>

            {/* Arrow + close */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 18, color: P.textMuted }}>›</span>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveOrder(null);
                        onDismiss?.();
                    }}
                    style={{
                        background: "none", border: "none",
                        color: P.textMuted, fontSize: 14, cursor: "pointer",
                        padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    aria-label="Dismiss tracker"
                >
                    ✕
                </button>
            </div>

            {/* Progress bar at bottom */}
            <div style={{
                position: "absolute", bottom: 0, left: 16, right: 16,
                height: 2, background: P.border, borderRadius: 2,
                overflow: "hidden",
            }}>
                <div style={{
                    height: "100%", borderRadius: 2,
                    background: `linear-gradient(90deg, ${sc.color}, ${sc.color}88)`,
                    width: effectiveStatus === "CONFIRMED" ? "15%" :
                        effectiveStatus === "PREPARING" ? "35%" :
                            effectiveStatus === "READY_FOR_PICKUP" ? "50%" :
                                effectiveStatus === "RIDER_ASSIGNED" ? "60%" :
                                    effectiveStatus === "OUT_FOR_DELIVERY" ? "80%" :
                                        effectiveStatus === "DELIVERED" ? "100%" : "10%",
                    transition: "width 1s ease",
                }} />
            </div>

            <style>{`
                @keyframes trackerSlideUp {
                    0% { opacity: 0; transform: translateY(30px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes trackerPulse {
                    0%, 100% { box-shadow: 0 0 0 0 ${sc.color}33; }
                    50% { box-shadow: 0 0 16px ${sc.color}44; }
                }
            `}</style>
        </div>,
        document.body
    );
}

export default FloatingOrderTracker;
