import React, { memo } from "react";
import { useNearMart } from "../../context/NearMartContext";
import { calcProfit, fmtFull } from "../../utils/helpers";
import { T } from "../../theme/theme";
import Tooltip from "../../components/Tooltip";
import { useAuth } from "../../auth/AuthContext";

export const OverviewDashboard = memo(({ setActiveTab }) => {
    const { products, purchaseOrders } = useNearMart();
    const { user } = useAuth();
    const role = user?.role || "";

    // Financial data — computed for seller, hidden from admin/vendor
    const isSeller = role === "seller";
    const totalRev = products.reduce((a, p) => a + p.monthlyRevenue, 0);
    const totalProfit = products.reduce((a, p) => a + p.monthlyProfit, 0);
    const marginPct = totalRev ? (totalProfit / totalRev * 100) : 0;
    const pendingPOs = purchaseOrders.filter(po => po.status === "pending").length;
    const weekRevTrend = [38, 42, 36, 55, 49, 62, 58].map(v => v * 1000);

    return (
        <div className="page-enter col gap16">
            <div className="row-between">
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>Supply Chain Overview</h2>
                    <p className="text-dim text-sm mt4">Live aggregates — updates when you modify prices or create POs</p>
                </div>
                <div className="row gap8">
                    <button className="btn btn-ghost btn-sm">📤 Export</button>
                    <button className="btn btn-gold btn-sm" onClick={() => setActiveTab("procurement")}>+ New PO</button>
                </div>
            </div>

            {/* KPI Row */}
            <div className="g4">
                {/* GMV — seller only */}
                {isSeller && (
                    <div className="kpi-card" style={{ "--kc": T.gold }}>
                        <div className="kpi-icon">💰</div>
                        <div className="kpi-label">
                            GMV <Tooltip text="Gross Merchandise Value — total sales revenue processed through the platform before any deductions." />
                        </div>
                        <div className="kpi-value text-gold">{fmtFull(totalRev)}</div>
                        <div className="kpi-delta text-emerald">↑ 12% vs last month</div>
                    </div>
                )}
                {/* Net Revenue — seller only */}
                {isSeller && (
                    <div className="kpi-card" style={{ "--kc": T.emerald }}>
                        <div className="kpi-icon">📈</div>
                        <div className="kpi-label">
                            Net Revenue <Tooltip text="Revenue after deducting platform commissions. Margin improvements here flow from Smart Pricing." />
                        </div>
                        <div className="kpi-value text-emerald">{fmtFull(totalProfit)}</div>
                        <div className="kpi-delta text-emerald">↑ Margin: {marginPct.toFixed(1)}%</div>
                    </div>
                )}
                {/* Pending POs — visible to all */}
                <div className="kpi-card" style={{ "--kc": T.sapphire }}>
                    <div className="kpi-icon">📋</div>
                    <div className="kpi-label">Pending POs</div>
                    <div className="kpi-value text-sapphire">{pendingPOs}</div>
                    <div className="kpi-delta text-dim" style={{ cursor: "pointer" }} onClick={() => setActiveTab("procurement")}>View all →</div>
                </div>
                {/* Active SKUs — visible to all */}
                <div className="kpi-card" style={{ "--kc": T.amber }}>
                    <div className="kpi-icon">📦</div>
                    <div className="kpi-label">Active SKUs</div>
                    <div className="kpi-value text-amber">{products.length}</div>
                    <div className="kpi-delta text-dim" style={{ cursor: "pointer" }} onClick={() => setActiveTab("inventory")}>Manage Inventory →</div>
                </div>
            </div>

            {/* Revenue Trend — seller only */}
            <div className="g21">
                {isSeller && (
                    <div className="card">
                        <div className="sec-title">Weekly Revenue Trend</div>
                        <div style={{ height: 90, display: "flex", alignItems: "flex-end", gap: 6 }}>
                            {weekRevTrend.map((v, i) => {
                                const mx = Math.max(...weekRevTrend);
                                return (
                                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                        <div style={{ width: "100%", height: `${(v / mx) * 80}px`, background: `linear-gradient(180deg,${T.gold},${T.goldDim})`, borderRadius: "4px 4px 0 0", opacity: .8 + i * .03, transition: "height .5s ease" }} />
                                        <span className="text-xs text-dim">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
                {/* Top Performing SKUs — seller only (shows profit margins) */}
                {isSeller && (
                    <div className="card col gap12">
                        <div className="sec-title">Top Performing SKUs</div>
                        {products.slice(0, 3).map(p => {
                            const cal = calcProfit(p);
                            return (
                                <div key={p.id} className="row gap10">
                                    <span style={{ fontSize: 20 }}>{p.emoji}</span>
                                    <div className="flex1">
                                        <div className="font-semi text-sm">{p.name}</div>
                                        <div className="profit-meter">
                                            <div className="profit-fill" style={{ width: `${Math.min(100, cal.marginPct * 5)}%`, background: `linear-gradient(90deg,${T.emerald},${T.gold})` }} />
                                        </div>
                                    </div>
                                    <span className="text-xs font-mono text-emerald">{cal.marginPct.toFixed(1)}%</span>
                                </div>
                            )
                        })}
                    </div>
                )}
                {/* Non-seller overview: show a simple summary card instead */}
                {!isSeller && (
                    <div className="card col gap12">
                        <div className="sec-title">Platform Activity</div>
                        <div className="text-sm text-dim" style={{ lineHeight: 1.7 }}>
                            <div className="row gap8 mb8">
                                <span style={{ fontSize: 16 }}>📋</span>
                                <span><strong>{pendingPOs}</strong> purchase orders pending review</span>
                            </div>
                            <div className="row gap8">
                                <span style={{ fontSize: 16 }}>📦</span>
                                <span><strong>{products.length}</strong> active SKUs across the platform</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
