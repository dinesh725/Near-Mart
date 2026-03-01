import React, { useState } from "react";
import { P } from "../../theme/theme";
import { useStore } from "../../context/GlobalStore";
import { fmtFull } from "../../utils/helpers";

const STATUS_COLOR = { PENDING: P.warning, CONFIRMED: P.primary, PREPARING: "#8B5CF6", ACCEPTED: P.primary, READY_FOR_PICKUP: P.accent, OUT_FOR_DELIVERY: "#F59E0B", DELIVERED: P.success, CANCELLED: P.danger };

export function AdminDashboard({ activeTab }) {
    const { orders, products, tickets, resetData } = useStore();
    const [alerts, setAlerts] = useState([
        { id: 1, level: "critical", title: "Payment Gateway Latency", body: "Razorpay p95 > 800ms. Auto-fallback to CCAvenue active.", dismissed: false, escalated: false },
        { id: 2, level: "warning", title: "Rider Shortage — Pune", body: "Demand surge detected. Surge pricing 1.2x auto-enabled.", dismissed: false, escalated: false },
        { id: 3, level: "info", title: "New City: Ahmedabad", body: "Dark Store partners signed. Go-live: Apr 5, 2025.", dismissed: false, escalated: false },
    ]);

    const totalGMV = orders.filter(o => o.status === "DELIVERED").reduce((s, o) => s + o.total, 0);
    const totalOrders = orders.length;
    const lowStock = products.filter(p => p.stock < 10).length;
    const openTickets = tickets.filter(t => t.status !== "resolved").length;
    const activeAlerts = alerts.filter(a => !a.dismissed);

    // ── TABS ──────────────────────────────────────────────────────────────────
    const OverviewTab = () => (
        <div className="col gap20">
            <div className="row-between">
                <div>
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>🛡 Platform Intelligence</h2>
                    <p style={{ color: P.textMuted, fontSize: 13 }}>Pan-India Operations · Admin Dashboard</p>
                </div>
                <button className="p-btn p-btn-danger p-btn-sm" onClick={() => { if (window.confirm("Reset all demo data?")) resetData(); }}>Reset Data</button>
            </div>

            <div className="plat-grid">
                {[
                    { label: "Total GMV (Delivered)", val: fmtFull(totalGMV), sub: "Platform revenue", color: P.success },
                    { label: "All Orders", val: totalOrders, sub: `${orders.filter(o => !["DELIVERED", "CANCELLED"].includes(o.status)).length} active`, color: P.primary },
                    { label: "Active Alerts", val: activeAlerts.length, sub: `${activeAlerts.filter(a => a.level === "critical").length} critical`, color: activeAlerts.length > 0 ? P.danger : P.textMuted },
                    { label: "Open Tickets", val: openTickets, sub: "Support queue", color: P.warning },
                    { label: "Low Stock SKUs", val: lowStock, sub: "< 10 units", color: lowStock > 0 ? P.danger : P.textMuted },
                    { label: "Total SKUs", val: products.length, sub: "Catalog size", color: P.accent },
                ].map(s => (
                    <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                        <div className="p-label">{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                        <div style={{ fontSize: 12, color: P.textMuted, marginTop: 4 }}>{s.sub}</div>
                    </div>
                ))}
            </div>

            {/* Alerts */}
            {activeAlerts.length > 0 && (
                <div className="p-card col gap12">
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>🚨 Platform Alerts</h3>
                    {activeAlerts.map(a => (
                        <div key={a.id} className="ticket" style={{ borderColor: a.level === "critical" ? P.danger + "44" : a.level === "warning" ? P.warning + "44" : P.primary + "44" }}>
                            <span className={`p-badge ${a.level === "critical" ? "p-badge-danger" : a.level === "warning" ? "p-badge-warning" : "p-badge-primary"}`} style={{ fontSize: 10, alignSelf: "flex-start", flexShrink: 0 }}>{a.level.toUpperCase()}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.title}</div>
                                <div style={{ fontSize: 12, color: P.textMuted, lineHeight: 1.5 }}>{a.body}</div>
                                {a.escalated && <div style={{ fontSize: 11, color: P.warning, marginTop: 6 }}>⬆ Escalated to Engineering</div>}
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                    {!a.escalated && <button className="p-btn p-btn-ghost p-btn-sm" style={{ fontSize: 12 }} onClick={() => setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, escalated: true } : x))}>⬆ Escalate</button>}
                                    <button className="p-btn p-btn-sm" style={{ background: P.textDim + "33", color: P.textMuted, border: "none", fontSize: 12 }} onClick={() => setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, dismissed: true } : x))}>✕ Dismiss</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const UsersTab = () => {
        const { USERS_DB } = require("../../auth/AuthContext");
        return (
            <div className="col gap14">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>👥 User Management ({USERS_DB.length})</h2>
                {USERS_DB.map(u => (
                    <div key={u.role} className="p-card row-between" style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <div className="p-avatar" style={{ background: P.primary + "33", color: P.primary, border: `1px solid ${P.primary}44` }}>{u.avatar}</div>
                            <div>
                                <div style={{ fontWeight: 700 }}>{u.name}</div>
                                <div style={{ fontSize: 12, color: P.textMuted }}>{u.email}</div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span className="p-badge p-badge-muted" style={{ fontSize: 11 }}>{u.role.toUpperCase()}</span>
                            <span className="p-badge p-badge-success" style={{ fontSize: 10 }}>ACTIVE</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const OrdersTab = () => (
        <div className="col gap14">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📋 All Orders ({orders.length})</h2>
            <div className="col gap10">
                {orders.map(o => (
                    <div key={o.id} className="p-card">
                        <div className="row-between mb8">
                            <div>
                                <div style={{ fontWeight: 700 }}>{o.id} <span style={{ color: P.textMuted, fontWeight: 400, fontSize: 12 }}>· {o.customerName} → {o.storeName}</span></div>
                                <div style={{ fontSize: 12, color: P.textMuted }}>{new Date(o.createdAt).toLocaleString("en-IN")}</div>
                            </div>
                            <div style={{ background: STATUS_COLOR[o.status] + "22", color: STATUS_COLOR[o.status], borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                                {o.status.replace(/_/g, " ")}
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                            <span>₹{o.total}</span>
                            <span style={{ color: P.textMuted }}>{o.items.length} items · {o.paymentMethod}</span>
                            {o.flagged && <span style={{ color: P.danger, fontWeight: 700 }}>🚩 Flagged</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // System logs — admin only (guard enforced by role, section not rendered for other roles via PlatformShell routing)
    const LogsTab = () => (
        <div className="col gap14">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>🔒 System Logs</h2>
                <span className="p-badge p-badge-danger" style={{ fontSize: 10 }}>ADMIN ONLY</span>
            </div>
            <div className="p-card col gap10">
                {[
                    { time: "03:45:21", level: "INFO", msg: `Order ORD-9011 placed by Priya Sharma — ₹349` },
                    { time: "03:44:10", level: "WARN", msg: `Stock alert: Spinach (Fresh Bunch) = 0 units` },
                    { time: "03:42:05", level: "INFO", msg: `Notification sent to seller for ORD-9011` },
                    { time: "03:41:00", level: "INFO", msg: `Session started: admin@nearmart.in (ADMIN)` },
                    { time: "03:40:33", level: "INFO", msg: `Order ORD-9010 delivered by Ramesh Kumar` },
                    { time: "03:38:21", level: "WARN", msg: `Payment gateway latency p95 = 820ms` },
                ].map((log, i) => (
                    <div key={i} style={{ fontFamily: "monospace", fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${P.border}44`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ color: P.textMuted, flexShrink: 0 }}>{log.time}</span>
                        <span style={{ color: log.level === "WARN" ? P.warning : P.success, fontWeight: 700, flexShrink: 0 }}>[{log.level}]</span>
                        <span>{log.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    const tabs = [<OverviewTab />, <UsersTab />, <OrdersTab />, <LogsTab />];
    return <div>{tabs[activeTab] || <OverviewTab />}</div>;
}
