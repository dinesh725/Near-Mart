import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import DeliveryMap from './DeliveryMap';
import useLiveLocation from '../../hooks/useLiveLocation';
import { P } from '../../theme/theme';
import { useStore } from '../../context/GlobalStore';
import { PullToRefreshWrapper } from '../ui/PullToRefreshWrapper';

export function TrackOrderModal({ order, onClose }) {
    const orderId = order?._id || order?.id;
    const { liveLocation, socketState } = useLiveLocation(orderId, 'customer');
    const { fetchOrders } = useStore();
    const [routeInfo, setRouteInfo] = useState({
        distance: order?.deliveryDistance || 0,
        duration: order?.estimatedArrivalTime ? (new Date(order.estimatedArrivalTime) - Date.now()) / 1000 : 0
    });

    if (!order) return null;

    const isActive = order.status === "OUT_FOR_DELIVERY" || order.status === "READY_FOR_PICKUP";

    const modalContent = (
        <div style={{
            position: "fixed", inset: 0, zIndex: "var(--z-tracking, 10000)",
            background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
            justifyContent: "flex-end"
        }}>
            <div style={{
                background: P.bg, height: "90vh", borderTopLeftRadius: 24, borderTopRightRadius: 24,
                display: "flex", flexDirection: "column", overflow: "hidden",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.3)"
            }}>
                {/* Header */}
                <div className="row-between" style={{ padding: "16px 20px", borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>📍 Track Order</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {socketState === 'connected' && (
                            <span style={{ fontSize: 10, color: P.success, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.success, display: "inline-block" }} />
                                LIVE
                            </span>
                        )}
                        {socketState === 'reconnecting' && (
                            <span style={{ fontSize: 10, color: P.warning, fontWeight: 700 }}>⟳ Reconnecting...</span>
                        )}
                        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: P.textMuted }}>✕</button>
                    </div>
                </div>

                {/* Map Area */}
                <div style={{ flex: 1, position: "relative", background: "#e0e0e0" }}>
                    {order.pickupLocation && order.dropLocation ? (
                        <DeliveryMap
                            pickupLocation={order.pickupLocation}
                            dropLocation={order.dropLocation}
                            liveLocation={liveLocation || order.liveDeliveryLocation}
                            precalculatedRoute={order.routePolyline}
                            onRouteCalculated={setRouteInfo}
                        />
                    ) : (
                        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: P.textMuted, fontWeight: 600 }}>
                            Map routing in progress...
                        </div>
                    )}
                </div>

                {/* Info Box Area */}
                <PullToRefreshWrapper onRefresh={fetchOrders}>
                <div style={{ padding: "24px 20px", background: P.card, zIndex: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 24, background: P.primary + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                            {order.status === "DELIVERED" ? "🎉" :
                                order.status === "OUT_FOR_DELIVERY" ? "🛵" :
                                    order.status === "READY_FOR_PICKUP" ? "📦" : "⏳"}
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
                                {order.status === "DELIVERED" ? "Delivered!" :
                                    order.status === "OUT_FOR_DELIVERY" ? "Rider is on the way" :
                                        order.status === "READY_FOR_PICKUP" ? "Order ready at store" :
                                            "Preparing your order"}
                            </div>
                            <div style={{ fontSize: 13, color: P.textMuted }}>
                                Order ID: {orderId} • {order.items?.length || 0} items
                            </div>
                        </div>
                    </div>

                    {isActive && routeInfo?.duration > 0 && (
                        <div style={{ background: P.surface, padding: 16, borderRadius: 12, marginBottom: 16, border: `1px solid ${P.border}` }}>
                            <div style={{ color: P.success, fontWeight: 800, fontSize: 20, marginBottom: 4 }}>
                                ETA: {Math.ceil(routeInfo.duration / 60)} min
                            </div>
                            <div style={{ color: P.textMuted, fontSize: 14, fontWeight: 500 }}>
                                Distance remaining: {(routeInfo.distance / 1000).toFixed(1)} km
                            </div>
                        </div>
                    )}

                    {order.status === "OUT_FOR_DELIVERY" && order.riderName && (
                        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: P.primary + "11", borderRadius: 12, border: `1px solid ${P.primary}33`, marginBottom: 16 }}>
                            <div style={{ width: 40, height: 40, background: P.primary, color: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                                {order.riderName.charAt(0)}
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>{order.riderName} is arriving!</div>
                                <div style={{ fontSize: 12, color: P.textMuted }}>Make sure you are at {order.address?.split(',')[0] || 'drop location'}</div>
                            </div>
                        </div>
                    )}

                    <button className="p-btn w-100" style={{ background: P.text, color: P.bg, border: `1px solid ${P.border}`, fontSize: 16 }} onClick={onClose}>
                        Close Tracking
                    </button>
                </div>
                </PullToRefreshWrapper>
            </div>
        </div>
    );

    // Render via portal to avoid z-index/clipping issues
    const portalRoot = document.getElementById('portal-root') || document.body;
    return ReactDOM.createPortal(modalContent, portalRoot);
}
