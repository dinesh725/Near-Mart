import React, { useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { P } from "../theme/theme";
import { useStore } from "../context/GlobalStore";

function Stars({ rating = 0 }) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.3;
    return (
        <span className="badge-rating">
            {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{ color: i < full ? "#FBBF24" : i === full && half ? "#FBBF24" : P.textDim, fontSize: 13 }}>
                    {i < full ? "★" : i === full && half ? "★" : "☆"}
                </span>
            ))}
            <span style={{ marginLeft: 2 }}>{rating}</span>
        </span>
    );
}

export function ProductDetailSheet({ product: p, onClose }) {
    const { cart, addToCart, removeFromCart } = useStore();
    const overlayRef = useRef(null);
    const sheetRef = useRef(null);
    const qty = cart[p.id] || 0;

    // Close on overlay click (not sheet)
    const handleOverlayClick = useCallback((e) => {
        if (e.target === overlayRef.current) onClose();
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const discountPct = p.mrp > p.sellingPrice ? Math.round((1 - p.sellingPrice / p.mrp) * 100) : 0;
    const stockStatus = p.stock === 0 ? "out" : p.stock < 10 ? "low" : "in";
    const stockLabel = p.stock === 0 ? "Out of Stock" : p.stock < 10 ? `Only ${p.stock} left` : "In Stock";

    const content = (
        <div className="detail-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="detail-sheet" ref={sheetRef}>
                {/* Drag handle (mobile) */}
                <div className="ds-handle" />

                {/* Product Image */}
                <div className="ds-img">
                    <button className="ds-close" onClick={onClose} aria-label="Close">✕</button>
                    {discountPct > 0 && <span className="badge-discount">{discountPct}% OFF</span>}
                    {p.stock === 0 && (
                        <div className="badge-out-overlay"><span>Out of Stock</span></div>
                    )}
                    {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} />
                        : <span style={{ fontSize: 80, opacity: 0.9 }}>{p.emoji}</span>
                    }
                </div>

                {/* Body */}
                <div className="ds-body col gap14">
                    {/* Name + Category */}
                    <div>
                        <h2 style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.3, marginBottom: 4 }}>{p.name}</h2>
                        <div style={{ fontSize: 12, color: P.textMuted }}>{p.category} · {p.unit}</div>
                    </div>

                    {/* Rating + Reviews */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Stars rating={p.rating || 4.0} />
                        <span style={{ fontSize: 11, color: P.textMuted }}>({p.reviewCount || 0} reviews)</span>
                        <span className={`badge-stock ${stockStatus}`}>{stockLabel}</span>
                    </div>

                    {/* Pricing */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: 24 }}>₹{p.sellingPrice}</span>
                        {p.mrp > p.sellingPrice && (
                            <span style={{ fontSize: 14, color: P.textMuted, textDecoration: "line-through" }}>₹{p.mrp}</span>
                        )}
                        {discountPct > 0 && (
                            <span style={{ fontSize: 13, color: P.success, fontWeight: 700 }}>Save ₹{p.mrp - p.sellingPrice}</span>
                        )}
                    </div>

                    {/* Description */}
                    <div style={{ background: P.surface, borderRadius: 14, padding: "14px 16px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>About this product</div>
                        <p style={{ fontSize: 13, lineHeight: 1.7, color: P.text, margin: 0 }}>
                            {p.description || `Fresh ${p.name} from ${p.supplier}. Quality assured and carefully packed for delivery.`}
                        </p>
                    </div>

                    {/* Trust badges row */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="badge-eta">🚀 {p.deliveryMinutes || 20} min delivery</span>
                        <span className="badge-freshness">🌿 {p.freshness || "Fresh"}</span>
                        <span className="badge-trust">✓ Trusted Store</span>
                    </div>

                    {/* Store info */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, background: P.surface, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: P.primary + "22", border: `1px solid ${P.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏪</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>Dark Store #412</div>
                            <div style={{ fontSize: 11, color: P.textMuted }}>Bandra West, Mumbai · ⭐ 4.8</div>
                        </div>
                        <span style={{ fontSize: 11, color: P.success, fontWeight: 600 }}>Open</span>
                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="ds-footer">
                    {p.stock === 0 ? (
                        <button className="p-btn p-btn-ghost w-100" disabled style={{ fontSize: 14, opacity: 0.5 }}>
                            Notify When Available
                        </button>
                    ) : (
                        <>
                            {qty > 0 ? (
                                <div className="qty-stepper" style={{ flexShrink: 0 }}>
                                    <button onClick={() => removeFromCart(p.id)} aria-label="Remove one">−</button>
                                    <span className="qty-val">{qty}</span>
                                    <button onClick={() => addToCart(p.id)} aria-label="Add one">+</button>
                                </div>
                            ) : (
                                <button className="p-btn p-btn-primary" style={{ flex: 1, fontSize: 15, minHeight: 48 }} onClick={() => addToCart(p.id)}>
                                    Add to Cart — ₹{p.sellingPrice}
                                </button>
                            )}
                            {qty > 0 && (
                                <div style={{ flex: 1, textAlign: "right" }}>
                                    <div style={{ fontWeight: 800, fontSize: 18 }}>₹{p.sellingPrice * qty}</div>
                                    <div style={{ fontSize: 11, color: P.textMuted }}>{qty} × ₹{p.sellingPrice}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(content, document.body);
}
