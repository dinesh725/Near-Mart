import React, { memo, useState, useEffect } from "react";
import { T } from "../../theme/theme";
import api from "../../api/client";
import { SupplierAvatar, Stars, TierBadge, StatusBadge, DonutRing } from "../../components/ScmComponents";

export const SupplierManagement = memo(() => {
    const [suppliers, setSuppliers] = useState([]);
    const [selId, setSelId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/vendors").then(res => {
            const vends = res.data || [];
            setSuppliers(vends);
            if (vends.length > 0) setSelId(vends[0]._id);
        }).catch(err => console.error("Failed fetching vendors", err))
            .finally(() => setLoading(false));
    }, []);

    const sel = suppliers.find(s => s._id === selId);

    if (loading) return <div className="p20" style={{ color: T.textSub }}>Loading Vendors...</div>;
    if (suppliers.length === 0) return <div className="p20" style={{ color: T.textSub }}>No Vendors registered yet.</div>;

    return (
        <div className="page-enter g12">
            <div className="col gap12">
                <div className="row-between">
                    <h2 className="sec-title" style={{ marginBottom: 0 }}>Vendor Directory</h2>
                    <button className="btn btn-gold btn-sm">+ Add</button>
                </div>
                <input type="text" className="input" placeholder="Search suppliers..." />
                <div className="col gap12" style={{ overflowY: "auto", maxHeight: "calc(100vh - 180px)", paddingRight: 6 }}>
                    {suppliers.map(s => (
                        <div key={s._id} className={`supplier-card ${selId === s._id ? "selected" : ""}`} onClick={() => setSelId(s._id)}>
                            <div className="row gap12 mb8">
                                <SupplierAvatar name={s.companyName || s.name} type="manufacturer" size={32} />
                                <div className="flex1">
                                    <div className="font-bold text-sm" style={{ color: selId === s._id ? T.bg : T.text }}>{s.companyName || s.name}</div>
                                    <div style={{ fontSize: 10, color: selId === s._id ? T.bg + "99" : T.textDim }}>{s.city || "Unknown"}</div>
                                </div>
                                <div style={{ color: selId === s._id ? T.bg : T.emerald }}>✓</div>
                            </div>
                            <div className="row-between text-xs">
                                <TierBadge tier="manufacturer" />
                                <Stars rating={4.8} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {sel && (
                <div className="card gold-glow col gap16" style={{ overflowY: "auto", maxHeight: "calc(100vh - 120px)" }}>
                    <div className="row-between">
                        <div className="row gap16">
                            <SupplierAvatar name={sel.companyName || sel.name} type="manufacturer" size={56} />
                            <div>
                                <h2 style={{ fontSize: 20, fontWeight: 800 }}>{sel.companyName || sel.name}</h2>
                                <div className="row gap8 text-xs text-muted mt4">
                                    <span>{sel.supplierId || sel._id.slice(-6)}</span>•<span>{sel.city || "Earth"}</span>•<span>GST: {sel.gst || "Unregistered"}</span>
                                </div>
                            </div>
                        </div>
                        <div className="row gap8">
                            <button className="btn btn-ghost">Edit</button>
                            <button className="btn btn-sapphire">Contact</button>
                        </div>
                    </div>
                    <div className="divider" />
                    <div className="g3 text-sm">
                        <div><div className="text-muted text-xs mb4">Primary Contact</div><div className="font-semi">{sel.name}</div><div className="text-dim mt4">{sel.email}</div></div>
                        <div><div className="text-muted text-xs mb4">Performance</div><div className="row gap8 font-semi"><span className="text-emerald">98%</span> Reliability</div><div className="text-dim mt4">1-2 Days Avg Delivery</div><div className="row gap4 mt4"><Stars rating={4.8} /><span className="text-dim">(124)</span></div></div>
                        <div><div className="text-muted text-xs mb4">Business Terms</div><div className="font-semi">Payment: {sel.paymentTerms || "Net 30"}</div><div className="text-dim mt4">Status: <StatusBadge status="active" /></div><div className="text-dim mt4">Tier: <TierBadge tier="manufacturer" /></div></div>
                    </div>
                    <div className="card" style={{ background: T.surface }}>
                        <div className="sec-title">Category Coverage & Pricing Edge</div>
                        <div className="g2">
                            <div>
                                <div className="text-xs text-muted mb8">Categories Supplied (Products: ?)</div>
                                <div className="row gap6" style={{ flexWrap: "wrap" }}>
                                    <span className="badge badge-muted">General</span>
                                </div>
                            </div>
                            <div className="row gap16">
                                <DonutRing pct={18} color={T.emerald} size={54} sw={6} label="Price Edge" />
                                <div className="text-xs text-dim" style={{ lineHeight: 1.5 }}>Pricing is 18% better than market average. High margin potential for wholesale bulk orders.</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
