import React, { useState, useRef } from "react";
import ReactDOM from "react-dom";
import { P } from "../theme/theme";
import { useStore } from "../context/GlobalStore";
import { useAuth } from "../auth/AuthContext";

const SORT_OPTIONS = [
    { key: "distance", label: "📍 Nearest" },
    { key: "price", label: "💰 Cheapest" },
    { key: "rating", label: "⭐ Top Rated" },
    { key: "delivery_time", label: "⚡ Fastest" },
];

function SellerCard({ product, onAdd, isAdded }) {
    const seller = product.seller;
    const distText = product.distanceKm != null ? `${product.distanceKm} km` : "—";
    const etaText = `~${product.estimatedDeliveryMin || 30} min`;
    const inRadius = product.inDeliveryRadius !== false;

    return (
        <div style={{
            background: P.card, border: `1px solid ${isAdded ? P.primary : P.border}`,
            borderRadius: 16, padding: "16px", marginBottom: 12,
            transition: "all 0.2s", opacity: !inRadius ? 0.7 : 1,
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 3 }}>
                        {seller?.name || "Store"}
                        {seller?.isOpen === false && <span style={{ color: P.danger, fontSize: 11, fontWeight: 600, marginLeft: 8 }}>CLOSED</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: P.textMuted }}>📍 {distText}</span>
                        <span style={{ fontSize: 12, color: P.textMuted }}>⚡ {etaText}</span>
                        <span style={{ fontSize: 12, color: "#F59E0B" }}>⭐ {seller?.rating?.toFixed(1) || "4.5"}</span>
                        {seller?.businessHours && (
                            <span style={{ fontSize: 12, color: P.textMuted }}>
                                🕐 {seller.businessHours.open}–{seller.businessHours.close}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 20, color: P.primary }}>₹{product.sellingPrice}</div>
                    {product.mrp > product.sellingPrice && (
                        <div style={{ fontSize: 12, color: P.textMuted, textDecoration: "line-through" }}>₹{product.mrp}</div>
                    )}
                    {!inRadius && (
                        <div style={{ fontSize: 10, color: P.danger, fontWeight: 600, marginTop: 2 }}>
                            Out of delivery range
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, color: P.textMuted }}>
                    {product.stock > 0 ? `✅ ${product.stock} in stock` : "❌ Out of stock"}
                </div>
                <button
                    onClick={() => onAdd(product)}
                    disabled={product.stock === 0 || seller?.isOpen === false}
                    style={{
                        background: isAdded ? P.success : P.primary,
                        color: "white", border: "none", borderRadius: 10,
                        padding: "8px 20px", fontWeight: 700, fontSize: 13,
                        cursor: product.stock === 0 ? "not-allowed" : "pointer",
                        opacity: product.stock === 0 ? 0.5 : 1,
                        transition: "all 0.2s",
                    }}
                >
                    {isAdded ? "✓ Added" : "Add to Cart"}
                </button>
            </div>
        </div>
    );
}

export function MultiSellerSheet({ productName, variants, onClose }) {
    const [sort, setSort] = useState("distance");
    const [addedId, setAddedId] = useState(null);
    const { addToCart, cart } = useStore();

    const sorted = [...variants].sort((a, b) => {
        switch (sort) {
            case "price": return a.sellingPrice - b.sellingPrice;
            case "rating": return (b.seller?.rating || 0) - (a.seller?.rating || 0);
            case "delivery_time": return (a.estimatedDeliveryMin || 30) - (b.estimatedDeliveryMin || 30);
            case "distance":
            default: return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
        }
    });

    const handleAdd = (product) => {
        addToCart(product.id || product._id, product);
        setAddedId(product.id || product._id);
        setTimeout(() => { setAddedId(null); onClose(); }, 800);
    };

    const content = (
        <div style={{
            position: "fixed", inset: 0, zIndex: 20000,
            background: "rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", justifyContent: "flex-end",
        }} onClick={onClose}>
            <div style={{
                background: P.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                maxHeight: "80vh", display: "flex", flexDirection: "column",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
            }} onClick={e => e.stopPropagation()}>
                {/* Handle */}
                <div style={{ width: 40, height: 4, background: P.border, borderRadius: 4, margin: "16px auto 0" }} />

                {/* Header */}
                <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{productName}</div>
                        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: P.textMuted }}>✕</button>
                    </div>
                    <div style={{ fontSize: 13, color: P.textMuted }}>
                        {variants.length} seller{variants.length !== 1 ? "s" : ""} available
                    </div>
                </div>

                {/* Sort Tabs */}
                <div style={{ display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto", flexShrink: 0 }}>
                    {SORT_OPTIONS.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setSort(opt.key)}
                            style={{
                                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                                border: `1.5px solid ${sort === opt.key ? P.primary : P.border}`,
                                background: sort === opt.key ? P.primary + "18" : "transparent",
                                color: sort === opt.key ? P.primary : P.text,
                                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Seller List */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
                    {sorted.map(p => (
                        <SellerCard
                            key={p._id || p.id}
                            product={p}
                            onAdd={handleAdd}
                            isAdded={addedId === (p.id || p._id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(content, document.getElementById("portal-root") || document.body);
}
