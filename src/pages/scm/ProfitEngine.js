import React, { memo } from "react";
import { T } from "../../theme/theme";
import { fmtFull, calcProfit } from "../../utils/helpers";
import { Sparkline } from "../../components/ScmComponents";
import { useNearMart } from "../../context/NearMartContext";
import Tooltip from "../../components/Tooltip";

export const ProfitEngine = memo(() => {
    const { products } = useNearMart();
    const totalRev = products.reduce((acc, p) => acc + p.monthlyRevenue, 0);
    const totalProfit = products.reduce((acc, p) => acc + p.monthlyProfit, 0);
    const totalComm = products.reduce((acc, p) => acc + (p.platformComm * p.monthlySales), 0);
    const overallMarginPct = totalRev ? ((totalProfit / totalRev) * 100).toFixed(1) : "0.0";

    return (
        <div className="page-enter col gap16">
            <div className="row-between">
                <h2 className="sec-title" style={{ marginBottom: 0 }}>
                    Real-Time Profit Engine
                    <Tooltip text="Profit Engine aggregates all SKU-level cost data — COGs, logistics, commissions — and derives net margins in real time. Prices changed in Smart Pricing reflect here immediately." />
                </h2>
            </div>
            <div className="g3">
                <div className="card">
                    <div className="kpi-label">
                        Total Monthly Revenue <Tooltip text="Sum of selling_price × monthly_sales for all SKUs." />
                    </div>
                    <div className="kpi-value text-gold font-mono">{fmtFull(totalRev)}</div>
                    <div className="text-emerald text-sm mt8 font-semi">↑ Trending Up</div>
                </div>
                <div className="card">
                    <div className="kpi-label">
                        Gross Profit Margin <Tooltip text="(Total Profit / Total Revenue) × 100. This is after COGs, logistics, and platform commissions." />
                    </div>
                    <div className="kpi-value text-emerald font-mono">{overallMarginPct}%</div>
                    <div className="text-emerald text-sm mt8 font-semi">+1.2% this month</div>
                </div>
                <div className="card">
                    <div className="kpi-label">Platform Commissions</div>
                    <div className="kpi-value text-coral font-mono">{fmtFull(totalComm)}</div>
                    <div className="text-dim text-sm mt8">Standard 10% fee applied</div>
                </div>
            </div>
            <div className="card">
                <h3 className="text-sm font-bold mb16">Automated SKU Profit Analysis</h3>
                <div className="scm-table-wrap">
                    <table className="scm-table">
                        <thead><tr><th>SKU</th><th>Revenue</th><th>Cost Breakdown</th><th>Margin %</th><th>Net Profit</th><th>7-Day Trend</th></tr></thead>
                        <tbody>
                            {products.map(p => {
                                const cal = calcProfit(p);
                                return (
                                    <tr key={p.id}>
                                        <td>
                                            <div className="row gap8"><span style={{ fontSize: 16 }}>{p.emoji}</span><span className="font-bold">{p.name}</span></div>
                                            <div className="text-xs text-dim mt4">Supplier: {p.supplierId}</div>
                                        </td>
                                        <td className="font-mono">{fmtFull(p.monthlyRevenue)}</td>
                                        <td>
                                            <div className="row gap4 text-xs font-mono" style={{ flexWrap: "wrap" }}>
                                                <span className="text-coral">Cost: ₹{p.costPrice}</span>
                                                <span className="text-amber">Lgx: ₹{p.deliveryAlloc}</span>
                                                <span className="text-violet">Comm: ₹{p.platformComm}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${cal.marginPct > 15 ? "badge-emerald" : cal.marginPct > 8 ? "badge-amber" : "badge-coral"}`}>
                                                {cal.marginPct.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="font-bold text-emerald mono">{fmtFull(p.monthlyProfit)}</td>
                                        <td><Sparkline data={p.weekSales} color={T.gold} width={50} height={20} /></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});
