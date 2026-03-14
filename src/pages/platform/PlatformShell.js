import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MobileNav } from "../../components/MobileNav";

import { CustomerApp } from "../customer/CustomerApp";
import { SellerDashboard } from "../seller/SellerDashboard";
import { VendorPortal } from "../vendor/VendorPortal";
import { DeliveryApp } from "../delivery/DeliveryApp";
import { SupportPanel } from "../support/SupportPanel";
import { AdminDashboard } from "../admin/AdminDashboard";
import { ProfilePage } from "../profile/ProfilePage";

const ROLE_META = {
    customer: { label: "Customer App", icon: "🛍", color: P.primary, component: CustomerApp, tabs: [{ i: "🏠", l: "Home" }, { i: "🛒", l: "Cart" }, { i: "📦", l: "Orders" }, { i: "💬", l: "Support" }, { i: "👛", l: "Wallet" }, { i: "👤", l: "Profile" }] },
    seller: { label: "Seller Dashboard", icon: "🏪", color: P.success, component: SellerDashboard, tabs: [{ i: "📊", l: "Overview" }, { i: "📋", l: "Orders" }, { i: "📦", l: "Inventory" }, { i: "💰", l: "Finance" }, { i: "👤", l: "Profile" }] },
    vendor: { label: "Vendor Portal", icon: "🏭", color: "#F59E0B", component: VendorPortal, tabs: [{ i: "📊", l: "Supply" }, { i: "📋", l: "Requests" }, { i: "📦", l: "Stock" }, { i: "📈", l: "Insights" }, { i: "👤", l: "Profile" }] },
    delivery: { label: "Delivery App", icon: "🛵", color: P.accent, component: DeliveryApp, tabs: [{ i: "🗺", l: "Map" }, { i: "📋", l: "Tasks" }, { i: "💸", l: "Earnings" }, { i: "⚙", l: "Settings" }, { i: "👤", l: "Profile" }] },
    support: { label: "Resolution Center", icon: "🎧", color: P.warning, component: SupportPanel, tabs: [{ i: "📫", l: "Inbox" }, { i: "📞", l: "Live" }, { i: "📝", l: "Macros" }, { i: "📈", l: "Stats" }, { i: "👤", l: "Profile" }] },
    admin: { label: "Platform Intel", icon: "🛡", color: P.purple, component: AdminDashboard, tabs: [{ i: "🌍", l: "Overview" }, { i: "👥", l: "Users" }, { i: "📋", l: "Orders" }, { i: "🔒", l: "Logs" }, { i: "📑", l: "KYC" }, { i: "💹", l: "Finance" }, { i: "🚚", l: "Logistics" }, { i: "👤", l: "Profile" }] },
    super_admin: { label: "Super Admin", icon: "⚡", color: P.purple, component: AdminDashboard, tabs: [{ i: "🌍", l: "Overview" }, { i: "👥", l: "Users" }, { i: "📋", l: "Orders" }, { i: "🔒", l: "Logs" }, { i: "📑", l: "KYC" }, { i: "💹", l: "Finance" }, { i: "🚚", l: "Logistics" }, { i: "👤", l: "Profile" }] },
};

// ── Time formatter ─────────────────────────────────────────────────────────────
function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

// ── Notification Bell ──────────────────────────────────────────────────────────
function NotifBell({ role }) {
    const { notifications, markNotifRead, clearNotifs } = useStore();
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const dropdownRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });

    const myNotifs = notifications.filter(n => n.forRole === role);
    const unread = myNotifs.filter(n => !n.read).length;

    const typeIcon = (type) => ({ order: "🛒", update: "📦", ticket: "🎧", demand: "📈", alert: "⚠", success: "✅", info: "ℹ", stock: "📦", payment: "💰" }[type] || "🔔");

    // Position dropdown when opened
    useEffect(() => {
        if (open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const dropdownWidth = Math.min(360, vw - 16);
            let right = vw - rect.right;
            // Ensure dropdown doesn't go off-screen left
            if (vw - right - dropdownWidth < 8) right = vw - dropdownWidth - 8;
            setPos({ top: rect.bottom + 8, right: Math.max(right, 8) });
        }
    }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (btnRef.current && btnRef.current.contains(e.target)) return;
            if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const maxDropHeight = typeof window !== 'undefined' ? window.innerHeight - pos.top - 70 : 400;

    const dropdown = open ? ReactDOM.createPortal(
        <div ref={dropdownRef} style={{ position: "fixed", top: pos.top, right: Math.max(pos.right, 8), width: "min(360px, calc(100vw - 16px))", maxHeight: Math.max(maxDropHeight, 200), background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset", zIndex: 99999, overflow: "hidden", animation: "modalSlideUp .2s ease", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Notifications</span>
                    {unread > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: P.primary, fontWeight: 700 }}>{unread} new</span>}
                </div>
                <button onClick={() => { clearNotifs(role); setOpen(false); }} style={{ background: "none", border: "none", color: P.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'Sora',sans-serif" }}>Mark all read</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", maxHeight: Math.max(maxDropHeight - 50, 150) }}>
                {myNotifs.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: P.textMuted }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>🔔</div>
                        <div style={{ fontSize: 13 }}>All caught up! 🎉</div>
                    </div>
                ) : myNotifs.slice(0, 15).map(n => (
                    <div key={n.id} onClick={() => markNotifRead(n.id)}
                        style={{ padding: "12px 16px", borderBottom: `1px solid ${P.border}22`, background: n.read ? "transparent" : `${P.primary}08`, cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", transition: "background 0.2s" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon(n.type)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, lineHeight: 1.4, color: n.read ? P.textMuted : P.text }}>{n.msg}</div>
                            <div style={{ fontSize: 11, color: P.textMuted, marginTop: 4 }}>{timeAgo(n.time)}</div>
                        </div>
                        {!n.read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: P.primary, flexShrink: 0, marginTop: 4 }} />}
                    </div>
                ))}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button ref={btnRef} onClick={() => setOpen(o => !o)} style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 20, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", color: "white", transition: "all .2s", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }} aria-label="Notifications">
                🔔
                {unread > 0 && (
                    <span style={{ position: "absolute", top: -4, right: -4, background: P.danger, color: "white", borderRadius: "50%", width: 18, height: 18, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #111827", boxShadow: "0 2px 6px rgba(239,68,68,0.4)" }}>
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>
            {dropdown}
        </>
    );
}

// ── Profile Quick Menu ──────────────────────────────────────────────────────────
function ProfileQuickMenu({ user, role, accentColor, onProfile, onLogout }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const dropdownRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });

    // Position dropdown when opened
    useEffect(() => {
        if (open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const dropdownWidth = Math.min(280, vw - 16);
            let right = vw - rect.right;
            if (vw - right - dropdownWidth < 8) right = vw - dropdownWidth - 8;
            setPos({ top: rect.bottom + 8, right: Math.max(right, 8) });
        }
    }, [open]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (btnRef.current && btnRef.current.contains(e.target)) return;
            if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const maxMenuHeight = typeof window !== 'undefined' ? window.innerHeight - pos.top - 70 : 400;

    const dropdown = open ? ReactDOM.createPortal(
        <div ref={dropdownRef} style={{ position: "fixed", top: pos.top, right: Math.max(pos.right, 8), width: "min(280px, calc(100vw - 16px))", maxHeight: Math.max(maxMenuHeight, 200), background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset", zIndex: 99999, overflow: "hidden", overflowY: "auto", animation: "modalSlideUp .2s ease" }}>
            {/* User info */}
            <div style={{ padding: "16px", borderBottom: `1px solid ${P.border}`, display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "white", flexShrink: 0 }}>
                    {user?.avatar}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
                    <div style={{ fontSize: 11, color: P.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
                    <span style={{ display: "inline-block", marginTop: 4, background: accentColor + "20", color: accentColor, border: `1px solid ${accentColor}44`, borderRadius: 12, padding: "1px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{role}</span>
                </div>
            </div>
            {/* Menu items */}
            <div style={{ padding: "6px 0" }}>
                {[
                    { icon: "👤", label: "My Profile", action: () => { onProfile(); setOpen(false); } },
                    { icon: "🚪", label: "Logout", action: () => { onLogout(); setOpen(false); }, danger: true },
                ].map((item, i) => (
                    <button key={i} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 13, color: item.danger ? P.danger : P.text, transition: "background .15s", textAlign: "left" }}
                        onMouseEnter={e => e.currentTarget.style.background = P.surface}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <span style={{ fontSize: 16 }}>{item.icon}</span>
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                    </button>
                ))}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button ref={btnRef} onClick={() => setOpen(o => !o)} style={{ width: 40, height: 40, borderRadius: 12, background: accentColor + "1a", border: `1.5px solid ${accentColor}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white", cursor: "pointer", transition: "all .2s", boxShadow: `0 2px 8px rgba(0,0,0,0.3)` }} aria-label="Profile menu">
                {user?.avatar}
            </button>
            {dropdown}
        </>
    );
}

// ── Platform Shell ─────────────────────────────────────────────────────────────
export function PlatformShell() {
    const { user, role, logout } = useAuth();
    const { cartCount } = useStore();
    const isMobile = useIsMobile();

    const meta = ROLE_META[role] || ROLE_META.customer;

    // ── Persist active tab across page refresh ────────────────────────────────
    const storageKey = `nearmart_activeTab_${role || "default"}`;
    const [activeTab, setActiveTab] = useState(() => {
        try {
            const saved = sessionStorage.getItem(storageKey);
            if (saved !== null) {
                const idx = parseInt(saved, 10);
                // Ensure the saved tab index is valid for the current role's tab count
                if (!isNaN(idx) && idx >= 0 && idx < meta.tabs.length) return idx;
            }
        } catch { /* sessionStorage not available */ }
        return 0;
    });

    useEffect(() => {
        try { sessionStorage.setItem(storageKey, String(activeTab)); }
        catch { /* ignore */ }
    }, [activeTab, storageKey]);
    const profileTabIndex = meta.tabs.length - 1; // Profile is always last tab
    const isProfileTab = activeTab === profileTabIndex;
    const Component = meta.component;

    const goToProfile = useCallback(() => setActiveTab(profileTabIndex), [profileTabIndex]);

    // Listen for deep links from Capacitor push notifications
    useEffect(() => {
        const handlePushNav = (e) => {
            const data = e.detail;
            if (!data || !data.type) return;

            // Map push notification types to respective tabs depending on role
            if (role === "delivery") {
                if (data.type === "new_order") setActiveTab(1); // Tasks tab
                else if (data.type === "order_cancelled") setActiveTab(1);
            } else if (role === "customer") {
                if (["order_accepted", "order_ready", "out_for_delivery", "delivered"].includes(data.type)) {
                    setActiveTab(2); // Orders tab
                }
            } else if (role === "seller") {
                if (data.type === "new_order") setActiveTab(1); // Seller Orders tab
            }
        };

        window.addEventListener("push_nav", handlePushNav);
        return () => window.removeEventListener("push_nav", handlePushNav);
    }, [role]);

    const mobileNavItems = useMemo(() => meta.tabs.map((t, i) => ({
        key: String(i), label: t.l, icon: t.i,
        count: role === "customer" && i === 1 && cartCount > 0 ? cartCount : undefined,
    })), [meta.tabs, role, cartCount]);

    const sideNavItems = useMemo(() => meta.tabs.map((t, i) => ({
        key: String(i), label: t.l, icon: t.i,
        count: role === "customer" && i === 1 && cartCount > 0 ? cartCount : undefined,
    })), [meta.tabs, role, cartCount]);

    return (
        <div className="plat-root">
            <div className="bg-grid" />
            <div className="bg-glow" style={{ background: meta.color + "0d", top: "-10%", left: "-5%" }} />

            {/* ── Desktop Sidebar ── */}
            {!isMobile && (
                <div className="persistent-drawer open">
                    {/* Role badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${P.border}` }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: meta.color + "33", border: `1.5px solid ${meta.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{meta.icon}</div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>{meta.label}</div>
                            <div style={{ fontSize: 11, color: P.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
                        </div>
                    </div>

                    {/* Nav items */}
                    <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                        {sideNavItems.map((n, i) => (
                            <div key={i} className={`drawer-nav-item ${activeTab === i ? "active" : ""}`} onClick={() => setActiveTab(i)} style={{ position: "relative" }}>
                                <span style={{ fontSize: 20, flexShrink: 0 }}>{n.icon}</span>
                                <span>{n.label}</span>
                                {n.count && (
                                    <span style={{ marginLeft: "auto", background: P.danger, color: "white", borderRadius: "99px", fontSize: 10, fontWeight: 800, padding: "2px 6px" }}>{n.count}</span>
                                )}
                            </div>
                        ))}
                    </nav>

                    <button onClick={logout} className="drawer-nav-item" style={{ marginTop: "auto", color: P.danger, background: "none", border: "none", cursor: "pointer", width: "100%", fontFamily: "'Sora',sans-serif", textAlign: "left" }}>
                        <span style={{ fontSize: 20 }}>🚪</span> Logout
                    </button>
                </div>
            )}

            {/* ── Main ── */}
            <div className="plat-main" style={{ marginLeft: isMobile ? 0 : 240 }}>
                <div className="plat-header">
                    <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                        <span style={{ flexShrink: 0 }}>{meta.icon}</span> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.label}</span>
                        <span className="p-badge p-badge-muted" style={{ fontSize: 9, padding: "2px 8px" }}>{role?.toUpperCase()}</span>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <NotifBell role={role} />
                        <ProfileQuickMenu
                            user={user}
                            role={role}
                            accentColor={meta.color}
                            onProfile={goToProfile}
                            onLogout={logout}
                        />
                    </div>
                </div>

                <div className="plat-content" key={role} style={{ paddingBottom: isMobile ? 80 : 24 }}>
                    {isProfileTab ? (
                        <ProfilePage />
                    ) : (
                        <Component activeTab={activeTab} setActiveTab={setActiveTab} />
                    )}
                </div>
            </div>

            {/* ── Mobile Bottom Nav ── */}
            {isMobile && (
                <MobileNav
                    items={mobileNavItems}
                    activeKey={String(activeTab)}
                    onSelect={(k) => setActiveTab(Number(k))}
                    accentColor={meta.color}
                />
            )}
        </div>
    );
}
