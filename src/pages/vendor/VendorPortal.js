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
    const myInventory = vendorInventory.filter(v => v.vendorId === user?._id || !v.vendorId); // Fallback tolerant
    const myRequests = procurement.filter(p => p.vendorId === user?._id || !p.vendorId);
    const pendingReqs = myRequests.filter(p => p.status === "pending");

    const handleFulfill = (rec) => {
        setFulfilling(rec.id || rec._id);
        setTimeout(async () => {
            const success = await vendorFulfillOrder(rec.id || rec._id, rec.qty);
            setFulfilling(null);
            if (success) {
                setToast({ msg: `Fulfilled: ${rec.items?.length || 1} items to ${rec.sellerName || "Seller"}`, icon: "📦" });
            }
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
                            <div key={r.id || r._id} className="order-card row-between" style={{ alignItems: "flex-start" }}>
                                <div style={{ display: "flex", gap: 12 }}>
                                    <span style={{ fontSize: 26 }}>📦</span>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Order from {r.sellerName || "Seller"}</div>
                                        {r.items?.length > 0 ? (
                                            <div style={{ fontSize: 13, color: P.textMuted, display: "flex", flexDirection: "column", gap: 2 }}>
                                                {r.items.map((item, idx) => (
                                                    <span key={idx}>• {item.productName} (×{item.qty})</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 12, color: P.textMuted }}>{r.productName} · ×{r.qty}</div>
                                        )}
                                        <div style={{ fontWeight: 800, marginTop: 6, color: VENDOR_COLOR }}>Total: ₹{r.totalAmount || r.total || 0}</div>
                                    </div>
                                </div>
                                <button className="p-btn p-btn-primary p-btn-sm" onClick={() => handleFulfill(r)} disabled={fulfilling === (r.id || r._id)}>
                                    {fulfilling === (r.id || r._id) ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />Fulfilling</> : "Fulfill ✓"}
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
                    {products.slice(0, 5).map(p => (
                        <div key={p.id} className="row-between" style={{ padding: "8px 0", borderBottom: `1px solid ${P.border}44` }}>
                            <div style={{ display: "flex", gap: 10 }}><span>{p.emoji}</span><span style={{ fontSize: 13 }}>{p.name}</span></div>
                            <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                                <span style={{ color: P.textMuted }}>×{p.monthlySales || 0}/mo</span>
                                <span style={{ color: p.demandTrend === "rising" ? P.success : p.demandTrend === "falling" ? P.danger : P.textMuted, fontWeight: 700 }}>
                                    {p.demandTrend === "rising" ? "↑" : p.demandTrend === "falling" ? "↓" : "→"} {p.demandTrend || "stable"}
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
                <div key={r.id || r._id} className="p-card">
                    <div className="row-between mb8">
                        <div style={{ fontWeight: 700 }}>{r.id || r._id} <span style={{ color: P.textMuted, fontWeight: 400, fontSize: 12 }}>· {r.sellerName}</span></div>
                        <span style={{
                            background: r.status === "pending" ? P.warning + "22" : r.status === "accepted" ? P.accent + "22" : ["shipped", "in_transit"].includes(r.status) ? P.primary + "22" : P.success + "22",
                            color: r.status === "pending" ? P.warning : r.status === "accepted" ? P.accent : ["shipped", "in_transit"].includes(r.status) ? P.primary : P.success,
                            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700
                        }}>
                            {r.status === "pending" ? "⏳ Pending" : r.status === "accepted" ? "🚚 Awaiting Rider" : ["shipped", "in_transit"].includes(r.status) ? "💨 In Transit" : "✅ Delivered"}
                        </span>
                    </div>

                    <div style={{ background: P.bg, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                        {r.items?.map((item, i) => (
                            <div key={i} className="row-between" style={{ fontSize: 13, marginBottom: i === r.items.length - 1 ? 0 : 6, borderBottom: i === r.items.length - 1 ? "none" : `1px solid ${P.border}44`, paddingBottom: i === r.items.length - 1 ? 0 : 6 }}>
                                <span>📦 {item.productName}</span>
                                <span style={{ fontWeight: 600 }}>×{item.qty} · ₹{item.costPrice * item.qty}</span>
                            </div>
                        ))}
                    </div>

                    <div className="row-between">
                        <div style={{ fontSize: 12, color: P.textMuted }}>{new Date(r.createdAt || r.date || Date.now()).toLocaleString("en-IN")}</div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>Total: ₹{r.totalAmount || r.total || 0}</div>
                    </div>
                </div>
            ))}
        </div>
    );

    const StockTab = () => {
        const [isAdding, setIsAdding] = useState(false);
        const [newItem, setNewItem] = useState({ productName: "", stock: "", costPrice: "", unit: "kg" });
        const [editId, setEditId] = useState(null);
        const [editItem, setEditItem] = useState({ stock: "", costPrice: "" });

        const handleAdd = async () => {
            if (!newItem.productName || !newItem.stock || !newItem.costPrice) return;
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
            await fetch(`${API_BASE}/vendor-inventory`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("nm_access_token")}` },
                body: JSON.stringify({ ...newItem, stock: +newItem.stock, costPrice: +newItem.costPrice })
            });
            setIsAdding(false);
            setToast({ msg: "Supply added to warehouse!", icon: "🏭" });
            setTimeout(() => window.location.reload(), 1000);
        };

        const handleSaveEdit = async (id) => {
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
            await fetch(`${API_BASE}/vendor-inventory/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("nm_access_token")}` },
                body: JSON.stringify({ stock: Number(editItem.stock), costPrice: Number(editItem.costPrice) })
            });
            setEditId(null);
            setToast({ msg: "Stock updated securely.", icon: "✅" });
            setTimeout(() => window.location.reload(), 500);
        };

        return (
            <div className="col gap14">
                <div className="row-between">
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>📦 My Warehouse Stock</h2>
                    <button onClick={() => setIsAdding(!isAdding)} className="p-btn p-btn-primary p-btn-sm">+ Add Stock</button>
                </div>

                {isAdding && (
                    <div className="p-card col gap10" style={{ background: VENDOR_COLOR + "11", borderColor: VENDOR_COLOR }}>
                        <div style={{ fontWeight: 700 }}>Add New Raw Material / Stock</div>
                        <input className="p-input" placeholder="Product Name (e.g. Fresh Wheat)" value={newItem.productName} onChange={e => setNewItem({ ...newItem, productName: e.target.value })} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <input className="p-input" type="number" placeholder="Stock Qty" value={newItem.stock} onChange={e => setNewItem({ ...newItem, stock: e.target.value })} />
                            <input className="p-input" type="number" placeholder="Cost Price (₹)" value={newItem.costPrice} onChange={e => setNewItem({ ...newItem, costPrice: e.target.value })} />
                        </div>
                        <button onClick={handleAdd} className="p-btn p-btn-primary">Save to Warehouse</button>
                    </div>
                )}

                {myInventory.length === 0 && !isAdding && (
                    <div style={{ textAlign: "center", padding: "40px 0", color: P.textMuted }}>Your warehouse is empty. Add stock to supply the platform!</div>
                )}

                {myInventory.map(v => (
                    <div key={v.id || v._id} className="p-card row-between" style={{ alignItems: "flex-start" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 28 }}>{v.emoji || "📦"}</span>
                            <div>
                                <div style={{ fontWeight: 600 }}>{v.productName}</div>
                                <div style={{ fontSize: 12, color: P.textMuted }}>Min Order: {v.minOrderQty || 10} {v.unit} · Lead: {v.leadDays || 1}d</div>
                            </div>
                        </div>
                        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                            {editId === (v.id || v._id) ? (
                                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                    <input className="p-input" type="number" style={{ width: 80, padding: "4px 8px", fontSize: 13 }} value={editItem.stock} onChange={e => setEditItem({ ...editItem, stock: e.target.value })} title="Stock Qty" />
                                    <input className="p-input" type="number" style={{ width: 80, padding: "4px 8px", fontSize: 13 }} value={editItem.costPrice} onChange={e => setEditItem({ ...editItem, costPrice: e.target.value })} title="Cost Price" />
                                    <button onClick={() => handleSaveEdit(v.id || v._id)} style={{ background: P.success, color: "#fff", border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Save</button>
                                    <button onClick={() => setEditId(null)} style={{ background: P.border, color: P.text, border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontWeight: 800, fontSize: 18 }}>{v.stock} {v.unit}</div>
                                    <div style={{ fontSize: 12, color: P.textMuted }}>Cost: ₹{v.costPrice}/{v.unit}</div>
                                    <button onClick={() => { setEditId(v.id || v._id); setEditItem({ stock: v.stock, costPrice: v.costPrice }); }} style={{ background: "transparent", border: "none", color: VENDOR_COLOR, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 0 0 0", marginTop: 4, opacity: 0.8 }}>✐ Edit Stock & Price</button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const InsightsTab = () => (
        <div className="col gap16">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📈 Market Insights</h2>
            <div className="p-card">
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Product Demand Trends</h3>
                {products.sort((a, b) => (b.monthlySales || 0) - (a.monthlySales || 0)).slice(0, 6).map(p => (
                    <div key={p.id} className="row-between" style={{ padding: "10px 0", borderBottom: `1px solid ${P.border}44` }}>
                        <div style={{ display: "flex", gap: 10 }}><span>{p.emoji}</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                                <div style={{ fontSize: 12, color: P.textMuted }}>Selling @ ₹{p.sellingPrice} · Market avg ₹{p.marketAvgPrice || p.sellingPrice}</div>
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ color: p.demandTrend === "rising" ? P.success : p.demandTrend === "falling" ? P.danger : P.textMuted, fontWeight: 700, fontSize: 14 }}>
                                {p.demandTrend === "rising" ? "📈" : p.demandTrend === "falling" ? "📉" : "💹"} {p.demandTrend || "stable"}
                            </div>
                            <div style={{ fontSize: 12, color: P.textMuted }}>{fmtFull(p.monthlyRevenue || (p.monthlySales * p.sellingPrice) || 0)}/mo GMV</div>
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
