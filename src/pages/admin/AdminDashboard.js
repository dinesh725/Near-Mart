import React, { useState, useEffect, useCallback } from "react";
import { P } from "../../theme/theme";
import { useStore } from "../../context/GlobalStore";
import { useAuth } from "../../auth/AuthContext";
import { fmtFull } from "../../utils/helpers";
import api from "../../api/client";

const STATUS_COLOR = { PENDING: P.warning, CONFIRMED: P.primary, PREPARING: "#8B5CF6", ACCEPTED: P.primary, READY_FOR_PICKUP: P.accent, OUT_FOR_DELIVERY: "#F59E0B", DELIVERED: P.success, CANCELLED: P.danger };

const ROLE_BADGE_COLOR = {
    super_admin: "#EF4444", admin: P.purple, support: P.warning,
    seller: P.success, vendor: "#F59E0B", delivery: P.accent, customer: P.primary,
};

const STATUS_BADGE = {
    active: { bg: P.success + "18", color: P.success, label: "ACTIVE" },
    suspended: { bg: P.danger + "18", color: P.danger, label: "SUSPENDED" },
    invited: { bg: P.warning + "18", color: P.warning, label: "INVITED" },
};

const cardStyle = {
    background: "rgba(255,255,255,0.03)", border: `1px solid ${P.border}44`,
    borderRadius: 16, padding: "14px 16px",
};

// ── Shared pill button ───────────────────────────────────────────────────────
const Pill = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
        padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
        background: active ? "linear-gradient(135deg,#3B6FFF,#6366F1)" : "rgba(255,255,255,0.06)",
        color: active ? "white" : P.textMuted, fontWeight: 700, fontSize: 11,
        fontFamily: "'Sora',sans-serif", textTransform: "uppercase", letterSpacing: 0.3,
    }}>{children}</button>
);

export function AdminDashboard({ activeTab }) {
    const { orders, products, tickets, resetData } = useStore();

    const totalGMV = orders.filter(o => o.status === "DELIVERED").reduce((s, o) => s + o.total, 0);
    const totalOrders = orders.length;
    const lowStock = products.filter(p => p.stock < 10).length;
    const openTickets = tickets.filter(t => t.status !== "resolved").length;

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 0: OVERVIEW ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const OverviewTab = () => {
        const [alerts, setAlerts] = useState([]);
        const activeAlerts = alerts.filter(a => !a.dismissed);
        return (
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
                {activeAlerts.length > 0 && (
                    <div className="p-card col gap12">
                        <h3 style={{ fontWeight: 700, fontSize: 15 }}>🚨 Platform Alerts</h3>
                        {activeAlerts.map(a => (
                            <div key={a.id} className="ticket" style={{ borderColor: a.level === "critical" ? P.danger + "44" : P.warning + "44" }}>
                                <span className={`p-badge ${a.level === "critical" ? "p-badge-danger" : "p-badge-warning"}`} style={{ fontSize: 10 }}>{a.level?.toUpperCase()}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>
                                    <div style={{ fontSize: 12, color: P.textMuted }}>{a.body}</div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                        {!a.escalated && <button className="p-btn p-btn-ghost p-btn-sm" style={{ fontSize: 12 }} onClick={() => setAlerts(p => p.map(x => x.id === a.id ? { ...x, escalated: true } : x))}>⬆ Escalate</button>}
                                        <button className="p-btn p-btn-sm" style={{ background: P.textDim + "33", color: P.textMuted, border: "none", fontSize: 12 }} onClick={() => setAlerts(p => p.map(x => x.id === a.id ? { ...x, dismissed: true } : x))}>✕ Dismiss</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 1: USERS (from Phase 3 — carry forward) ─────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const UsersTab = () => {
        const { user: currentUser } = useAuth();
        const [users, setUsers] = useState([]);
        const [invites, setInvites] = useState([]);
        const [loading, setLoading] = useState(true);
        const [actionLoading, setActionLoading] = useState(null);
        const [roleFilter, setRoleFilter] = useState("");
        const [showInviteForm, setShowInviteForm] = useState(false);
        const [inviteEmail, setInviteEmail] = useState("");
        const [inviteRole, setInviteRole] = useState("support");
        const [inviteMsg, setInviteMsg] = useState(null);
        const [tab, setTab] = useState("users");
        const isSuperAdmin = currentUser?.role === "super_admin";

        const fetchUsers = useCallback(async () => {
            setLoading(true);
            const res = await api.get(`/admin/users${roleFilter ? `?role=${roleFilter}` : ""}`);
            if (res.ok) setUsers(res.users || []);
            setLoading(false);
        }, [roleFilter]);
        const fetchInvites = useCallback(async () => {
            const res = await api.get("/admin/invites");
            if (res.ok) setInvites(res.invites || []);
        }, []);
        useEffect(() => { fetchUsers(); fetchInvites(); }, [fetchUsers, fetchInvites]);

        const handleInvite = async () => {
            if (!inviteEmail.trim()) return;
            setActionLoading("invite"); setInviteMsg(null);
            const res = await api.post("/admin/invite-staff", { email: inviteEmail.trim().toLowerCase(), role: inviteRole });
            setInviteMsg(res.ok ? { type: "success", text: `✅ Invite sent to ${inviteEmail} as ${inviteRole}` } : { type: "error", text: `❌ ${res.error || "Failed"}` });
            if (res.ok) { setInviteEmail(""); fetchInvites(); }
            setActionLoading(null);
        };
        const handleSuspend = async (id) => { if (!window.confirm("Suspend this account?")) return; setActionLoading(id); await api.patch(`/admin/users/${id}/suspend`); fetchUsers(); setActionLoading(null); };
        const handleActivate = async (id) => { setActionLoading(id); await api.patch(`/admin/users/${id}/activate`); fetchUsers(); setActionLoading(null); };
        const handleRevokeInvite = async (id) => { if (!window.confirm("Revoke?")) return; setActionLoading(id); await api.delete(`/admin/invites/${id}`); fetchInvites(); setActionLoading(null); };

        const FILTER_ROLES = isSuperAdmin ? ["", "customer", "seller", "vendor", "delivery", "support", "admin", "super_admin"] : ["", "customer", "seller", "vendor", "delivery", "support"];

        return (
            <div className="col gap16">
                <div className="row-between" style={{ flexWrap: "wrap", gap: 12 }}>
                    <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>👥 Team & Users</h2>
                    <div style={{ display: "flex", gap: 8 }}>
                        <Pill active={tab === "users"} onClick={() => setTab("users")}>Users ({users.length})</Pill>
                        <Pill active={tab === "invites"} onClick={() => setTab("invites")}>Invites ({invites.filter(i => !i.usedAt && !i.revokedAt).length})</Pill>
                    </div>
                </div>
                {/* Invite Form */}
                <div style={{ ...cardStyle, background: "rgba(59,111,255,0.04)", borderColor: P.primary + "33" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showInviteForm ? 14 : 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>📨 Invite Staff</span>
                        <button onClick={() => setShowInviteForm(!showInviteForm)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: showInviteForm ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#3B6FFF,#6366F1)", color: "white", fontWeight: 700, fontSize: 12, fontFamily: "'Sora',sans-serif" }}>{showInviteForm ? "Cancel" : "+ Send Invite"}</button>
                    </div>
                    {showInviteForm && (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ flex: "1 1 200px" }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Email</label>
                                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="staff@company.com" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${P.border}66`, background: "rgba(255,255,255,0.04)", color: "white", fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ flex: "0 0 140px" }}>
                                <label style={{ fontSize: 10, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>Role</label>
                                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${P.border}66`, background: "rgba(255,255,255,0.08)", color: "white", fontSize: 13, fontFamily: "'Sora',sans-serif", outline: "none" }}>
                                    <option value="support">Support</option>
                                    {isSuperAdmin && <option value="admin">Admin</option>}
                                </select>
                            </div>
                            <button onClick={handleInvite} disabled={actionLoading === "invite" || !inviteEmail.trim()} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#3B6FFF,#6366F1)", color: "white", fontWeight: 700, fontSize: 13, fontFamily: "'Sora',sans-serif", opacity: actionLoading === "invite" || !inviteEmail.trim() ? 0.5 : 1, flexShrink: 0 }}>{actionLoading === "invite" ? "Sending..." : "Send Invite"}</button>
                        </div>
                    )}
                    {inviteMsg && <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: inviteMsg.type === "success" ? P.success + "15" : P.danger + "15", color: inviteMsg.type === "success" ? P.success : P.danger, border: `1px solid ${inviteMsg.type === "success" ? P.success : P.danger}33` }}>{inviteMsg.text}</div>}
                </div>
                {tab === "users" && (
                    <>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{FILTER_ROLES.map(r => <Pill key={r || "all"} active={roleFilter === r} onClick={() => setRoleFilter(r)}>{r || "All"}</Pill>)}</div>
                        {loading ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>Loading...</div> : users.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>No users found</div> : (
                            <div className="col gap10">{users.map(u => {
                                const sCfg = STATUS_BADGE[u.status] || STATUS_BADGE.active;
                                const canManage = ["admin", "super_admin", "support"].includes(u.role) && u._id !== currentUser?._id && u.role !== "super_admin" && (isSuperAdmin || (currentUser?.role === "admin" && u.role === "support"));
                                return (
                                    <div key={u._id} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                        <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
                                            <div style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: (ROLE_BADGE_COLOR[u.role] || P.primary) + "22", color: ROLE_BADGE_COLOR[u.role] || P.primary, fontWeight: 800, fontSize: 13, flexShrink: 0, border: `1.5px solid ${(ROLE_BADGE_COLOR[u.role] || P.primary)}44` }}>{u.avatar || u.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                                                <div style={{ fontSize: 12, color: P.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, background: (ROLE_BADGE_COLOR[u.role] || P.primary) + "18", color: ROLE_BADGE_COLOR[u.role] || P.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>{u.role?.replace("_", " ")}</span>
                                            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, background: sCfg.bg, color: sCfg.color }}>{sCfg.label}</span>
                                            {canManage && (u.status === "active" ? <button onClick={() => handleSuspend(u._id)} disabled={actionLoading === u._id} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${P.danger}44`, background: "transparent", color: P.danger, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif", opacity: actionLoading === u._id ? 0.5 : 1 }}>Suspend</button> : u.status === "suspended" ? <button onClick={() => handleActivate(u._id)} disabled={actionLoading === u._id} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${P.success}44`, background: "transparent", color: P.success, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif", opacity: actionLoading === u._id ? 0.5 : 1 }}>Activate</button> : null)}
                                        </div>
                                    </div>
                                );
                            })}</div>
                        )}
                    </>
                )}
                {tab === "invites" && (
                    <div className="col gap10">{invites.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>No invites</div> : invites.map(inv => {
                        const isActive = !inv.usedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date();
                        const sLabel = inv.usedAt ? "USED" : inv.revokedAt ? "REVOKED" : new Date(inv.expiresAt) <= new Date() ? "EXPIRED" : "PENDING";
                        const sColor = inv.usedAt ? P.success : inv.revokedAt ? P.danger : new Date(inv.expiresAt) <= new Date() ? P.textMuted : P.warning;
                        return (
                            <div key={inv._id} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.email}</div>
                                    <div style={{ fontSize: 12, color: P.textMuted }}>As <span style={{ color: ROLE_BADGE_COLOR[inv.role] || P.primary, fontWeight: 700 }}>{inv.role}</span>{inv.invitedBy && <> by {inv.invitedBy.name}</>} · {new Date(inv.createdAt).toLocaleDateString("en-IN")}</div>
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                    <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, background: sColor + "18", color: sColor }}>{sLabel}</span>
                                    {isActive && <button onClick={() => handleRevokeInvite(inv._id)} disabled={actionLoading === inv._id} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${P.danger}44`, background: "transparent", color: P.danger, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif", opacity: actionLoading === inv._id ? 0.5 : 1 }}>Revoke</button>}
                                </div>
                            </div>
                        );
                    })}</div>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 2: ORDERS ────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const OrdersTab = () => (
        <div className="col gap14">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📋 All Orders ({orders.length})</h2>
            <div className="col gap10">{orders.map(o => (
                <div key={o.id} className="p-card">
                    <div className="row-between mb8">
                        <div>
                            <div style={{ fontWeight: 700 }}>{o.id} <span style={{ color: P.textMuted, fontWeight: 400, fontSize: 12 }}>· {o.customerName} → {o.storeName}</span></div>
                            <div style={{ fontSize: 12, color: P.textMuted }}>{new Date(o.createdAt).toLocaleString("en-IN")}</div>
                        </div>
                        <div style={{ background: STATUS_COLOR[o.status] + "22", color: STATUS_COLOR[o.status], borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>{o.status.replace(/_/g, " ")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                        <span>₹{o.total}</span>
                        <span style={{ color: P.textMuted }}>{o.items.length} items · {o.paymentMethod}</span>
                        {o.flagged && <span style={{ color: P.danger, fontWeight: 700 }}>🚩 Flagged</span>}
                    </div>
                </div>
            ))}</div>
        </div>
    );

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 3: AUDIT LOGS ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const LogsTab = () => {
        const [logs, setLogs] = useState([]);
        const [loading, setLoading] = useState(true);
        const [actionFilter, setActionFilter] = useState("");
        const ACTIONS = ["", "refund_issued", "manual_dispatch", "kyc_status_change", "user_suspended", "user_activated", "payment_reconciled", "staff_invited", "invite_revoked"];

        const fetchLogs = useCallback(async () => {
            setLoading(true);
            const params = actionFilter ? `?action=${actionFilter}` : "";
            const res = await api.get(`/admin/audit-logs${params}`);
            if (res.ok) setLogs(res.logs || []);
            setLoading(false);
        }, [actionFilter]);
        useEffect(() => { fetchLogs(); }, [fetchLogs]);

        const ACTION_ICON = { refund_issued: "💰", manual_dispatch: "🚚", kyc_status_change: "📑", user_suspended: "🔒", user_activated: "✅", payment_reconciled: "🔄", staff_invited: "📨", invite_revoked: "❌" };

        return (
            <div className="col gap14">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>🔒 Audit Logs</h2>
                    <span className="p-badge p-badge-danger" style={{ fontSize: 10 }}>ADMIN ONLY</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ACTIONS.map(a => <Pill key={a || "all"} active={actionFilter === a} onClick={() => setActionFilter(a)}>{a ? a.replace(/_/g, " ") : "All"}</Pill>)}
                </div>
                {loading ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>Loading...</div> : logs.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>No audit logs found</div> : (
                    <div className="col gap8">{logs.map(log => (
                        <div key={log._id} style={{ ...cardStyle, display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <span style={{ fontSize: 20, flexShrink: 0 }}>{ACTION_ICON[log.action] || "📝"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>
                                    {log.action?.replace(/_/g, " ").toUpperCase()}
                                    <span style={{ fontWeight: 400, color: P.textMuted, fontSize: 12, marginLeft: 8 }}>by {log.actorName || log.actorId?.name || "System"}</span>
                                </div>
                                <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>
                                    Target: {log.targetType} {log.targetId?.slice(-8)}
                                    {log.details?.amount && <> · ₹{log.details.amount}</>}
                                    {log.details?.reason && <> · {log.details.reason}</>}
                                    {log.details?.email && <> · {log.details.email}</>}
                                    {log.details?.role && <> as {log.details.role}</>}
                                </div>
                                <div style={{ fontSize: 11, color: P.textDim, marginTop: 4 }}>{new Date(log.createdAt).toLocaleString("en-IN")} · IP: {log.ipAddress}</div>
                            </div>
                        </div>
                    ))}</div>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 4: KYC REVIEW ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const KycTab = () => {
        const [kycUsers, setKycUsers] = useState([]);
        const [loading, setLoading] = useState(true);
        const [actionLoading, setActionLoading] = useState(null);
        const [statusFilter, setStatusFilter] = useState("SUBMITTED");

        const fetchKycUsers = useCallback(async () => {
            setLoading(true);
            const res = await api.get("/admin/users?limit=100");
            if (res.ok) {
                const filtered = (res.users || []).filter(u => ["seller", "vendor", "delivery"].includes(u.role));
                setKycUsers(filtered);
            }
            setLoading(false);
        }, []);
        useEffect(() => { fetchKycUsers(); }, [fetchKycUsers]);

        const handleKycAction = async (userId, newStatus) => {
            const label = newStatus === "VERIFIED" ? "approve" : "reject";
            if (!window.confirm(`Are you sure you want to ${label} this KYC?`)) return;
            setActionLoading(userId);
            const res = await api.patch(`/kyc/admin/${userId}`, { kycStatus: newStatus });
            if (res.ok) fetchKycUsers();
            setActionLoading(null);
        };

        const displayed = kycUsers.filter(u => !statusFilter || u.kycStatus === statusFilter);
        const KYC_COLORS = { PENDING: P.textMuted, SUBMITTED: P.warning, VERIFIED: P.success, REJECTED: P.danger };

        return (
            <div className="col gap14">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>📑 KYC Review</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["", "SUBMITTED", "PENDING", "VERIFIED", "REJECTED"].map(s => <Pill key={s || "all"} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{s || "All"}</Pill>)}
                </div>
                {loading ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>Loading...</div> : displayed.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>No KYC submissions to review</div> : (
                    <div className="col gap10">{displayed.map(u => (
                        <div key={u._id} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
                                <div style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: (ROLE_BADGE_COLOR[u.role] || P.primary) + "22", color: ROLE_BADGE_COLOR[u.role] || P.primary, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{u.avatar || "?"}</div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                                    <div style={{ fontSize: 12, color: P.textMuted }}>{u.email} · <span style={{ color: ROLE_BADGE_COLOR[u.role], fontWeight: 700 }}>{u.role}</span></div>
                                    <div style={{ fontSize: 11, color: P.textDim, marginTop: 4 }}>
                                        Entity: <span style={{ color: "white" }}>{u.companyName || u.storeName || u.vehicleNo || "Not provided"}</span> · 
                                        Doc: <span style={{ color: "white" }}>{u.kycDocuments?.[0]?.docType || "Unknown"}</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, background: (KYC_COLORS[u.kycStatus] || P.textMuted) + "18", color: KYC_COLORS[u.kycStatus] || P.textMuted }}>{u.kycStatus || "PENDING"}</span>
                                {u.kycDocuments?.[0]?.documentIdentifier && (
                                    <button 
                                        onClick={async () => {
                                            const res = await api.get(`/kyc/read-url/${u.kycDocuments[0].documentIdentifier}`);
                                            if (res.ok && res.readUrl) window.open(res.readUrl, "_blank");
                                            else alert("Could not load document preview.");
                                        }} 
                                        style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${P.primary}44`, background: "transparent", color: P.primary, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif" }}>
                                        👁️ View Doc
                                    </button>
                                )}
                                {u.kycStatus === "SUBMITTED" && (
                                    <>
                                        <button onClick={() => handleKycAction(u._id, "VERIFIED")} disabled={actionLoading === u._id} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${P.success}44`, background: "transparent", color: P.success, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif", opacity: actionLoading === u._id ? 0.5 : 1 }}>✅ Approve</button>
                                        <button onClick={() => handleKycAction(u._id, "REJECTED")} disabled={actionLoading === u._id} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${P.danger}44`, background: "transparent", color: P.danger, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif", opacity: actionLoading === u._id ? 0.5 : 1 }}>❌ Reject</button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}</div>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 5: FINANCIAL SUMMARY ─────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const FinanceTab = () => {
        const [summary, setSummary] = useState(null);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
            (async () => {
                setLoading(true);
                const res = await api.get("/payments/admin/summary");
                if (res.ok) setSummary(res.summary || null);
                setLoading(false);
            })();
        }, []);

        const fmt = v => "₹" + (v || 0).toLocaleString("en-IN");

        return (
            <div className="col gap14">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>💹 Financial Summary</h2>
                {loading ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>Loading...</div> : !summary ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>No data available</div> : (
                    <>
                        <div className="plat-grid">
                            {[
                                { label: "Total Revenue", val: fmt(summary.totalRevenue), color: P.success },
                                { label: "Platform Fees", val: fmt(summary.totalPlatformFees), color: P.primary },
                                { label: "Seller Earnings", val: fmt(summary.totalSellerEarnings), color: "#F59E0B" },
                                { label: "Delivery Fees", val: fmt(summary.totalDeliveryFees), color: P.accent },
                                { label: "Wallet Payments", val: fmt(summary.totalWalletPayments), color: P.purple },
                                { label: "Gateway Payments", val: fmt(summary.totalGatewayPayments), color: P.primary },
                            ].map(s => (
                                <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                                    <div className="p-label">{s.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                                </div>
                            ))}
                        </div>
                        <div className="plat-grid">
                            {[
                                { label: "Transactions", val: summary.transactionCount, color: P.primary },
                                { label: "Refunded", val: summary.refundedCount, color: P.danger },
                                { label: "Pending", val: summary.pendingCount, color: P.warning },
                                { label: "Failed", val: summary.failedCount, color: P.danger },
                            ].map(s => (
                                <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                                    <div className="p-label">{s.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    // ── TAB 6: LOGISTICS ─────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════
    const LogisticsTab = () => {
        const [panel, setPanel] = useState("stuck");
        const [data, setData] = useState([]);
        const [loading, setLoading] = useState(true);
        const [actionLoading, setActionLoading] = useState(null);

        const endpoints = { stuck: "/admin/logistics/stuck-orders", rejected: "/admin/logistics/rejected-orders", escalated: "/admin/logistics/escalated-orders", idle: "/admin/logistics/idle-riders", online: "/admin/logistics/online-riders" };
        const labels = { stuck: "Stuck Orders", rejected: "Rejected Orders", escalated: "Escalated", idle: "Idle Riders", online: "Online Riders" };

        const fetchData = useCallback(async () => {
            setLoading(true);
            const res = await api.get(endpoints[panel]);
            if (res.ok) setData(res.orders || res.riders || res.jobs || []);
            setLoading(false);
        }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps
        useEffect(() => { fetchData(); }, [fetchData]);

        const handleManualDispatch = async (orderId, riderId) => {
            if (!window.confirm("Manually dispatch this order?")) return;
            setActionLoading(orderId);
            await api.post("/admin/logistics/manual-dispatch", { orderId, riderId });
            fetchData();
            setActionLoading(null);
        };

        return (
            <div className="col gap14">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>🚚 Logistics Operations</h2>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.keys(labels).map(k => <Pill key={k} active={panel === k} onClick={() => setPanel(k)}>{labels[k]}</Pill>)}
                </div>
                {loading ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>Loading...</div> : data.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: P.textMuted }}>No {labels[panel].toLowerCase()} found ✅</div> : (
                    <div className="col gap10">{data.map((item, idx) => {
                        const isOrder = !!item.status;
                        return (
                            <div key={item._id || idx} style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                                        {isOrder ? `Order ${(item._id || "").toString().slice(-8)}` : item.name || "Rider"}
                                        {isOrder && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: (STATUS_COLOR[item.status] || P.textMuted) + "22", color: STATUS_COLOR[item.status] || P.textMuted }}>{item.status?.replace(/_/g, " ")}</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>
                                        {isOrder ? <>₹{item.total} · Updated {new Date(item.updatedAt).toLocaleString("en-IN")}{item.rejectionCount > 0 && <> · {item.rejectionCount} rejections</>}</> : <>{item.phone || item.email} · {item.activeOrderIds?.length || 0} active orders · Last activity: {item.lastActivityAt ? new Date(item.lastActivityAt).toLocaleString("en-IN") : "N/A"}</>}
                                    </div>
                                </div>
                                {isOrder && panel === "stuck" && (
                                    <button onClick={() => { const rid = window.prompt("Enter Rider ID for manual dispatch:"); if (rid) handleManualDispatch(item._id, rid); }} disabled={actionLoading === item._id} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${P.primary}44`, background: "transparent", color: P.primary, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'Sora',sans-serif", opacity: actionLoading === item._id ? 0.5 : 1, flexShrink: 0 }}>🚚 Dispatch</button>
                                )}
                                {!isOrder && <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800, background: item.isOnline ? P.success + "18" : P.textMuted + "18", color: item.isOnline ? P.success : P.textMuted, flexShrink: 0 }}>{item.isOnline ? "ONLINE" : "OFFLINE"}</span>}
                            </div>
                        );
                    })}</div>
                )}
            </div>
        );
    };

    // ── Tab routing ───────────────────────────────────────────────────────────
    // Tabs: 0=Overview, 1=Users, 2=Orders, 3=Logs, 4=KYC, 5=Finance, 6=Logistics
    const tabs = [<OverviewTab />, <UsersTab />, <OrdersTab />, <LogsTab />, <KycTab />, <FinanceTab />, <LogisticsTab />];
    return <div>{tabs[activeTab] || <OverviewTab />}</div>;
}
