import React, { useState, useCallback, useMemo } from "react";
import { T } from "../../theme/theme";
import { useToast } from "../../utils/helpers";
import { ScmToast } from "../../components/ScmComponents";
import { MobileNav, HamburgerBtn } from "../../components/MobileNav";
import { useAuth } from "../../auth/AuthContext";

import { OverviewDashboard } from "./OverviewDashboard";
import { SupplierManagement } from "./SupplierManagement";
import { ProcurementTracker } from "./ProcurementTracker";
import { ProfitEngine } from "./ProfitEngine";
import { SmartPricing } from "./SmartPricing";
import { InventoryIntelligence } from "./InventoryIntelligence";
import { AccountingFinance } from "./AccountingFinance";
import { SupplyChainView, AdminOversight } from "./SupplyChainView";

// ── Role → Tab access matrix ─────────────────────────────────────────────────
// Each tab lists which roles can see it.
// Seller  = full SCM access (except Admin Oversight)
// Admin   = Overview, Suppliers, Purchase Orders, Supply Chain, Admin Oversight (no financials)
// Vendor  = blocked at App.js level — use VendorPortal instead
// Support = blocked at App.js level
const ALL_SCM_TABS = [
    { key: "overview", label: "Overview", icon: "⊙", roles: ["seller", "admin"] },
    { key: "suppliers", label: "Suppliers", icon: "🏭", roles: ["seller", "admin"], count: 4 },
    { key: "procurement", label: "Purchase Orders", icon: "📋", roles: ["seller", "admin"], count: 4 },
    { key: "profit", label: "Profit Engine", icon: "💡", roles: ["seller"] },
    { key: "pricing", label: "Smart Pricing", icon: "🎯", roles: ["seller"], count: 2 },
    { key: "inventory", label: "Inventory", icon: "📦", roles: ["seller"], count: 3 },
    { key: "accounting", label: "Accounting", icon: "📊", roles: ["seller"] },
    { key: "supplychain", label: "Supply Chain", icon: "🔗", roles: ["seller", "admin"] },
    { key: "admin", label: "Admin", icon: "🛡", roles: ["admin"], count: 4 },
];

// Keep the old export name so nothing else breaks
export const SCM_TABS = ALL_SCM_TABS;

export const SCMModule = () => {
    const { user } = useAuth();
    const role = user?.role || "";

    // Filter tabs to only those the current role is allowed to see
    // Only seller and admin can reach this component (vendor/support blocked at App.js)
    const visibleTabs = useMemo(
        () => ALL_SCM_TABS.filter(t => t.roles.includes(role)),
        [role]
    );

    // Mobile nav: first 4 visible tabs + "more" drawer
    const mobileTabs = useMemo(() => {
        const first4 = visibleTabs.slice(0, 4).map(t => ({
            key: t.key, label: t.label.length > 8 ? t.label.split(" ")[0] : t.label, icon: t.icon
        }));
        if (visibleTabs.length > 4) first4.push({ key: "more", label: "More", icon: "☰" });
        return first4;
    }, [visibleTabs]);

    const [activeTab, setActiveTab] = useState("overview");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [toast, , clearToast] = useToast();

    // Allowed tab keys for this role
    const allowedKeys = useMemo(() => new Set(visibleTabs.map(t => t.key)), [visibleTabs]);

    const renderContent = useCallback(() => {
        // If user somehow lands on a tab they shouldn't see, default to overview
        const tab = allowedKeys.has(activeTab) ? activeTab : "overview";
        switch (tab) {
            case "overview": return <OverviewDashboard setActiveTab={setActiveTab} />;
            case "suppliers": return <SupplierManagement />;
            case "procurement": return <ProcurementTracker />;
            case "profit": return <ProfitEngine />;
            case "pricing": return <SmartPricing />;
            case "inventory": return <InventoryIntelligence />;
            case "accounting": return <AccountingFinance />;
            case "supplychain": return <SupplyChainView />;
            case "admin": return <AdminOversight />;
            default: return <OverviewDashboard setActiveTab={setActiveTab} />;
        }
    }, [activeTab, allowedKeys]);

    const handleMobileNav = (key) => {
        if (key === "more") { setDrawerOpen(o => !o); return; }
        setActiveTab(key);
        setDrawerOpen(false);
    };

    return (
        <div className="scm-root">
            <div className="scm-ambient" />
            <div className="hex-grid" />

            {/* ── Desktop header ── */}
            <div className="module-header">
                <div className="module-logo">
                    <div className="module-logo-mark">NM</div>
                    <div style={{ lineHeight: 1.2 }}>
                        <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 16, letterSpacing: 1, color: T.gold }}>NearMart</div>
                        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: T.textDim, textTransform: "uppercase" }}>Supply Chain</div>
                    </div>
                </div>

                {/* Desktop tab strip — only shows role-allowed tabs */}
                <div className="tab-nav">
                    {visibleTabs.map(t => (
                        <button key={t.key} className={`tab-btn ${activeTab === t.key ? "active" : ""}`} onClick={() => setActiveTab(t.key)}>
                            <span style={{ fontSize: 14, opacity: .7 }}>{t.icon}</span>
                            {t.label}
                            {t.count ? <span className="tab-count">{t.count}</span> : null}
                        </button>
                    ))}
                </div>

                {/* Mobile hamburger (only visible on mobile via CSS) */}
                <HamburgerBtn open={drawerOpen} onClick={() => setDrawerOpen(o => !o)} color={T.gold} />

                <div className="hdr-actions">
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 16, padding: "5px 10px" }}>🔔</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 16, padding: "5px 10px" }}>⚙</button>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, marginLeft: 6 }} />
                </div>
            </div>

            {/* ── Mobile tab drawer — only shows role-allowed tabs ── */}
            {drawerOpen && (
                <div className="scm-tab-drawer">
                    {visibleTabs.map(t => (
                        <div
                            key={t.key}
                            className={`scm-tab-drawer-item ${activeTab === t.key ? "active" : ""}`}
                            onClick={() => handleMobileNav(t.key)}
                        >
                            <span style={{ fontSize: 20 }}>{t.icon}</span>
                            <span style={{ flex: 1 }}>{t.label}</span>
                            {t.count ? <span className="tab-count">{t.count}</span> : null}
                        </div>
                    ))}
                </div>
            )}

            <div className="scm-content">{renderContent()}</div>

            {/* ── Mobile bottom nav ── */}
            <MobileNav
                items={mobileTabs}
                activeKey={mobileTabs.find(t => t.key === activeTab) ? activeTab : "more"}
                onSelect={handleMobileNav}
                accentColor={T.gold}
            />

            {toast && <ScmToast msg={toast.msg} type={toast.type} onClose={clearToast} />}
        </div>
    );
};
