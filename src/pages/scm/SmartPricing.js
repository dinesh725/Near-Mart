import React, { memo, useState } from "react";
import { T } from "../../theme/theme";
import { fmt, fmtFull } from "../../utils/helpers";
import { useNearMart } from "../../context/NearMartContext";

export const SmartPricing = memo(() => {
    const { products, updatePrice } = useNearMart();
    const [applied, setApplied] = useState({});
    const [saving, setSaving] = useState(null);

    const handleApply = (p, newPrice) => {
        setSaving(p.id);
        setTimeout(() => {
            updatePrice(p.id, newPrice);
            setApplied(prev => ({ ...prev, [p.id]: newPrice }));
            setSaving(null);
        }, 500);
    };

    return (
        <div className="page-enter col gap16">
            <div className="row-between">
                <h2 className="sec-title" style={{ marginBottom: 0 }}>AI Market Pricing</h2>
                <div className="row gap8">
                    <button className="btn btn-ghost btn-xs">Market Scrape: 2m ago</button>
                </div>
            </div>
            <div className="alert-strip alert-info">
                ⚡ Clicking "Apply" saves the new price to global state and updates Profit Engine margins instantly.
            </div>
            <div className="card">
                <div className="scm-table-wrap">
                    <table className="scm-table">
                        <thead>
                            <tr><th>Item</th><th>Current Price</th><th>Market Avg</th><th>Competitor Range</th><th>AI Recommendation</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {products.map(p => {
                                const isApplied = applied[p.id] !== undefined;
                                const isSaving = saving === p.id;
                                const rec = p.sellingPrice > p.marketAvgPrice
                                    ? p.marketAvgPrice - 2
                                    : p.sellingPrice < p.competitorLow
                                        ? p.competitorLow - 1
                                        : null;

                                return (
                                    <tr key={p.id}>
                                        <td>
                                            <div className="row gap8"><span style={{ fontSize: 16 }}>{p.emoji}</span><span className="font-bold">{p.name}</span></div>
                                        </td>
                                        <td className="font-mono font-bold" style={{ fontSize: 15 }}>{fmt(p.sellingPrice)}</td>
                                        <td className="font-mono text-dim">{fmt(p.marketAvgPrice)}</td>
                                        <td className="text-xs text-dim">{fmt(p.competitorLow)} — {fmt(p.competitorHigh)}</td>
                                        <td>
                                            {rec !== null ? (
                                                p.sellingPrice > p.marketAvgPrice ? (
                                                    <span className="text-coral font-semi">↓ Lower to {fmt(rec)}</span>
                                                ) : (
                                                    <span className="text-emerald font-semi">↑ Raise to {fmt(rec)}</span>
                                                )
                                            ) : (
                                                <span className="text-dim">✓ Optimized</span>
                                            )}
                                        </td>
                                        <td>
                                            {rec !== null && !isApplied ? (
                                                <button
                                                    className="btn btn-gold btn-xs"
                                                    disabled={isSaving}
                                                    onClick={() => handleApply(p, rec)}
                                                >
                                                    {isSaving ? "…" : "Apply"}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-dim">✓ Saved</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});
