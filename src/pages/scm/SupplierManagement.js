import React, { memo, useState } from "react";
import { T } from "../../theme/theme";
import { SUPPLIERS } from "../../data/mockData";
import { SupplierAvatar, Stars, TierBadge, StatusBadge, DonutRing } from "../../components/ScmComponents";

export const SupplierManagement = memo(() => {
    const [selId, setSelId] = useState(SUPPLIERS[0].id);
    const sel = SUPPLIERS.find(s => s.id === selId);

    return (
        <div className="page-enter g12">
            <div className="col gap12">
                <div className="row-between">
                    <h2 className="sec-title" style={{ marginBottom: 0 }}>Vendor Directory</h2>
                    <button className="btn btn-gold btn-sm">+ Add</button>
                </div>
                <input type="text" className="input" placeholder="Search suppliers..." />
                <div className="col gap12" style={{ overflowY: "auto", maxHeight: "calc(100vh - 180px)", paddingRight: 6 }}>
                    {SUPPLIERS.map(s => (
                        <div key={s.id} className={`supplier-card ${selId === s.id ? "selected" : ""}`} onClick={() => setSelId(s.id)}>
                            <div className="row gap12 mb8">
                                <SupplierAvatar name={s.name} type={s.type} size={32} />
                                <div className="flex1">
                                    <div className="font-bold text-sm" style={{ color: selId === s.id ? T.bg : T.text }}>{s.name}</div>
                                    <div style={{ fontSize: 10, color: selId === s.id ? T.bg + "99" : T.textDim }}>{s.city}</div>
                                </div>
                                {s.verified && <div style={{ color: selId === s.id ? T.bg : T.emerald }}>✓</div>}
                            </div>
                            <div className="row-between text-xs">
                                <TierBadge tier={s.tier} />
                                <Stars rating={s.rating} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {sel && (
                <div className="card gold-glow col gap16" style={{ overflowY: "auto", maxHeight: "calc(100vh - 120px)" }}>
                    <div className="row-between">
                        <div className="row gap16">
                            <SupplierAvatar name={sel.name} type={sel.type} size={56} />
                            <div>
                                <h2 style={{ fontSize: 20, fontWeight: 800 }}>{sel.name}</h2>
                                <div className="row gap8 text-xs text-muted mt4">
                                    <span>{sel.id}</span>•<span>{sel.city}</span>•<span>GST: {sel.gst}</span>
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
                        <div><div className="text-muted text-xs mb4">Primary Contact</div><div className="font-semi">{sel.contact}</div><div className="text-dim mt4">{sel.phone}</div><div className="text-dim">{sel.email}</div></div>
                        <div><div className="text-muted text-xs mb4">Performance</div><div className="row gap8 font-semi"><span className="text-emerald">{sel.reliabilityScore}%</span> Reliability</div><div className="text-dim mt4">{sel.deliveryAvg} Avg Delivery</div><div className="row gap4 mt4"><Stars rating={sel.rating} /><span className="text-dim">({sel.reviews})</span></div></div>
                        <div><div className="text-muted text-xs mb4">Business Terms</div><div className="font-semi">Payment: {sel.paymentTerms}</div><div className="text-dim mt4">Status: <StatusBadge status={sel.status} /></div><div className="text-dim mt4">Tier: <TierBadge tier={sel.tier} /></div></div>
                    </div>
                    <div className="card" style={{ background: T.surface }}>
                        <div className="sec-title">Category Coverage & Pricing Edge</div>
                        <div className="g2">
                            <div>
                                <div className="text-xs text-muted mb8">Categories Supplied (Products: {sel.products})</div>
                                <div className="row gap6" style={{ flexWrap: "wrap" }}>
                                    {sel.categories.map(c => <span key={c} className="badge badge-muted">{c}</span>)}
                                </div>
                            </div>
                            <div className="row gap16">
                                <DonutRing pct={sel.priceCompetitiveness} color={T.emerald} size={54} sw={6} label="Price Edge" />
                                <div className="text-xs text-dim" style={{ lineHeight: 1.5 }}>Pricing is {sel.priceCompetitiveness}% better than market average. High margin potential for Fresh Produce.</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
