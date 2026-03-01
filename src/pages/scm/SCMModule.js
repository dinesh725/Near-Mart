import React, { useState, useCallback } from "react";
import { T } from "../../theme/theme";
import { useToast } from "../../utils/helpers";
import { ScmToast } from "../../components/ScmComponents";
import { MobileNav, HamburgerBtn } from "../../components/MobileNav";

import { OverviewDashboard } from "./OverviewDashboard";
import { SupplierManagement } from "./SupplierManagement";
import { ProcurementTracker } from "./ProcurementTracker";
import { ProfitEngine } from "./ProfitEngine";
import { SmartPricing } from "./SmartPricing";
import { InventoryIntelligence } from "./InventoryIntelligence";
import { AccountingFinance } from "./AccountingFinance";
import { SupplyChainView, AdminOversight } from "./SupplyChainView";

export const SCM_TABS = [
    { key: "overview", label: "Overview", icon: "⊙" },
    { key: "suppliers", label: "Suppliers", icon: "🏭", count: 4 },
    { key: "procurement", label: "Purchase Orders", icon: "📋", count: 4 },
    { key: "profit", label: "Profit Engine", icon: "💡" },
    { key: "pricing", label: "Smart Pricing", icon: "🎯", count: 2 },
    { key: "inventory", label: "Inventory", icon: "📦", count: 3 },
    { key: "accounting", label: "Accounting", icon: "📊" },
    { key: "supplychain", label: "Supply Chain", icon: "🔗" },
    { key: "admin", label: "Admin", icon: "🛡", count: 4 },
];

// Mobile nav shows only primary 5 tabs; the rest are in the drawer
const MOBILE_TABS = [
    { key: "overview", label: "Overview", icon: "⊙" },
    { key: "suppliers", label: "Suppliers", icon: "🏭" },
    { key: "procurement", label: "Orders", icon: "📋" },
    { key: "profit", label: "Profit", icon: "💡" },
    { key: "more", label: "More", icon: "☰" },
];

export const SCMModule = () => {
    const [activeTab, setActiveTab] = useState("overview");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [toast, , clearToast] = useToast();

    const renderContent = useCallback(() => {
        switch (activeTab) {
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
    }, [activeTab]);

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

                {/* Desktop tab strip */}
                <div className="tab-nav">
                    {SCM_TABS.map(t => (
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

            {/* ── Mobile tab drawer ── */}
            {drawerOpen && (
                <div className="scm-tab-drawer">
                    {SCM_TABS.map(t => (
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
                items={MOBILE_TABS}
                activeKey={MOBILE_TABS.find(t => t.key === activeTab) ? activeTab : "more"}
                onSelect={handleMobileNav}
                accentColor={T.gold}
            />

            {toast && <ScmToast msg={toast.msg} type={toast.type} onClose={clearToast} />}
        </div>
    );
};
