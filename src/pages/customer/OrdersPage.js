import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { P } from "../../theme/theme";
import api from "../../api/client";
import socketManager from "../../utils/socketManager";
import { OrderDetailSheet } from "./OrderDetailSheet";
import { PullToRefresh } from "../../components/PullToRefresh";
// ── Status Configuration ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
    PENDING_PAYMENT: { color: "#FFB800", icon: "⏳", label: "Pending Payment" },
    CONFIRMED: { color: P.primary, icon: "✅", label: "Confirmed" },
    PREPARING: { color: "#8B5CF6", icon: "👨‍🍳", label: "Preparing" },
    READY_FOR_PICKUP: { color: P.accent, icon: "📦", label: "Ready" },
    OUT_FOR_DELIVERY: { color: "#3B82F6", icon: "🛵", label: "Out for Delivery" },
    DELIVERED: { color: P.success, icon: "🎉", label: "Delivered" },
    CANCELLED: { color: P.danger, icon: "❌", label: "Cancelled" },
    REJECTED: { color: "#F87171", icon: "🚫", label: "Rejected" },
};

const FILTER_TABS = [
    { key: "ALL", label: "All", icon: "📋", statusQuery: "" },
    { key: "ACTIVE", label: "Active", icon: "🔄", statusQuery: "PENDING_PAYMENT,CONFIRMED,PREPARING,READY_FOR_PICKUP,OUT_FOR_DELIVERY" },
    { key: "DELIVERED", label: "Delivered", icon: "✅", statusQuery: "DELIVERED" },
    { key: "CANCELLED", label: "Cancelled", icon: "❌", statusQuery: "CANCELLED,REJECTED" },
];

// ── Utility: Group orders by time period ──────────────────────────────────────
function groupOrdersByPeriod(orders) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 30);

    const groups = [];
    const buckets = { today: [], yesterday: [], week: [], month: [], older: [] };

    for (const order of orders) {
        const d = new Date(order.createdAt);
        if (d >= todayStart) buckets.today.push(order);
        else if (d >= yesterdayStart) buckets.yesterday.push(order);
        else if (d >= weekStart) buckets.week.push(order);
        else if (d >= monthStart) buckets.month.push(order);
        else buckets.older.push(order);
    }

    if (buckets.today.length > 0) groups.push({ label: "Today", orders: buckets.today });
    if (buckets.yesterday.length > 0) groups.push({ label: "Yesterday", orders: buckets.yesterday });
    if (buckets.week.length > 0) groups.push({ label: "Last 7 Days", orders: buckets.week });
    if (buckets.month.length > 0) groups.push({ label: "Last 30 Days", orders: buckets.month });
    if (buckets.older.length > 0) groups.push({ label: "Earlier", orders: buckets.older });

    return groups;
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────
function OrderSkeleton() {
    return (
        <div className="col gap12">
            {[1, 2, 3].map(i => (
                <div key={i} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div className="skeleton" style={{ width: 120, height: 16 }} />
                        <div className="skeleton" style={{ width: 100, height: 24, borderRadius: 20 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {[1, 2, 3].map(j => <div key={j} className="skeleton" style={{ width: 44, height: 44, borderRadius: 10 }} />)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div className="skeleton" style={{ width: 80, height: 14 }} />
                        <div className="skeleton" style={{ width: 60, height: 14 }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Order Card Component ──────────────────────────────────────────────────────
function OrderCard({ order, onViewDetail, onTrack, onCancel, onReorder }) {
    const sc = STATUS_CONFIG[order.status] || { color: P.textMuted, icon: "❓", label: order.status };
    const canCancel = ["PENDING_PAYMENT", "CONFIRMED", "PREPARING"].includes(order.status);
    const canTrack = order.pickupLocation && order.dropLocation && ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(order.status);
    const canReorder = ["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status);

    const formatDate = (d) => {
        const date = new Date(d);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return "Just now";
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
    };

    return (
        <div style={{
            background: P.card, border: `1px solid ${P.border}`, borderRadius: 16,
            padding: "16px 18px", transition: "all .25s", cursor: "pointer",
            position: "relative", overflow: "hidden",
        }}
            onClick={() => onViewDetail(order)}
        >
            {/* Accent border-left */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sc.color, borderRadius: "16px 0 0 16px" }} />

            {/* Header Row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                        #{order._id?.slice(-6).toUpperCase() || "------"}
                    </div>
                    <div style={{ fontSize: 12, color: P.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{formatDate(order.createdAt)}</span>
                        {order.storeName && (
                            <>
                                <span style={{ opacity: 0.4 }}>·</span>
                                <span>🏪 {order.storeName}</span>
                            </>
                        )}
                    </div>
                </div>
                <div style={{
                    background: sc.color + "18", color: sc.color,
                    border: `1.5px solid ${sc.color}44`, borderRadius: 20,
                    padding: "4px 12px", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                }}>
                    {sc.icon} {sc.label}
                </div>
            </div>

            {/* Items Preview */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {order.items?.slice(0, 4).map((item, idx) => (
                    <div key={idx} style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: P.surface, display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1px solid ${P.border}`, overflow: "hidden", flexShrink: 0,
                    }}>
                        {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 20 }}>{item.emoji || "📦"}</span>
                        }
                    </div>
                ))}
                {order.items?.length > 4 && (
                    <div style={{
                        width: 42, height: 42, borderRadius: 10, background: P.surface,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: P.textMuted,
                        border: `1px solid ${P.border}`,
                    }}>+{order.items.length - 4}</div>
                )}
                <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
                    <div style={{ fontSize: 12, color: P.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {order.items?.map(i => i.name).join(", ")}
                    </div>
                </div>
            </div>

            {/* Footer Row: Price + Address + Payment */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>₹{order.total?.toLocaleString("en-IN")}</span>
                    <span style={{ fontSize: 11, color: P.textMuted }}>{order.items?.length} item{order.items?.length !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {order.paymentStatus === "paid" && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: P.success, background: `${P.success}15`, padding: "2px 8px", borderRadius: 6 }}>
                            💳 Paid
                        </span>
                    )}
                    {order.paymentStatus === "refunded" && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#FBBF24", background: "rgba(251,191,36,0.15)", padding: "2px 8px", borderRadius: 6 }}>
                            ↩ Refunded
                        </span>
                    )}
                    {order.paymentMethod && (
                        <span style={{ fontSize: 10, color: P.textMuted }}>
                            {order.paymentMethod === "wallet" ? "👛" : order.paymentMethod === "razorpay" ? "💳" : "🔀"} {order.paymentMethod}
                        </span>
                    )}
                </div>
            </div>

            {/* Delivery Address Preview */}
            {order.address && (
                <div style={{ fontSize: 11, color: P.textMuted, marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 4 }}>
                    <span style={{ flexShrink: 0 }}>📍</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.address}</span>
                </div>
            )}

            {/* Rating if delivered */}
            {order.customerRating && (
                <div style={{ fontSize: 12, color: "#FBBF24", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    {"⭐".repeat(order.customerRating)}
                    <span style={{ color: P.textMuted, marginLeft: 4 }}>{order.customerReview ? `"${order.customerReview.slice(0, 40)}..."` : ""}</span>
                </div>
            )}

            {/* Action Buttons — responsive grid so all buttons always show */}
            <div style={{ display: "grid", gridTemplateColumns: canCancel ? "1fr 1fr auto" : "1fr 1fr", gap: 6 }} onClick={e => e.stopPropagation()}>
                {canTrack ? (
                    <button className="p-btn p-btn-sm" style={{ background: `${P.primary}15`, color: P.primary, border: `1px solid ${P.primary}33`, minWidth: 0, fontSize: 12, padding: "6px 8px" }} onClick={() => onTrack(order)}>
                        🗺 Track
                    </button>
                ) : (
                    <button className="p-btn p-btn-sm" style={{ background: P.surface, color: P.text, border: `1px solid ${P.border}`, minWidth: 0, fontSize: 12, padding: "6px 8px" }} onClick={() => onViewDetail(order)}>
                        📋 Details
                    </button>
                )}
                {canReorder ? (
                    <button className="p-btn p-btn-sm" style={{ background: `${P.success}15`, color: P.success, border: `1px solid ${P.success}33`, minWidth: 0, fontSize: 12, padding: "6px 8px", fontWeight: 700 }} onClick={() => onReorder(order)}>
                        🔄 Reorder
                    </button>
                ) : (
                    <button className="p-btn p-btn-sm" style={{ background: P.surface, color: P.text, border: `1px solid ${P.border}`, minWidth: 0, fontSize: 12, padding: "6px 8px" }} onClick={() => onViewDetail(order)}>
                        📋 Details
                    </button>
                )}
                {canCancel && (
                    <button className="p-btn p-btn-sm" style={{ background: `${P.danger}12`, color: P.danger, border: `1px solid ${P.danger}33`, minWidth: 0, fontSize: 12, padding: "6px 8px" }} onClick={() => onCancel(order)}>
                        ✕ Cancel
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Cancel Order Modal ────────────────────────────────────────────────────────
function CancelModal({ order, onClose, onConfirm }) {
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCancel = async () => {
        if (!reason.trim()) return;
        setLoading(true);
        await onConfirm(order._id, reason);
        setLoading(false);
        onClose();
    };

    if (typeof document === 'undefined') return null;
    return ReactDOM.createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
            <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: 24, maxWidth: 400, width: "100%" }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontWeight: 800, fontSize: 18, margin: "0 0 16px" }}>Cancel Order?</h3>
                <p style={{ fontSize: 13, color: P.textMuted, marginBottom: 16 }}>
                    Order #{order._id?.slice(-6).toUpperCase()} · ₹{order.total}
                </p>
                <label style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>Reason for cancellation *</label>
                <input
                    className="p-input" placeholder="e.g. Changed my mind, found cheaper, ordered wrong item..."
                    value={reason} onChange={e => setReason(e.target.value)}
                    style={{ marginTop: 8, marginBottom: 16 }}
                    autoFocus
                />
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="p-btn p-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Keep Order</button>
                    <button className="p-btn p-btn-danger" style={{ flex: 1 }} disabled={!reason.trim() || loading} onClick={handleCancel}>
                        {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Cancel Order"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Rate Order Modal ──────────────────────────────────────────────────────────
function RateModal({ order, onClose, onSubmit }) {
    const [rating, setRating] = useState(0);
    const [review, setReview] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (rating < 1) return;
        setLoading(true);
        await onSubmit(order._id, rating, review);
        setLoading(false);
        onClose();
    };

    if (typeof document === 'undefined') return null;
    return ReactDOM.createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
            <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: 24, maxWidth: 400, width: "100%", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>⭐</div>
                <h3 style={{ fontWeight: 800, fontSize: 18, margin: "0 0 4px" }}>Rate Your Order</h3>
                <p style={{ fontSize: 12, color: P.textMuted, marginBottom: 20 }}>#{order._id?.slice(-6).toUpperCase()}</p>

                {/* Star Rating */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} onClick={() => setRating(star)} style={{
                            background: "none", border: "none", fontSize: 32, cursor: "pointer",
                            filter: star <= rating ? "none" : "grayscale(1) opacity(0.3)",
                            transition: "all .15s", transform: star <= rating ? "scale(1.1)" : "scale(1)",
                        }}>⭐</button>
                    ))}
                </div>

                <textarea
                    className="p-input" placeholder="Share your experience (optional)..."
                    value={review} onChange={e => setReview(e.target.value)}
                    style={{ marginBottom: 16, minHeight: 80, resize: "vertical" }}
                    maxLength={1000}
                />

                <div style={{ display: "flex", gap: 8 }}>
                    <button className="p-btn p-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Skip</button>
                    <button className="p-btn p-btn-primary" style={{ flex: 1 }} disabled={rating < 1 || loading} onClick={handleSubmit}>
                        {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : `Submit ${rating}★ Rating`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ██ MAIN ORDERS PAGE COMPONENT ██
// ══════════════════════════════════════════════════════════════════════════════
export function OrdersPage({ onTrackOrder, setActiveTab, onReorderToCart, customerGps }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [activeFilter, setActiveFilter] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [statusCounts, setStatusCounts] = useState({});
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [rateTarget, setRateTarget] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [reorderErrors, setReorderErrors] = useState(null);
    const searchTimerRef = useRef(null);
    const orderSentinelRef = useRef(null);

    // ── Fetch orders from backend (infinite scroll) ───────────────────────────
    const fetchOrders = useCallback(async (page = 1) => {
        if (page === 1) setLoading(true);
        else setLoadingMore(true);
        try {
            const params = new URLSearchParams({ page, limit: 20 });
            const tab = FILTER_TABS.find(t => t.key === activeFilter);
            if (tab?.statusQuery) params.set("status", tab.statusQuery);
            if (searchQuery) params.set("search", searchQuery);

            const res = await api.get(`/orders?${params}`);
            if (res.ok) {
                if (page === 1) {
                    setOrders(res.orders || []);
                } else {
                    setOrders(prev => [...prev, ...(res.orders || [])]);
                }
                setPagination(res.pagination || { page: 1, pages: 1, total: 0 });
            }
        } catch (err) {
            console.error("Failed to fetch orders:", err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [activeFilter, searchQuery]);

    // ── Fetch status counts for filter badges ─────────────────────────────────
    const fetchCounts = useCallback(async () => {
        try {
            const res = await api.get("/orders/stats/counts");
            if (res.ok) setStatusCounts(res.counts || {});
        } catch { }
    }, []);

    // Load on mount and when filters change
    useEffect(() => { fetchOrders(1); }, [fetchOrders, refreshKey]);
    useEffect(() => { fetchCounts(); }, [fetchCounts, refreshKey]);

    // ── Real-time WebSocket: auto-refresh on order status changes ──────────
    useEffect(() => {
        const socket = socketManager.getSocket();
        if (!socket) return;

        const handleStatusUpdate = (data) => {
            console.log("[Orders] Real-time status update:", data);
            setRefreshKey(k => k + 1);
        };

        const handleNewOrder = () => {
            setRefreshKey(k => k + 1);
        };

        socket.on("deliveryStatusUpdate", handleStatusUpdate);
        socket.on("orderStatusChanged", handleStatusUpdate);
        socket.on("newOrder", handleNewOrder);

        return () => {
            socket.off("deliveryStatusUpdate", handleStatusUpdate);
            socket.off("orderStatusChanged", handleStatusUpdate);
            socket.off("newOrder", handleNewOrder);
        };
    }, []);

    // ── IntersectionObserver for orders infinite scroll ────────────────────
    useEffect(() => {
        if (!orderSentinelRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && pagination.page < pagination.pages && !loadingMore && !loading) {
                    fetchOrders(pagination.page + 1);
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(orderSentinelRef.current);
        return () => observer.disconnect();
    }, [pagination, loadingMore, loading, fetchOrders]);

    // ── Auto-refresh when user returns to the app (mobile/tab switch) ──────
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                setRefreshKey(k => k + 1);
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, []);

    // Debounced search
    const handleSearchChange = (val) => {
        setSearchInput(val);
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setSearchQuery(val);
        }, 500);
    };

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleCancel = async (orderId, reason) => {
        const res = await api.patch(`/orders/${orderId}/cancel`, { reason });
        if (res.ok) {
            setRefreshKey(k => k + 1);
        }
    };

    const handleRate = async (orderId, rating, review) => {
        const res = await api.post(`/orders/${orderId}/rate`, { rating, review });
        if (res.ok) {
            setRefreshKey(k => k + 1);
        }
    };

    const handleReorder = async (order) => {
        try {
            // Send customer GPS so backend can enforce delivery radius check
            const body = {};
            if (customerGps?.lat && customerGps?.lng) {
                body.lat = customerGps.lat;
                body.lng = customerGps.lng;
            }
            const res = await api.post(`/orders/${order._id}/reorder`, body);
            if (res.ok) {
                const { cartItems = [], unavailable = [], unavailableReasons = {} } = res;
                if (cartItems.length === 0) {
                    // Show detailed reasons why items are unavailable
                    const reasons = unavailable.map(name =>
                        ({ name, reason: unavailableReasons[name] || "Not available" })
                    );
                    setReorderErrors({
                        message: "None of the items from this order are currently available for delivery to your location.",
                        reasons
                    });
                    return;
                }
                // Pass items to parent to populate cart and switch tab
                if (onReorderToCart) {
                    onReorderToCart(cartItems, unavailable);
                }
            } else {
                setReorderErrors({
                    message: res.error || "Could not reorder. Please try again.",
                    reasons: []
                });
            }
        } catch (err) {
            setReorderErrors({
                message: "Network error. Please check your connection and try again.",
                reasons: []
            });
        }
    };

    const handleFlagOrder = async (orderId, issue) => {
        await api.patch(`/orders/${orderId}/flag`, { issue });
        setRefreshKey(k => k + 1);
    };

    // ── Compute filter badge counts ───────────────────────────────────────────
    const getFilterCount = (key) => {
        const c = statusCounts;
        switch (key) {
            case "ALL": return c.ALL || 0;
            case "ACTIVE": return (c.PENDING_PAYMENT || 0) + (c.CONFIRMED || 0) + (c.PREPARING || 0) + (c.READY_FOR_PICKUP || 0) + (c.OUT_FOR_DELIVERY || 0);
            case "DELIVERED": return c.DELIVERED || 0;
            case "CANCELLED": return (c.CANCELLED || 0) + (c.REJECTED || 0);
            default: return 0;
        }
    };

    // Group orders by time period
    const groupedOrders = groupOrdersByPeriod(orders);

    return (
        <PullToRefresh onRefresh={() => fetchOrders(1)}>
        <div className="col gap16">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>📦 My Orders</h2>
                <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => { setRefreshKey(k => k + 1); }} style={{ fontSize: 12 }}>
                    🔄 Refresh
                </button>
            </div>

            {/* ── Search Bar ──────────────────────────────────────────────────── */}
            <div style={{ position: "relative" }}>
                <input
                    className="p-input"
                    placeholder="🔍 Search by order ID, product, store..."
                    value={searchInput}
                    onChange={e => handleSearchChange(e.target.value)}
                    style={{ paddingRight: searchInput ? 36 : undefined, paddingLeft: 14 }}
                />
                {searchInput && (
                    <button onClick={() => { setSearchInput(""); setSearchQuery(""); }}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: P.textMuted, fontSize: 16, cursor: "pointer" }}>
                        ✕
                    </button>
                )}
            </div>

            {/* ── Filter Tabs ─────────────────────────────────────────────────── */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }} className="cat-pills">
                {FILTER_TABS.map(tab => {
                    const count = getFilterCount(tab.key);
                    const isActive = activeFilter === tab.key;
                    return (
                        <button key={tab.key} onClick={() => setActiveFilter(tab.key)} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "7px 14px", borderRadius: 20,
                            border: `1.5px solid ${isActive ? P.primary : P.border}`,
                            background: isActive ? `${P.primary}18` : "transparent",
                            color: isActive ? P.primary : P.textMuted,
                            fontFamily: "'Sora', sans-serif", fontSize: 12, fontWeight: 600,
                            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                            transition: "all .2s",
                        }}>
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                            {count > 0 && (
                                <span style={{
                                    background: isActive ? P.primary : P.border,
                                    color: isActive ? "white" : P.textMuted,
                                    fontSize: 10, fontWeight: 800,
                                    padding: "1px 6px", borderRadius: 10, minWidth: 18, textAlign: "center",
                                }}>{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Orders List ──────────────────────────────────────────────────── */}
            {loading ? (
                <OrderSkeleton />
            ) : orders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.6 }}>
                        {activeFilter === "ALL" ? "📦" : activeFilter === "ACTIVE" ? "🔄" : activeFilter === "DELIVERED" ? "✅" : "❌"}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: P.text }}>
                        {searchQuery ? "No orders found" : activeFilter === "ALL" ? "No orders yet" : `No ${FILTER_TABS.find(t => t.key === activeFilter)?.label.toLowerCase()} orders`}
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 20, maxWidth: 280, margin: "0 auto 20px" }}>
                        {searchQuery
                            ? `No results for "${searchQuery}". Try a different search term.`
                            : activeFilter === "ALL"
                                ? "When you place your first order, it'll appear here"
                                : "Orders with this status will appear here"}
                    </div>
                    {searchQuery ? (
                        <button className="p-btn p-btn-ghost" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>Clear Search</button>
                    ) : activeFilter !== "ALL" ? (
                        <button className="p-btn p-btn-ghost" onClick={() => setActiveFilter("ALL")}>View All Orders</button>
                    ) : (
                        <button className="p-btn p-btn-primary" onClick={() => setActiveTab?.(0)}>Start Shopping</button>
                    )}
                </div>
            ) : (
                <div className="col gap20">
                    {/* Time-grouped order list */}
                    {groupedOrders.map(group => (
                        <div key={group.label}>
                            <div style={{
                                fontSize: 11, fontWeight: 700, color: P.textMuted,
                                textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
                                display: "flex", alignItems: "center", gap: 8,
                            }}>
                                <span>{group.label}</span>
                                <div style={{ flex: 1, height: 1, background: P.border }} />
                                <span style={{ fontSize: 10, color: P.textDim }}>{group.orders.length}</span>
                            </div>
                            <div className="col gap12">
                                {group.orders.map(order => (
                                    <OrderCard
                                        key={order._id}
                                        order={order}
                                        onViewDetail={setSelectedOrder}
                                        onTrack={onTrackOrder}
                                        onCancel={setCancelTarget}
                                        onReorder={handleReorder}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Infinite scroll sentinel for orders */}
                    {pagination.page < pagination.pages && (
                        <div ref={orderSentinelRef} style={{ textAlign: "center", padding: "20px 0" }}>
                            <div style={{
                                display: "inline-flex", alignItems: "center", gap: 8,
                                fontSize: 13, color: P.textMuted, padding: "8px 16px",
                                background: P.surface, borderRadius: 20, border: `1px solid ${P.border}`
                            }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: P.primary, animation: "pulse 1.2s infinite" }} />
                                Loading older orders...
                            </div>
                        </div>
                    )}
                    {pagination.page >= pagination.pages && orders.length > 0 && (
                        <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: P.textDim }}>
                            ✅ You've seen all {pagination.total} orders
                        </div>
                    )}
                </div>
            )}

            {/* ── Order Detail Sheet ──────────────────────────────────────────── */}
            {selectedOrder && (
                <OrderDetailSheet
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onTrack={onTrackOrder}
                    onCancel={(o) => { setSelectedOrder(null); setCancelTarget(o); }}
                    onRate={(o) => { setSelectedOrder(null); setRateTarget(o); }}
                    onReorder={handleReorder}
                    onFlag={handleFlagOrder}
                />
            )}

            {/* ── Cancel Modal ─────────────────────────────────────────────────── */}
            {cancelTarget && (
                <CancelModal order={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} />
            )}

            {/* ── Rate Modal ──────────────────────────────────────────────────── */}
            {rateTarget && (
                <RateModal order={rateTarget} onClose={() => setRateTarget(null)} onSubmit={handleRate} />
            )}
        {/* ── Reorder Errors Modal ────────────────────────────────────────── */}
        {reorderErrors && typeof document !== "undefined" && ReactDOM.createPortal(
            <div style={{
                position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16
            }} onClick={() => setReorderErrors(null)}>
                <div style={{
                    background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, 
                    padding: "24px 20px", maxWidth: 400, width: "100%", textAlign: "center",
                    animation: "slideUp .3s ease"
                }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 42, marginBottom: 12 }}>🚫</div>
                    <h3 style={{ fontWeight: 800, fontSize: 18, color: P.text, marginBottom: 8, lineHeight: 1.3 }}>
                        Reorder Unavailable
                    </h3>
                    <p style={{ fontSize: 13, color: P.textMuted, marginBottom: 16 }}>
                        {reorderErrors.message}
                    </p>
                    
                    {reorderErrors.reasons?.length > 0 && (
                        <div style={{
                            background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12,
                            padding: "12px 14px", textAlign: "left", marginBottom: 20,
                            maxHeight: 180, overflowY: "auto"
                        }}>
                            {reorderErrors.reasons.map((r, i) => (
                                <div key={i} style={{ marginBottom: i < reorderErrors.reasons.length - 1 ? 8 : 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <span style={{ fontSize: 13, flexShrink: 0 }}>•</span>
                                    <div style={{ fontSize: 13 }}>
                                        <span style={{ fontWeight: 600, color: P.text }}>{r.name}:</span> <span style={{ color: P.danger }}>{r.reason}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <button className="p-btn p-btn-primary w-100" onClick={() => setReorderErrors(null)}>
                        Got it
                    </button>
                </div>
            </div>,
            document.body
        )}
        </div>
        </PullToRefresh>
    );
}

export default OrdersPage;
