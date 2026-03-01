import React, { useState } from "react";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import { fmtFull } from "../../utils/helpers";

function Toast({ msg, icon, onDone }) {
    React.useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className="plat-toast" style={{ borderLeft: `4px solid #F59E0B` }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{msg}</span>
            <button onClick={onDone} style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
    );
}

export function VendorPortal({ activeTab }) {
    const { user } = useAuth();
    const { vendorInventory, procurement, vendorFulfillOrder, products, shareViewEnabled, setShareViewEnabled } = useStore();
    const [toast, setToast] = useState(null);
    const [fulfilling, setFulfilling] = useState(null);

    const VENDOR_COLOR = "#F59E0B";
    const myInventory = vendorInventory.filter(v => v.supplierId === user?.supplierId);
    const myRequests = procurement.filter(p => p.vendorId === user?.supplierId);
    const pendingReqs = myRequests.filter(p => p.status === "pending");

    const handleFulfill = (rec) => {
        setFulfilling(rec.id);
        setTimeout(() => {
            vendorFulfillOrder(rec.id, rec.qty);
            setFulfilling(null);
            setToast({ msg: `Fulfilled: ${rec.productName} ×${rec.qty} to ${rec.sellerName}`, icon: "📦" });
        }, 1200);
    };

    // ── TABS ──────────────────────────────────────────────────────────────────
    const SupplyTab = () => (
        <div className="col gap16">
            <div className="row-between">
                <div>
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>🏭 {user?.companyName}</h2>
                    <p style={{ fontSize: 13, color: P.textMuted }}>{user?.city} — Vendor Portal</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: P.textMuted }}>Share View</span>
                    <button onClick={() => { setShareViewEnabled(v => !v); setToast({ msg: shareViewEnabled ? "Share view disabled" : "Demand signals now visible to sellers!", icon: shareViewEnabled ? "🔒" : "📊" }); }}
                        style={{ width: 44, height: 24, borderRadius: 12, background: shareViewEnabled ? VENDOR_COLOR : P.border, border: "none", cursor: "pointer", position: "relative", transition: "background 0.3s ease" }}>
                        <div style={{ position: "absolute", top: 2, left: shareViewEnabled ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "white", boxShadow: "0 2px 4px rgba(0,0,0,.4)", transition: "left 0.3s ease" }} />
                    </button>
                </div>
            </div>

            <div className="stat-grid">
                {[
                    { label: "My Products", val: myInventory.length, color: VENDOR_COLOR },
                    { label: "Pending Requests", val: pendingReqs.length, color: P.danger },
                    { label: "Products Supplied", val: myRequests.filter(r => r.status === "fulfilled").length, color: P.success },
                    { label: "Share View", val: shareViewEnabled ? "ON" : "OFF", color: shareViewEnabled ? P.success : P.textMuted },
                ].map(s => (
                    <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                        <div className="p-label">{s.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                    </div>
                ))}
            </div>

            {pendingReqs.length > 0 && (
                <div className="p-card" style={{ borderColor: VENDOR_COLOR + "44" }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📋 Pending Requests from Sellers</h3>
                    <div className="col gap10">
                        {pendingReqs.map(r => (
                            <div key={r.id} className="order-card row-between">
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                    <span style={{ fontSize: 26 }}>{r.emoji}</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{r.productName}</div>
                                        <div style={{ fontSize: 12, color: P.textMuted }}>{r.sellerName} · ×{r.qty} · ₹{r.total}</div>
                                    </div>
                                </div>
                                <button className="p-btn p-btn-primary p-btn-sm" onClick={() => handleFulfill(r)} disabled={fulfilling === r.id}>
                                    {fulfilling === r.id ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />Fulfilling</> : "Fulfill ✓"}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Demand signals (visible if shareView enabled) */}
            {shareViewEnabled && (
                <div className="p-card" style={{ borderColor: VENDOR_COLOR + "44", background: VENDOR_COLOR + "06" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📈 Demand Signals</h3>
                        <span style={{ background: VENDOR_COLOR + "33", color: VENDOR_COLOR, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>SHARED</span>
                    </div>
                    {products.filter(p => p.supplierId === user?.supplierId).map(p => (
                        <div key={p.id} className="row-between" style={{ padding: "8px 0", borderBottom: `1px solid ${P.border}44` }}>
                            <div style={{ display: "flex", gap: 10 }}><span>{p.emoji}</span><span style={{ fontSize: 13 }}>{p.name}</span></div>
                            <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                                <span style={{ color: P.textMuted }}>×{p.monthlySales}/mo</span>
                                <span style={{ color: p.demandTrend === "rising" ? P.success : p.demandTrend === "falling" ? P.danger : P.textMuted, fontWeight: 700 }}>
                                    {p.demandTrend === "rising" ? "↑" : p.demandTrend === "falling" ? "↓" : "→"} {p.demandTrend}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const RequestsTab = () => (
        <div className="col gap14">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📋 All Requests ({myRequests.length})</h2>
            {myRequests.map(r => (
                <div key={r.id} className="p-card">
                    <div className="row-between mb8">
                        <div style={{ fontWeight: 700 }}>{r.id} <span style={{ color: P.textMuted, fontWeight: 400, fontSize: 12 }}>· {r.sellerName}</span></div>
                        <span style={{ background: r.status === "fulfilled" ? P.success + "22" : P.warning + "22", color: r.status === "fulfilled" ? P.success : P.warning, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                            {r.status === "fulfilled" ? "✅ Fulfilled" : "⏳ Pending"}
                        </span>
                    </div>
                    <div style={{ fontSize: 13 }}>{r.emoji} {r.productName} ×{r.qty} · ₹{r.total}</div>
                    <div style={{ fontSize: 12, color: P.textMuted, marginTop: 4 }}>{new Date(r.date).toLocaleString("en-IN")}</div>
                </div>
            ))}
        </div>
    );

    const StockTab = () => (
        <div className="col gap14">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📦 My Warehouse Stock</h2>
            {myInventory.map(v => (
                <div key={v.id} className="p-card row-between">
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ fontSize: 28 }}>{v.emoji}</span>
                        <div>
                            <div style={{ fontWeight: 600 }}>{v.productName}</div>
                            <div style={{ fontSize: 12, color: P.textMuted }}>Min Order: {v.minOrderQty} {v.unit} · Lead: {v.leadDays}d</div>
                        </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{v.stock} {v.unit}</div>
                        <div style={{ fontSize: 12, color: P.textMuted }}>Cost: ₹{v.costPrice}/{v.unit}</div>
                    </div>
                </div>
            ))}
        </div>
    );

    const InsightsTab = () => (
        <div className="col gap16">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📈 Market Insights</h2>
            <div className="p-card">
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Product Demand Trends</h3>
                {products.filter(p => p.supplierId === user?.supplierId).map(p => (
                    <div key={p.id} className="row-between" style={{ padding: "10px 0", borderBottom: `1px solid ${P.border}44` }}>
                        <div style={{ display: "flex", gap: 10 }}><span>{p.emoji}</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                                <div style={{ fontSize: 12, color: P.textMuted }}>Selling @ ₹{p.sellingPrice} · Market avg ₹{p.marketAvgPrice}</div>
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ color: p.demandTrend === "rising" ? P.success : p.demandTrend === "falling" ? P.danger : P.textMuted, fontWeight: 700, fontSize: 14 }}>
                                {p.demandTrend === "rising" ? "📈" : p.demandTrend === "falling" ? "📉" : "💹"} {p.demandTrend}
                            </div>
                            <div style={{ fontSize: 12, color: P.textMuted }}>{fmtFull(p.monthlyRevenue)}/mo GMV</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const tabs = [<SupplyTab />, <RequestsTab />, <StockTab />, <InsightsTab />];
    return (
        <div>
            {tabs[activeTab] || <SupplyTab />}
            {toast && <Toast msg={toast.msg} icon={toast.icon} onDone={() => setToast(null)} />}
        </div>
    );
}
