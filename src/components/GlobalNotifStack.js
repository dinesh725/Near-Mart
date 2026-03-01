import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { P } from "../theme/theme";
import { useStore } from "../context/GlobalStore";
import { useAuth } from "../auth/AuthContext";

const TYPE_CONFIG = {
    order: { color: P.primary, icon: "🛒", label: "Order" },
    update: { color: P.success, icon: "📦", label: "Update" },
    ticket: { color: P.warning, icon: "🎧", label: "Ticket" },
    demand: { color: "#F59E0B", icon: "📈", label: "Demand" },
    alert: { color: P.danger, icon: "⚠", label: "Alert" },
    success: { color: P.success, icon: "✅", label: "Success" },
    info: { color: P.primary, icon: "ℹ", label: "Info" },
    stock: { color: P.warning, icon: "📦", label: "Stock" },
    payment: { color: "#F59E0B", icon: "💰", label: "Payment" },
    error: { color: P.danger, icon: "❌", label: "Error" },
};

function NotifItem({ toast, onClose }) {
    const timerRef = useRef(null);
    const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;

    useEffect(() => {
        timerRef.current = setTimeout(onClose, toast.duration || 4500);
        return () => clearTimeout(timerRef.current);
    }, [onClose, toast.duration]);

    return (
        <div style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            background: "#111827",
            border: `1px solid rgba(255,255,255,0.12)`,
            borderLeft: `4px solid ${cfg.color}`,
            borderRadius: 14, padding: "14px 16px",
            boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset`,
            minWidth: 300, position: "relative", overflow: "hidden",
            animation: "notifSlideIn .35s cubic-bezier(.34,1.56,.64,1)",
            pointerEvents: "all",
        }}>
            {/* Progress bar */}
            <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, background: "rgba(255,255,255,0.06)", width: "100%", borderRadius: "0 0 0 14px" }}>
                <div style={{
                    height: "100%", borderRadius: "0 0 0 14px",
                    background: cfg.color,
                    animation: `notifProgress ${toast.duration || 4500}ms linear forwards`,
                }} />
            </div>
            <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>{cfg.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{cfg.label}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.5, fontWeight: 500 }}>{toast.msg}</div>
            </div>
            <button onClick={onClose} style={{
                background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.5)",
                cursor: "pointer", fontSize: 14, padding: "4px 6px", borderRadius: 6, flexShrink: 0,
                lineHeight: 1, transition: "all .15s",
            }} aria-label="Dismiss notification"
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}>
                ✕
            </button>
        </div>
    );
}

export function GlobalNotifStack() {
    const { toasts, dismissToast } = useStore();
    const { role } = useAuth();

    const visible = toasts.filter(t => !t.forRole || t.forRole === role).slice(0, 5);

    if (visible.length === 0) return null;

    return ReactDOM.createPortal(
        <div style={{
            position: "fixed", top: 60, right: 16, zIndex: 999999,
            display: "flex", flexDirection: "column", gap: 10,
            pointerEvents: "none", maxWidth: 400,
        }} aria-live="polite" aria-label="Notifications">
            {visible.map(t => (
                <div key={t.id} style={{ pointerEvents: "all" }}>
                    <NotifItem toast={t} onClose={() => dismissToast(t.id)} />
                </div>
            ))}
        </div>,
        document.body
    );
}
