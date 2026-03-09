import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { P } from "../../theme/theme";
import api from "../../api/client";

// ── Status Configuration ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
    PENDING_PAYMENT: { color: "#FFB800", icon: "⏳", label: "Pending Payment", step: 0 },
    CONFIRMED: { color: P.primary, icon: "✅", label: "Confirmed", step: 1 },
    PREPARING: { color: "#8B5CF6", icon: "👨‍🍳", label: "Preparing", step: 2 },
    READY_FOR_PICKUP: { color: P.accent, icon: "📦", label: "Ready for Pickup", step: 3 },
    OUT_FOR_DELIVERY: { color: "#3B82F6", icon: "🛵", label: "Out for Delivery", step: 4 },
    DELIVERED: { color: P.success, icon: "🎉", label: "Delivered", step: 5 },
    CANCELLED: { color: P.danger, icon: "❌", label: "Cancelled", step: -1 },
    REJECTED: { color: "#F87171", icon: "🚫", label: "Rejected", step: -1 },
};

const TRACKING_STEPS = [
    { status: "CONFIRMED", label: "Order Confirmed", icon: "✅" },
    { status: "PREPARING", label: "Preparing", icon: "👨‍🍳" },
    { status: "READY_FOR_PICKUP", label: "Ready for Pickup", icon: "📦" },
    { status: "OUT_FOR_DELIVERY", label: "Out for Delivery", icon: "🛵" },
    { status: "DELIVERED", label: "Delivered", icon: "🎉" },
];

function formatDateTime(d) {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function OrderDetailSheet({ order: initialOrder, onClose, onTrack, onCancel, onRate, onReorder, onFlag }) {
    const [order, setOrder] = useState(initialOrder);
    const [activeSection, setActiveSection] = useState("details");
    const [showSupport, setShowSupport] = useState(false);

    const sc = STATUS_CONFIG[order.status] || { color: P.textMuted, icon: "❓", label: order.status, step: 0 };
    const canCancel = ["PENDING_PAYMENT", "CONFIRMED", "PREPARING"].includes(order.status);
    const canTrack = order.pickupLocation && order.dropLocation && ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(order.status);
    const canRate = order.status === "DELIVERED" && !order.customerRating;
    const canReorder = ["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status);
    const isCancelled = order.status === "CANCELLED" || order.status === "REJECTED";

    // Refresh order data
    useEffect(() => {
        if (!order._id) return;
        const refreshOrder = async () => {
            try {
                const res = await api.get(`/orders/${order._id}`);
                if (res.ok && res.order) setOrder(res.order);
            } catch { }
        };
        refreshOrder();
    }, [order._id]);

    // ── Get tracking step index ───────────────────────────────────────────────
    const currentStepIdx = isCancelled ? -1 : TRACKING_STEPS.findIndex(s => s.status === order.status);

    if (typeof document === 'undefined') return null;

    return ReactDOM.createPortal(
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9500 }}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{
                maxWidth: 520, maxHeight: "92vh", padding: 0, overflow: "hidden",
                display: "flex", flexDirection: "column",
            }}>
                {/* ── Header ──────────────────────────────────────────────────── */}
                <div style={{
                    padding: "20px 20px 16px", background: `linear-gradient(135deg, ${sc.color}08, transparent)`,
                    borderBottom: `1px solid ${P.border}`, flexShrink: 0,
                }}>
                    <div className="modal-handle" />

                    {/* Status badge + close button */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ fontSize: 11, color: P.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Order Details</div>
                            <div style={{ fontWeight: 800, fontSize: 20 }}>#{order._id?.slice(-6).toUpperCase()}</div>
                            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{formatDateTime(order.createdAt)}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                            <button onClick={onClose} style={{
                                background: P.surface, border: `1px solid ${P.border}`, borderRadius: "50%", width: 32, height: 32,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", color: P.textMuted, fontSize: 14,
                            }}>✕</button>

                            <div style={{
                                background: sc.color + "18", color: sc.color,
                                border: `1.5px solid ${sc.color}44`, borderRadius: 20,
                                padding: "6px 14px", fontSize: 12, fontWeight: 700,
                                display: "flex", alignItems: "center", gap: 5,
                            }}>
                                {sc.icon} {sc.label}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Section Tabs ─────────────────────────────────────────────── */}
                <div style={{
                    display: "flex", gap: 0, borderBottom: `1px solid ${P.border}`,
                    padding: "0 20px", flexShrink: 0,
                }}>
                    {[
                        { key: "details", label: "Details", icon: "📋" },
                        { key: "tracking", label: "Tracking", icon: "📍" },
                        { key: "billing", label: "Billing", icon: "💰" },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveSection(tab.key)} style={{
                            padding: "10px 16px", background: "none", border: "none",
                            borderBottom: `2px solid ${activeSection === tab.key ? P.primary : "transparent"}`,
                            color: activeSection === tab.key ? P.primary : P.textMuted,
                            fontSize: 12, fontWeight: 600, cursor: "pointer",
                            fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", gap: 5,
                        }}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Content ──────────────────────────────────────────────────── */}
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

                    {/* ━━ DETAILS SECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                    {activeSection === "details" && (
                        <div className="col gap16">
                            {/* Items */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                    Items ({order.items?.length || 0})
                                </div>
                                <div className="col gap8">
                                    {order.items?.map((item, idx) => (
                                        <div key={idx} style={{
                                            display: "flex", alignItems: "center", gap: 12,
                                            padding: "10px 12px", background: P.surface,
                                            borderRadius: 12, border: `1px solid ${P.border}`,
                                        }}>
                                            <div style={{
                                                width: 48, height: 48, borderRadius: 10,
                                                background: P.card, display: "flex", alignItems: "center",
                                                justifyContent: "center", overflow: "hidden", flexShrink: 0,
                                                border: `1px solid ${P.border}`,
                                            }}>
                                                {item.imageUrl
                                                    ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                    : <span style={{ fontSize: 24 }}>{item.emoji || "📦"}</span>
                                                }
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {item.name}
                                                </div>
                                                <div style={{ fontSize: 11, color: P.textMuted }}>
                                                    ₹{item.price} × {item.qty}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                                                ₹{(item.price * item.qty).toLocaleString("en-IN")}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Delivery Details */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                    Delivery Details
                                </div>
                                <div style={{ background: P.surface, borderRadius: 12, border: `1px solid ${P.border}`, padding: 14 }} className="col gap8">
                                    {order.address && (
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <span style={{ fontSize: 16, flexShrink: 0 }}>📍</span>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Delivery Address</div>
                                                <div style={{ fontSize: 12, color: P.textMuted, lineHeight: 1.5 }}>{order.address}</div>
                                            </div>
                                        </div>
                                    )}
                                    {order.deliveryPartnerName && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, borderTop: `1px solid ${P.border}` }}>
                                            <span style={{ fontSize: 16 }}>🛵</span>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600 }}>Delivery Partner</div>
                                                <div style={{ fontSize: 12, color: P.textMuted }}>{order.deliveryPartnerName}</div>
                                            </div>
                                        </div>
                                    )}
                                    {order.estimatedArrivalTime && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, borderTop: `1px solid ${P.border}` }}>
                                            <span style={{ fontSize: 16 }}>🕐</span>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600 }}>Estimated Arrival</div>
                                                <div style={{ fontSize: 12, color: P.textMuted }}>
                                                    {new Date(order.estimatedArrivalTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Info */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                    Payment
                                </div>
                                <div style={{ background: P.surface, borderRadius: 12, border: `1px solid ${P.border}`, padding: 14 }} className="col gap6">
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                        <span style={{ color: P.textMuted }}>Method</span>
                                        <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
                                            {order.paymentMethod === "wallet" ? "👛 Wallet" : order.paymentMethod === "razorpay" ? "💳 Razorpay" : "🔀 Hybrid"}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                        <span style={{ color: P.textMuted }}>Status</span>
                                        <span style={{
                                            fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6,
                                            background: order.paymentStatus === "paid" ? `${P.success}15` : order.paymentStatus === "refunded" ? `#FBBF2415` : `${P.danger}15`,
                                            color: order.paymentStatus === "paid" ? P.success : order.paymentStatus === "refunded" ? "#FBBF24" : P.danger,
                                        }}>
                                            {order.paymentStatus?.toUpperCase()}
                                        </span>
                                    </div>
                                    {order.paymentId && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                            <span style={{ color: P.textMuted }}>Payment ID</span>
                                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: P.textMuted }}>
                                                {order.paymentId.slice(-12)}
                                            </span>
                                        </div>
                                    )}
                                    {order.paymentGroupId && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                            <span style={{ color: P.textMuted }}>Group ID</span>
                                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: P.textMuted }}>
                                                {order.paymentGroupId.slice(-10)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Rating Section (if delivered) */}
                            {order.status === "DELIVERED" && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                        Your Rating
                                    </div>
                                    {order.customerRating ? (
                                        <div style={{ background: P.surface, borderRadius: 12, border: `1px solid ${P.border}`, padding: 14 }}>
                                            <div style={{ fontSize: 20, marginBottom: 4 }}>{"⭐".repeat(order.customerRating)}{"☆".repeat(5 - order.customerRating)}</div>
                                            {order.customerReview && <div style={{ fontSize: 13, color: P.textMuted, fontStyle: "italic" }}>"{order.customerReview}"</div>}
                                            <div style={{ fontSize: 11, color: P.textDim, marginTop: 6 }}>Rated {formatDate(order.ratedAt)}</div>
                                        </div>
                                    ) : (
                                        <button onClick={() => onRate(order)} style={{
                                            width: "100%", padding: 14, background: "#FBBF2410",
                                            border: `1.5px dashed #FBBF2444`, borderRadius: 12,
                                            cursor: "pointer", fontFamily: "'Sora', sans-serif",
                                            fontWeight: 600, fontSize: 13, color: "#FBBF24",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                        }}>
                                            ⭐ Rate this order
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Cancel Reason (if cancelled) */}
                            {order.cancelReason && (
                                <div style={{
                                    background: `${P.danger}10`, border: `1px solid ${P.danger}22`,
                                    borderRadius: 12, padding: 14,
                                }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: P.danger, marginBottom: 4 }}>Cancellation Reason</div>
                                    <div style={{ fontSize: 13, color: P.textMuted }}>{order.cancelReason}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ━━ TRACKING SECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                    {activeSection === "tracking" && (
                        <div className="col gap16">
                            {/* Visual Stepper */}
                            {!isCancelled ? (
                                <div className="col" style={{ paddingLeft: 8 }}>
                                    {TRACKING_STEPS.map((step, idx) => {
                                        const isComplete = currentStepIdx >= idx;
                                        const isCurrent = currentStepIdx === idx;
                                        const event = order.events?.find(e => e.status === step.status);

                                        return (
                                            <div key={step.status} style={{ display: "flex", gap: 14, position: "relative" }}>
                                                {/* Vertical line */}
                                                {idx < TRACKING_STEPS.length - 1 && (
                                                    <div style={{
                                                        position: "absolute", left: 14, top: 30, bottom: -8,
                                                        width: 2,
                                                        background: isComplete ? P.success : P.border,
                                                        transition: "background 0.5s",
                                                    }} />
                                                )}

                                                {/* Circle */}
                                                <div style={{
                                                    width: 30, height: 30, borderRadius: "50%",
                                                    background: isComplete ? `${P.success}20` : P.surface,
                                                    border: `2px solid ${isComplete ? P.success : P.border}`,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 14, flexShrink: 0, zIndex: 1,
                                                    transition: "all 0.3s",
                                                    boxShadow: isCurrent ? `0 0 12px ${P.success}44` : "none",
                                                }}>
                                                    {isComplete ? step.icon : <span style={{ color: P.border }}>●</span>}
                                                </div>

                                                {/* Content */}
                                                <div style={{ flex: 1, paddingBottom: 20 }}>
                                                    <div style={{
                                                        fontWeight: isCurrent ? 700 : 600,
                                                        fontSize: 13,
                                                        color: isComplete ? P.text : P.textMuted,
                                                    }}>
                                                        {step.label}
                                                        {isCurrent && (
                                                            <span style={{
                                                                marginLeft: 8, fontSize: 9, padding: "2px 8px",
                                                                background: P.success + "20", color: P.success,
                                                                borderRadius: 10, fontWeight: 800,
                                                            }}>CURRENT</span>
                                                        )}
                                                    </div>
                                                    {event && (
                                                        <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>
                                                            {formatDateTime(event.at || event.timestamp)}
                                                            {event.note && <span> · {event.note}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ textAlign: "center", padding: "40px 0" }}>
                                    <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
                                    <div style={{ fontWeight: 700, fontSize: 16, color: P.danger, marginBottom: 4 }}>Order {order.status === "REJECTED" ? "Rejected" : "Cancelled"}</div>
                                    {order.cancelReason && <div style={{ fontSize: 13, color: P.textMuted }}>Reason: {order.cancelReason}</div>}
                                </div>
                            )}

                            {/* Event History */}
                            {order.events?.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                        Event Timeline
                                    </div>
                                    <div className="col gap6">
                                        {[...order.events].reverse().map((event, idx) => {
                                            const ec = STATUS_CONFIG[event.status];
                                            return (
                                                <div key={idx} style={{
                                                    display: "flex", gap: 10, padding: "8px 12px",
                                                    background: P.surface, borderRadius: 10,
                                                    border: `1px solid ${P.border}`,
                                                    fontSize: 12,
                                                }}>
                                                    <span style={{ fontSize: 14 }}>{ec?.icon || "📌"}</span>
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontWeight: 600 }}>{ec?.label || event.status}</span>
                                                        {event.note && <span style={{ color: P.textMuted }}> — {event.note}</span>}
                                                    </div>
                                                    <span style={{ color: P.textDim, fontSize: 10, flexShrink: 0 }}>
                                                        {event.at ? new Date(event.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ━━ BILLING SECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                    {activeSection === "billing" && (
                        <div className="col gap16">
                            {/* Price Breakdown */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                    Bill Summary
                                </div>
                                <div style={{ background: P.surface, borderRadius: 14, border: `1px solid ${P.border}`, padding: "16px 18px" }} className="col gap6">
                                    <BillRow label="Item Total" value={`₹${(order.subtotal || 0).toLocaleString("en-IN")}`} />
                                    <BillRow label="Delivery Fee" value={`₹${(order.deliveryFee || 0).toLocaleString("en-IN")}`} muted />
                                    <BillRow label="Platform Fee" value={`₹${(order.platformFee || 0).toLocaleString("en-IN")}`} muted />
                                    {(order.discountShare || 0) > 0 && (
                                        <BillRow label="Discount" value={`−₹${order.discountShare}`} color={P.success} />
                                    )}
                                    <div style={{ height: 1, background: P.border, margin: "6px 0" }} />
                                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 17 }}>
                                        <span>Total</span>
                                        <span>₹{(order.total || 0).toLocaleString("en-IN")}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tax Breakdown */}
                            {(order.taxAmount || order.cgst || order.sgst) && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                                        Tax Breakdown
                                    </div>
                                    <div style={{ background: P.surface, borderRadius: 14, border: `1px solid ${P.border}`, padding: "14px 18px" }} className="col gap6">
                                        {order.cgst > 0 && <BillRow label="CGST" value={`₹${order.cgst?.toFixed(2)}`} muted />}
                                        {order.sgst > 0 && <BillRow label="SGST" value={`₹${order.sgst?.toFixed(2)}`} muted />}
                                        <BillRow label="Total Tax" value={`₹${order.taxAmount?.toFixed(2) || "0.00"}`} />
                                    </div>
                                </div>
                            )}

                            {/* Seller Breakdown (for grouped orders) */}
                            {order.paymentGroupId && (
                                <div style={{ background: P.surface, borderRadius: 14, border: `1px solid ${P.border}`, padding: "14px 18px" }} className="col gap4">
                                    <div style={{ fontSize: 11, fontWeight: 700, color: P.textMuted, textTransform: "uppercase" }}>Payment Group</div>
                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: P.textMuted }}>{order.paymentGroupId}</div>
                                </div>
                            )}

                            {/* Refund Info */}
                            {order.refundStatus && order.refundStatus !== "none" && (
                                <div style={{
                                    background: "#FBBF2410", border: `1px solid #FBBF2422`,
                                    borderRadius: 12, padding: 14,
                                }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#FBBF24", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                                        ↩ Refund {order.refundStatus.charAt(0).toUpperCase() + order.refundStatus.slice(1)}
                                    </div>
                                    {order.refundAmount > 0 && (
                                        <div style={{ fontSize: 14, fontWeight: 700 }}>₹{order.refundAmount.toLocaleString("en-IN")}</div>
                                    )}
                                    {order.refundedAt && (
                                        <div style={{ fontSize: 11, color: P.textMuted, marginTop: 4 }}>Processed on {formatDate(order.refundedAt)}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Footer Actions ──────────────────────────────────────────── */}
                <div style={{
                    padding: "14px 20px", borderTop: `1px solid ${P.border}`,
                    display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0,
                    background: P.card,
                }}>
                    {canTrack && (
                        <button className="p-btn p-btn-primary" style={{ flex: 1 }} onClick={() => { onClose(); onTrack(order); }}>
                            🗺 Track Order
                        </button>
                    )}
                    {canRate && (
                        <button className="p-btn" style={{ flex: 1, background: "#FBBF2420", color: "#FBBF24", border: "1px solid #FBBF2444" }} onClick={() => onRate(order)}>
                            ⭐ Rate Order
                        </button>
                    )}
                    {canReorder && (
                        <button className="p-btn" style={{ flex: 1, background: `${P.success}12`, color: P.success, border: `1px solid ${P.success}33` }} onClick={() => { onClose(); onReorder(order); }}>
                            🔄 Reorder
                        </button>
                    )}
                    {canCancel && (
                        <button className="p-btn p-btn-danger" onClick={() => onCancel(order)}>
                            ✕ Cancel
                        </button>
                    )}
                    
                    {/* ── NEW: Help Button ── */}
                    <button className="p-btn" style={{ flex: 1, background: `${P.accent}12`, color: P.accent, border: `1px solid ${P.accent}33` }} onClick={() => setShowSupport(true)}>
                        🎧 Help / Support
                    </button>

                    {!canTrack && !canRate && !canReorder && !canCancel && (
                        <button className="p-btn p-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
                    )}
                </div>
            </div>

            {/* ── Help / Support Issue Modal ── */}
            {showSupport && (
                <SupportIssueModal 
                    order={order} 
                    onClose={() => setShowSupport(false)} 
                />
            )}
        </div>,
        document.body
    );
}

function BillRow({ label, value, muted, color }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: color || (muted ? P.textMuted : P.text) }}>
            <span>{label}</span><span style={{ fontWeight: muted ? 400 : 600 }}>{value}</span>
        </div>
    );
}

// ── Item-Level Support Modal ───────────────────────────────────────────────────
function SupportIssueModal({ order, onClose }) {
    const [selectedItems, setSelectedItems] = useState([]);
    const [reasonCategory, setReasonCategory] = useState("");
    const [issue, setIssue] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const toggleItem = (item) => {
        const itemId = item.productId || item._id || item.id;
        setSelectedItems(prev => prev.some(p => p.productId === itemId)
            ? prev.filter(p => p.productId !== itemId)
            : [...prev, { productId: itemId, name: item.name, qty: item.qty }]
        );
    };

    const submitTicket = async () => {
        if (!issue || !reasonCategory) return;
        setLoading(true);
        try {
            // Send advanced ticket payload
            await api.post("/tickets", {
                orderId: order._id,
                problemItems: selectedItems,
                reasonCategory,
                issue
            });
            setSuccess(true);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const reasons = [
        { id: "missing_item", label: "Item(s) Missing", icon: "📦" },
        { id: "damaged_item", label: "Damaged/Spoiled", icon: "💥" },
        { id: "wrong_item", label: "Wrong Item Received", icon: "🔄" },
        { id: "quality_issue", label: "Poor Quality", icon: "🤢" },
        { id: "delivery_delay", label: "Delivery Too Late", icon: "⏳" },
        { id: "other", label: "Other Issue", icon: "ℹ️" },
    ];

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
            <div style={{ 
                background: P.bg, width: "100%", maxWidth: 520, borderRadius: "24px 24px 0 0", 
                padding: "0", maxHeight: "90vh", display: "flex", flexDirection: "column",
                borderTop: `1px solid ${P.border}`, borderLeft: `1px solid ${P.border}`, borderRight: `1px solid ${P.border}`
            }} onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${P.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Raise an Issue</h2>
                        <div style={{ fontSize: 13, color: P.textMuted, marginTop: 4 }}>Order #{order._id?.slice(-6).toUpperCase()}</div>
                    </div>
                    <button onClick={onClose} style={{
                        background: P.surface, border: `1px solid ${P.border}`, borderRadius: "50%", width: 32, height: 32,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: P.textMuted, fontSize: 14,
                    }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: 24 }} className="col gap20">
                    {success ? (
                        <div style={{ textAlign: "center", padding: "40px 0" }}>
                            <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
                            <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Ticket Submitted!</div>
                            <div style={{ color: P.textMuted, fontSize: 14, marginBottom: 24 }}>Our support team is reviewing your issue and will respond shortly. You can track this in your Inbox.</div>
                            <button className="p-btn p-btn-primary" onClick={onClose}>Done</button>
                        </div>
                    ) : (
                        <>
                            {/* Step 1: Select Items */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 700, color: P.textDim, textTransform: "uppercase" }}>1. Which items have an issue? (Optional)</label>
                                <div style={{ marginTop: 12, border: `1px solid ${P.border}`, borderRadius: 12, overflow: "hidden" }}>
                                    {order.items?.map((item, i) => {
                                        const itemId = item.productId || item._id || item.id;
                                        const isSelected = selectedItems.some(p => p.productId === itemId);
                                        return (
                                            <div key={i} onClick={() => toggleItem(item)} style={{
                                                padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
                                                background: isSelected ? `${P.primary}10` : P.surface,
                                                borderBottom: i < order.items.length - 1 ? `1px solid ${P.border}` : "none",
                                                cursor: "pointer"
                                            }}>
                                                <div style={{ 
                                                    width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? P.primary : P.border}`,
                                                    background: isSelected ? P.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: P.card, fontSize: 12, fontWeight: 800
                                                }}>
                                                    {isSelected && "✓"}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", background: P.card, padding: 6, borderRadius: 8, flexShrink: 0 }}>
                                                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} /> : <span style={{ fontSize: 20 }}>📦</span>}
                                                </div>
                                                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                                                <div style={{ fontSize: 13, color: P.textMuted }}>x{item.qty}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Step 2: Reason Category */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 700, color: P.textDim, textTransform: "uppercase" }}>2. What is the issue?</label>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                                    {reasons.map(r => (
                                        <div key={r.id} onClick={() => setReasonCategory(r.id)} style={{
                                            padding: "12px", borderRadius: 12, border: `2px solid ${reasonCategory === r.id ? P.primary : P.border}`,
                                            background: reasonCategory === r.id ? `${P.primary}10` : P.surface,
                                            cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all .2s"
                                        }}>
                                            <span style={{ fontSize: 20 }}>{r.icon}</span>
                                            <span style={{ fontSize: 13, fontWeight: reasonCategory === r.id ? 700 : 500 }}>{r.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Step 3: Description */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 700, color: P.textDim, textTransform: "uppercase" }}>3. Describe the problem in detail</label>
                                <textarea className="p-input" rows="4" style={{ marginTop: 12, resize: "none" }} placeholder="Please provide details so we can help you quickly..." value={issue} onChange={e => setIssue(e.target.value)} />
                            </div>

                            <button className="p-btn p-btn-primary" onClick={submitTicket} disabled={!issue || !reasonCategory || loading} style={{ height: 50, fontSize: 15 }}>
                                {loading ? <span className="spinner" /> : "Submit Support Ticket 🚀"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default OrderDetailSheet;
