import React, { useState, memo } from "react";
import { StatusBadge } from "../../components/ScmComponents";
import { useNearMart } from "../../context/NearMartContext";
import { fmtFull } from "../../utils/helpers";
import { T } from "../../theme/theme";

// ── Inline tooltip helper ─────────────────────────────────────────────────────
function Tip({ label, tip }) {
    const [show, setShow] = useState(false);
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {label}
            <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: T.border, color: T.textSub, fontSize: 9, fontWeight: 700, cursor: "help", position: "relative" }}>
                ?
                {show && (
                    <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", background: "#0F1621", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 11, color: T.textSub, width: 200, zIndex: 999, lineHeight: 1.6, boxShadow: "0 8px 24px rgba(0,0,0,0.6)", whiteSpace: "normal", textAlign: "left" }}>
                        {tip}
                    </div>
                )}
            </span>
        </span>
    );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, total = 4 }) {
    const labels = ["Select Supplier", "Add Items", "Review", "Confirm"];
    return (
        <div style={{ display: "flex", gap: 0, marginBottom: 24 }}>
            {labels.map((l, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
                    {i > 0 && <div style={{ position: "absolute", top: 12, right: "50%", left: "-50%", height: 2, background: i <= step ? T.gold : T.border, transition: "background 0.3s" }} />}
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: i < step ? T.gold : i === step ? T.goldDim : T.border, border: `2px solid ${i <= step ? T.gold : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: i <= step ? "#000" : T.textDim, zIndex: 1, transition: "all 0.3s" }}>
                        {i < step ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 10, color: i === step ? T.gold : T.textDim, fontWeight: i === step ? 700 : 400, textAlign: "center", lineHeight: 1.3 }}>{l}</span>
                </div>
            ))}
        </div>
    );
}

// ── 4-Step Purchase Order Wizard ──────────────────────────────────────────────
function POWizard({ vendorInventory, onSubmit, onCancel }) {
    const [step, setStep] = useState(0);

    const suppliers = React.useMemo(() => {
        const map = new Map();
        vendorInventory.forEach(v => {
            if (v.vendorId && !map.has(v.vendorId)) {
                map.set(v.vendorId, { id: v.vendorId, name: v.vendorName, location: "Local Warehouse", rating: 5.0, paymentTerms: "Standard" });
            }
        });
        return Array.from(map.values());
    }, [vendorInventory]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [items, setItems] = useState([{ name: "", qty: "", costPrice: "" }]);

    const addItem = () => setItems(prev => [...prev, { name: "", qty: "", costPrice: "" }]);
    const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
    const setItem = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

    const subtotal = items.reduce((s, it) => s + (+(it.qty || 0) * +(it.costPrice || 0)), 0);
    const gst = Math.round(subtotal * 0.05);
    const total = subtotal + gst;

    const canProceed = [
        !!selectedSupplier,
        items.every(it => it.name && it.qty > 0 && it.costPrice > 0),
        true,
        true,
    ][step];

    const handleConfirm = () => {
        onSubmit({
            supplier: selectedSupplier.name,
            supplierName: selectedSupplier.name,
            supplierId: selectedSupplier.id,
            items, subtotal, gst, total,
        });
    };

    return (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.gold }}>New Purchase Order</h3>
                <button onClick={onCancel} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <StepBar step={step} />

            {/* STEP 0: Who are you buying from? */}
            {step === 0 && (
                <div className="col gap14">
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>Who is the supplier?</div>
                    <div className="col gap10">
                        {suppliers.map(s => (
                            <div key={s.id} onClick={() => setSelectedSupplier(s)}
                                style={{ padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${selectedSupplier?.id === s.id ? T.gold : T.border}`, background: selectedSupplier?.id === s.id ? T.goldFg : T.panel, cursor: "pointer", transition: "all .2s", display: "flex", gap: 12, alignItems: "center" }}>
                                <div style={{ fontSize: 22 }}>{s.logo || "🏭"}</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{s.name}</div>
                                    <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>📍 {s.location} · {s.rating}⭐ · {s.paymentTerms}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 1: What are you buying? */}
            {step === 1 && (
                <div className="col gap14">
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textSub, marginBottom: 2 }}>
                        What do you want to order from <span style={{ color: T.gold }}>{selectedSupplier?.name}</span>?
                    </div>
                    {items.map((item, i) => (
                        <div key={i} style={{ background: T.panel, borderRadius: 12, border: `1px solid ${T.border}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 700, fontSize: 12, color: T.gold }}>ITEM {i + 1}</span>
                                {items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: T.coral, cursor: "pointer", fontSize: 16 }}>✕</button>}
                            </div>
                            <select className="btn btn-ghost" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontFamily: "'Sora',sans-serif", fontSize: 13, width: "100%", appearance: "auto" }}
                                value={item.name}
                                onChange={e => {
                                    const selected = vendorInventory.find(v => v.productName === e.target.value && v.vendorId === selectedSupplier.id);
                                    if (selected) {
                                        setItems(prev => prev.map((it, idx) => idx === i ? { ...it, name: selected.productName, costPrice: selected.costPrice } : it));
                                    }
                                }}>
                                <option value="" disabled>Select a catalog item...</option>
                                {vendorInventory.filter(v => v.vendorId === selectedSupplier?.id).map(v => (
                                    <option key={v._id || v.id} value={v.productName}>
                                        {v.emoji || "📦"} {v.productName} — ₹{v.costPrice}/{v.unit} (Stock: {v.stock})
                                    </option>
                                ))}
                            </select>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: T.textDim, fontWeight: 700, display: "block", marginBottom: 4 }}>
                                        <Tip label="How many?" tip="Enter the quantity you want to order — in kg, pieces, or litres based on the product." />
                                    </label>
                                    <input style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontFamily: "'Sora',sans-serif", fontSize: 13, width: "100%" }}
                                        type="number" placeholder="Qty" value={item.qty} onChange={e => setItem(i, "qty", e.target.value)} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: T.textDim, fontWeight: 700, display: "block", marginBottom: 4 }}>
                                        <Tip label="Cost per unit (₹)" tip="The price you pay the supplier per unit. This is your cost price — kept private from customers." />
                                    </label>
                                    <input style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontFamily: "'Sora',sans-serif", fontSize: 13, width: "100%" }}
                                        type="number" placeholder="₹ per unit" value={item.costPrice} onChange={e => setItem(i, "costPrice", e.target.value)} />
                                </div>
                            </div>
                            {item.qty && item.costPrice && (
                                <div style={{ fontSize: 12, color: T.emerald }}>
                                    Line total: {fmtFull(item.qty * item.costPrice)}
                                </div>
                            )}
                        </div>
                    ))}
                    <button onClick={addItem} style={{ background: "none", border: `1px dashed ${T.border}`, borderRadius: 12, padding: "12px", color: T.textSub, cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 13 }}>
                        + Add Another Item
                    </button>
                </div>
            )}

            {/* STEP 2: Review */}
            {step === 2 && (
                <div className="col gap14">
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.textSub }}>Review your order before confirming</div>
                    <div style={{ background: T.panel, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                        <div style={{ padding: "10px 16px", background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>🏭 {selectedSupplier?.name}</span>
                        </div>
                        {items.map((it, i) => (
                            <div key={i} style={{ padding: "11px 16px", borderBottom: `1px solid ${T.border}44`, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                                <span>{it.name} × {it.qty}</span>
                                <span style={{ color: T.gold, fontWeight: 700 }}>{fmtFull(it.qty * it.costPrice)}</span>
                            </div>
                        ))}
                        <div style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.textSub, marginBottom: 6 }}>
                                <span>Subtotal</span><span>{fmtFull(subtotal)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.textSub, marginBottom: 6 }}>
                                <span><Tip label="GST (5%)" tip="Goods and Services Tax applied to the purchase at 5% — standard rate for food items." /></span>
                                <span>+{fmtFull(gst)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                                <span style={{ color: T.gold }}>Total Order Value</span>
                                <span style={{ color: T.gold }}>{fmtFull(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: Confirm */}
            {step === 3 && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Ready to place this order?</div>
                    <div style={{ color: T.textSub, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                        A purchase order for <strong>{fmtFull(total)}</strong> will be created<br />
                        and sent to <strong>{selectedSupplier?.name}</strong>.
                    </div>
                    <button onClick={handleConfirm}
                        style={{ background: `linear-gradient(135deg,${T.gold},${T.goldDim})`, border: "none", borderRadius: 12, padding: "14px 32px", fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 14, color: "#000", cursor: "pointer", boxShadow: `0 8px 24px ${T.goldGlow}` }}>
                        ✓ Confirm Purchase Order
                    </button>
                </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                {step > 0 && <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px", fontFamily: "'Sora',sans-serif", fontWeight: 700, color: T.textSub, cursor: "pointer" }}>← Back</button>}
                {step < 3 && (
                    <button onClick={() => setStep(s => s + 1)} disabled={!canProceed}
                        style={{ flex: 2, background: canProceed ? T.goldFg : T.border, border: `1px solid ${canProceed ? T.gold : T.border}`, borderRadius: 10, padding: "12px", fontFamily: "'Sora',sans-serif", fontWeight: 700, color: canProceed ? T.gold : T.textDim, cursor: canProceed ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
                        Continue →
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export const ProcurementTracker = memo(() => {
    const { purchaseOrders, vendorInventory, createPO } = useNearMart();
    const [showWizard, setShowWizard] = useState(false);
    const [successPO, setSuccessPO] = useState(null);

    const handleSubmit = async (details) => {
        try {
            const po = await createPO(details);
            setSuccessPO(po);
            setShowWizard(false);
        } catch (err) {
            alert(err.message || "Failed to dispatch Purchase Order.");
        }
    };

    return (
        <div className="page-enter col gap16">
            <div className="row-between">
                <div>
                    <h2 className="sec-title" style={{ marginBottom: 2 }}>Purchase Orders ({purchaseOrders.length})</h2>
                    <span className="text-xs text-dim">Buy from suppliers, track fulfilment, manage costs</span>
                </div>
                <button onClick={() => setShowWizard(v => !v)}
                    style={{ background: `linear-gradient(135deg,${T.gold},${T.goldDim})`, border: "none", borderRadius: 10, padding: "10px 18px", fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 13, color: "#000", cursor: "pointer", boxShadow: `0 4px 12px ${T.goldGlow}` }}>
                    {showWizard ? "✕ Cancel" : "+ New Order"}
                </button>
            </div>

            {/* Success banner */}
            {successPO && (
                <div style={{ background: `${T.emerald}15`, border: `1px solid ${T.emerald}44`, borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 22 }}>✅</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>Purchase Order Created!</div>
                        <div style={{ fontSize: 12, color: T.textSub }}>PO {successPO.id} · {fmtFull(successPO.total)} has been sent to {successPO.supplier}</div>
                    </div>
                    <button onClick={() => setSuccessPO(null)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18 }}>✕</button>
                </div>
            )}

            {showWizard && (
                <POWizard vendorInventory={vendorInventory || []} onSubmit={handleSubmit} onCancel={() => setShowWizard(false)} />
            )}

            {/* Existing POs table */}
            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, color: T.textSub, marginBottom: 14 }}>📋 All Purchase Orders</div>
                <div className="scm-table-wrap">
                    <table className="scm-table">
                        <thead>
                            <tr>
                                <th>PO No.</th>
                                <th>Supplier</th>
                                <th>Order Date</th>
                                <th>
                                    <Tip label="Expected By" tip="The scheduled delivery date agreed with the supplier." />
                                </th>
                                <th>
                                    <Tip label="Order Value" tip="Total cost including all items, GST, and applicable taxes." />
                                </th>
                                <th>Status</th>
                                <th>Payment</th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchaseOrders.map(po => (
                                <tr key={po.id}>
                                    <td className="font-mono font-bold" style={{ fontSize: 12 }}>{po.id}</td>
                                    <td>
                                        <div className="font-semi">{po.supplier || po.supplierName}</div>
                                        <div className="text-xs text-dim">{po.supplierId}</div>
                                    </td>
                                    <td className="text-sm text-dim">{po.date}</td>
                                    <td className="text-sm text-dim">{po.expectedDelivery}</td>
                                    <td className="font-mono font-bold">{fmtFull(po.total)}</td>
                                    <td>
                                        <StatusBadge status={po.status} />
                                        {po.deliveryOtp && ["accepted", "shipped", "in_transit"].includes(po.status) && (
                                            <div style={{ marginTop: 6, fontSize: 11, background: "#0F1621", padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, display: "inline-block" }}>
                                                OTP: <span style={{ color: T.gold, fontWeight: 800, letterSpacing: 2 }}>{po.deliveryOtp}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td><StatusBadge status={po.paymentStatus === "paid" ? "paid" : "pending"} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});
