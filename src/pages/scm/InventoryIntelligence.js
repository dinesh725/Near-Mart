import React, { memo, useState } from "react";
import { T } from "../../theme/theme";
import { fmtFull } from "../../utils/helpers";
import { useNearMart } from "../../context/NearMartContext";

export const InventoryIntelligence = memo(() => {
    const { products, createPO } = useNearMart();
    const [created, setCreated] = useState({});

    const handleCreatePO = (p) => {
        const qty = Math.max(50, p.monthlyRevenue > 0 ? Math.ceil(p.monthlySales * 0.5) : 50);
        const subtotal = qty * p.costPrice;
        const gst = Math.round(subtotal * 0.18);
        createPO({
            supplierId: p.supplierId,
            supplierName: p.supplierName || "Primary Vendor",
            items: [{ productId: p.id, name: p.name, qty, unitCost: p.costPrice, total: subtotal }],
            subtotal,
            gst,
            discount: 0,
        });
        setCreated(prev => ({ ...prev, [p.id]: true }));
    };

    const totalStock = products.reduce((a, p) => a + p.stock, 0);

    return (
        <div className="page-enter col gap16">
            <h2 className="sec-title" style={{ marginBottom: 0 }}>Inventory & Allocation</h2>
            <div className="g4">
                <div className="card">
                    <div className="kpi-label">Total Stock Units</div>
                    <div className="kpi-value font-mono">{totalStock.toLocaleString()} <span className="text-xs text-dim">units</span></div>
                </div>
                <div className="card">
                    <div className="kpi-label">Inventory Health</div>
                    <div className="kpi-value font-mono text-emerald">92% <span className="text-xs text-dim">optimal</span></div>
                </div>
                <div className="card">
                    <div className="kpi-label">Out of Stock SKU</div>
                    <div className="kpi-value font-mono text-coral">{products.filter(p => p.stock === 0).length} <span className="text-xs text-dim">urgent</span></div>
                </div>
                <div className="card">
                    <div className="kpi-label">Tied Up Capital</div>
                    <div className="kpi-value font-mono text-amber">{fmtFull(products.reduce((a, p) => a + p.stock * p.costPrice, 0))}</div>
                </div>
            </div>
            <div className="alert-strip alert-info">
                💡 Clicking "Generate PO" creates a real Purchase Order in the global state — check the Procurement Tracker tab to see it.
            </div>
            <div className="card">
                <div className="scm-table-wrap">
                    <table className="scm-table">
                        <thead><tr><th>Product</th><th>Current Stock</th><th>Velocity (7D)</th><th>Days of Cover</th><th>Action</th></tr></thead>
                        <tbody>
                            {products.map(p => {
                                const vel = p.weekSales.reduce((a, v) => a + v, 0) / 7;
                                const doc = vel > 0 ? (p.stock / vel) : 999;
                                const docStr = doc === 999 ? "∞" : doc.toFixed(1);
                                const poCreated = created[p.id];
                                return (
                                    <tr key={p.id}>
                                        <td><div className="row gap8"><span style={{ fontSize: 16 }}>{p.emoji}</span><span className="font-bold">{p.name}</span></div></td>
                                        <td className="font-mono font-bold">{p.stock} <span className="text-xs text-dim">{p.unit}</span></td>
                                        <td className="font-mono text-dim">{vel.toFixed(1)} / day</td>
                                        <td className={`font-mono ${doc < 3 ? "text-coral" : doc > 14 ? "text-emerald" : "text-amber"}`}>{docStr} Days</td>
                                        <td>
                                            {poCreated ? (
                                                <span className="badge badge-emerald">PO Created ✓</span>
                                            ) : p.stock === 0 ? (
                                                <button className="btn btn-danger btn-xs" onClick={() => handleCreatePO(p)}>Generate PO</button>
                                            ) : doc < 5 ? (
                                                <button className="btn btn-ghost btn-xs" style={{ borderColor: T.gold, color: T.gold }} onClick={() => handleCreatePO(p)}>Draft PO</button>
                                            ) : (
                                                <span className="text-xs text-dim">Sufficient</span>
                                            )}
                                        </td>
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
