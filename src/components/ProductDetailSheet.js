import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { P } from "../theme/theme";
import { useStore } from "../context/GlobalStore";
import { useAuth } from "../auth/AuthContext";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function StarRow({ value, onChange, size = 28, readonly = false }) {
    const [hover, setHover] = useState(0);
    return (
        <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map(s => (
                <span
                    key={s}
                    style={{
                        fontSize: size, cursor: readonly ? "default" : "pointer",
                        color: s <= (hover || value) ? "#FBBF24" : P.border,
                        transition: "color .15s, transform .15s",
                        transform: !readonly && s <= (hover || value) ? "scale(1.15)" : "scale(1)",
                        lineHeight: 1,
                    }}
                    onMouseEnter={() => !readonly && setHover(s)}
                    onMouseLeave={() => !readonly && setHover(0)}
                    onClick={() => !readonly && onChange && onChange(s)}
                >★</span>
            ))}
        </div>
    );
}

function RatingBar({ label, pct, color = "#FBBF24" }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: P.textMuted, minWidth: 18, textAlign: "right" }}>{label}★</span>
            <div style={{ flex: 1, height: 6, background: P.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width .6s ease" }} />
            </div>
            <span style={{ color: P.textMuted, minWidth: 28 }}>{Math.round(pct)}%</span>
        </div>
    );
}

function Avatar({ name, url, size = 36 }) {
    const initials = (name || "U").slice(0, 2).toUpperCase();
    const colors = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6"];
    const bg = colors[initials.charCodeAt(0) % colors.length];
    if (url && url.startsWith("http")) {
        return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
    }
    return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>
            {initials}
        </div>
    );
}

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ProductDetailSheet({ product: p, onClose }) {
    const { cart, addToCart, removeFromCart, showToast } = useStore();
    const { user, token } = useAuth();
    const overlayRef = useRef(null);
    const qty = cart[p.id || p._id] || 0;

    // ── Image gallery ─────────────────────────────────────────────────────────
    const images = (p.images && p.images.length > 0) ? p.images : (p.imageUrl ? [p.imageUrl] : []);
    const [imgIdx, setImgIdx] = useState(0);

    // ── Reviews state ─────────────────────────────────────────────────────────
    const [reviews, setReviews] = useState([]);
    const [rating, setRating] = useState(p.rating || 0);
    const [reviewCount, setReviewCount] = useState(p.reviewCount || 0);
    const [ratingDist, setRatingDist] = useState(p.ratingDist || { one: 0, two: 0, three: 0, four: 0, five: 0 });
    const [reviewsLoaded, setReviewsLoaded] = useState(false);
    const [activeSection, setActiveSection] = useState("info"); // "info" | "reviews"

    // ── My rating widget state ─────────────────────────────────────────────────
    const [myRating, setMyRating] = useState(0);
    const [myComment, setMyComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // ── Scroll lock ───────────────────────────────────────────────────────────
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev || ""; };
    }, []);

    // ── Close on Escape ───────────────────────────────────────────────────────
    useEffect(() => {
        const h = e => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    // ── Load reviews when tab opened ──────────────────────────────────────────
    const loadReviews = useCallback(async () => {
        if (reviewsLoaded) return;
        try {
            const pid = p._id || p.id;
            if (!pid || pid.startsWith("LOC-")) return; // local product, no backend ID
            const res = await fetch(`${API}/products/${pid}/reviews?limit=20`);
            const data = await res.json();
            if (data.ok) {
                setReviews(data.reviews || []);
                if (data.rating) setRating(data.rating);
                if (data.reviewCount !== undefined) setReviewCount(data.reviewCount);
                if (data.ratingDist) setRatingDist(data.ratingDist);
            }
        } catch { /* silent */ }
        setReviewsLoaded(true);
    }, [p._id, p.id, reviewsLoaded]);

    useEffect(() => {
        if (activeSection === "reviews") loadReviews();
    }, [activeSection, loadReviews]);

    // ── Submit rating ─────────────────────────────────────────────────────────
    const submitRating = useCallback(async () => {
        if (!myRating) return;
        if (!user || !token) { showToast("Please log in to rate products", "alert"); return; }
        const pid = p._id || p.id;
        if (!pid || pid.startsWith("LOC-")) {
            showToast("Rating available for backend products only", "alert");
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch(`${API}/products/${pid}/rate`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ rating: myRating, comment: myComment }),
            });
            const data = await res.json();
            if (data.ok) {
                setRating(data.rating);
                setReviewCount(data.reviewCount);
                setRatingDist(data.ratingDist);
                setSubmitted(true);
                setReviewsLoaded(false); // force reload
                showToast("Thanks for your review! 🌟", "success");
            } else {
                showToast(data.msg || "Could not submit review", "alert");
            }
        } catch {
            showToast("Network error. Please try again.", "alert");
        }
        setSubmitting(false);
    }, [myRating, myComment, user, token, p._id, p.id, showToast]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const discountPct = p.mrp > p.sellingPrice ? Math.round((1 - p.sellingPrice / p.mrp) * 100) : 0;
    const stockStatus = p.stock === 0 ? "out" : p.stock < 10 ? "low" : "in";
    const stockLabel = p.stock === 0 ? "Out of Stock" : p.stock < 10 ? `Only ${p.stock} left` : "In Stock";

    // Rating distribution as percentages
    const distVals = [
        ratingDist.five || 0, ratingDist.four || 0,
        ratingDist.three || 0, ratingDist.two || 0, ratingDist.one || 0,
    ];
    const distTotal = distVals.reduce((a, b) => a + b, 0) || 1;
    const distPcts = distVals.map(v => (v / distTotal) * 100);

    const content = (
        <div
            ref={overlayRef}
            onClick={e => { if (e.target === overlayRef.current) onClose(); }}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
                overscrollBehavior: "contain",
            }}
        >
            <div style={{
                background: P.bg, maxHeight: "94vh", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                display: "flex", flexDirection: "column", overflow: "hidden",
                boxShadow: "0 -16px 60px rgba(0,0,0,0.4)",
            }}>

                {/* ── Image Hero ── */}
                <div style={{ position: "relative", background: P.surface, flexShrink: 0 }}>
                    {/* Close chip */}
                    <button
                        onClick={onClose}
                        style={{
                            position: "absolute", top: 14, left: 14, zIndex: 10,
                            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)",
                            border: "none", color: "#fff", borderRadius: 8,
                            padding: "6px 10px", fontSize: 14, cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 4,
                        }}
                        aria-label="Close"
                    >← Back</button>

                    {/* Discount badge */}
                    {discountPct > 0 && (
                        <div style={{
                            position: "absolute", top: 14, right: 14, zIndex: 10,
                            background: "#EF4444", color: "#fff", borderRadius: 8,
                            padding: "5px 10px", fontWeight: 800, fontSize: 13,
                        }}>{discountPct}% OFF</div>
                    )}

                    {/* Image / Emoji */}
                    <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                        {images.length > 0 ? (
                            <img
                                key={imgIdx}
                                src={images[imgIdx]}
                                alt={p.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={e => { e.target.style.display = "none"; }}
                            />
                        ) : (
                            <span style={{ fontSize: 100, opacity: 0.85 }}>{p.emoji}</span>
                        )}
                    </div>

                    {/* Thumbnail dots / mini-gallery */}
                    {images.length > 1 && (
                        <div style={{ display: "flex", justifyContent: "center", gap: 6, paddingBottom: 12, paddingTop: 8 }}>
                            {images.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => setImgIdx(i)}
                                    style={{
                                        width: 40, height: 40, borderRadius: 8, overflow: "hidden",
                                        border: `2px solid ${i === imgIdx ? P.primary : "transparent"}`,
                                        padding: 0, background: "none", cursor: "pointer",
                                    }}
                                >
                                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Scrollable body ── */}
                <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>

                    {/* Product header */}
                    <div style={{ padding: "20px 20px 0" }}>
                        {/* Tags row */}
                        {(p.tags?.length > 0) && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                                {p.tags.map(tag => (
                                    <span key={tag} style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: P.primary + "20", color: P.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <h2 style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.3, margin: 0 }}>{p.name}</h2>
                        <div style={{ fontSize: 13, color: P.textMuted, marginTop: 4 }}>
                            {p.category}
                            {p.unit && ` · ${p.unit}`}
                            {p.weight && ` · ${p.weight}`}
                        </div>

                        {/* Price row */}
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
                            <span style={{ fontWeight: 900, fontSize: 28, color: P.text }}>₹{p.sellingPrice}</span>
                            {p.mrp > p.sellingPrice && (
                                <span style={{ fontSize: 15, color: P.textMuted, textDecoration: "line-through" }}>₹{p.mrp}</span>
                            )}
                            {discountPct > 0 && (
                                <span style={{ fontSize: 13, color: "#10B981", fontWeight: 700, background: "#10B98122", padding: "2px 8px", borderRadius: 6 }}>
                                    Save ₹{p.mrp - p.sellingPrice}
                                </span>
                            )}
                        </div>

                        {/* Rating summary row — Blinkit style */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingBottom: 16, borderBottom: `1px solid ${P.border}` }}>
                            <div
                                onClick={() => setActiveSection("reviews")}
                                style={{
                                    display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                                    background: P.surface, borderRadius: 10, padding: "6px 12px",
                                }}
                            >
                                <span style={{ color: "#FBBF24", fontSize: 16 }}>★</span>
                                <span style={{ fontWeight: 800, fontSize: 15 }}>{rating ? rating.toFixed(1) : "—"}</span>
                                {reviewCount > 0 && (
                                    <span style={{ fontSize: 12, color: P.textMuted }}>· {reviewCount >= 1000 ? `${(reviewCount / 1000).toFixed(1)}k` : reviewCount} ratings</span>
                                )}
                            </div>
                            <span className={`badge-stock ${stockStatus}`} style={{ fontSize: 12, fontWeight: 600 }}>
                                {stockLabel}
                            </span>
                            <span style={{ fontSize: 12, color: P.textMuted }}>🚀 {p.deliveryMinutes || 20} min</span>
                        </div>
                    </div>

                    {/* ── Section tabs ── */}
                    <div style={{ display: "flex", borderBottom: `1px solid ${P.border}`, padding: "0 20px" }}>
                        {[["info", "Details"], ["reviews", `Reviews${reviewCount > 0 ? ` (${reviewCount})` : ""}`]].map(([k, label]) => (
                            <button
                                key={k}
                                onClick={() => setActiveSection(k)}
                                style={{
                                    flex: 1, padding: "14px 0", fontSize: 13, fontWeight: 700,
                                    background: "none", border: "none", cursor: "pointer",
                                    color: activeSection === k ? P.primary : P.textMuted,
                                    borderBottom: `2px solid ${activeSection === k ? P.primary : "transparent"}`,
                                    transition: "color .15s",
                                }}
                            >{label}</button>
                        ))}
                    </div>

                    {/* ── Details Tab ── */}
                    {activeSection === "info" && (
                        <div style={{ padding: "18px 20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

                            {/* Trust badges */}
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, background: "#10B98122", color: "#10B981", padding: "5px 12px", borderRadius: 20, fontWeight: 600 }}>
                                    🌿 {p.freshness || "Fresh"}
                                </span>
                                <span style={{ fontSize: 12, background: P.primary + "22", color: P.primary, padding: "5px 12px", borderRadius: 20, fontWeight: 600 }}>
                                    ✓ Quality Assured
                                </span>
                                {p.expiryInfo && (
                                    <span style={{ fontSize: 12, background: P.border, color: P.textMuted, padding: "5px 12px", borderRadius: 20, fontWeight: 600 }}>
                                        📅 {p.expiryInfo}
                                    </span>
                                )}
                            </div>

                            {/* Highlights */}
                            {p.highlights?.length > 0 && (
                                <div style={{ background: P.surface, borderRadius: 14, padding: "14px 16px" }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: P.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Highlights</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {p.highlights.map((h, i) => (
                                            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: P.text }}>
                                                <span style={{ color: "#10B981" }}>✓</span>
                                                <span>{h}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* About */}
                            <div style={{ background: P.surface, borderRadius: 14, padding: "14px 16px" }}>
                                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: P.textMuted, textTransform: "uppercase", marginBottom: 8 }}>About</div>
                                <p style={{ fontSize: 13, lineHeight: 1.8, color: P.text, margin: 0 }}>
                                    {p.description || `Fresh ${p.name} from ${p.supplier || "trusted local sellers"}. Quality assured and carefully packed for delivery.`}
                                </p>
                            </div>

                            {/* Nutritional / additional info */}
                            {p.nutritionInfo && (
                                <div style={{ background: P.surface, borderRadius: 14, padding: "14px 16px" }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: P.textMuted, textTransform: "uppercase", marginBottom: 8 }}>Nutritional Info</div>
                                    <p style={{ fontSize: 13, lineHeight: 1.8, color: P.text, margin: 0 }}>{p.nutritionInfo}</p>
                                </div>
                            )}

                            {/* Store info */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, background: P.surface, borderRadius: 14, padding: "14px 16px" }}>
                                <div style={{ width: 44, height: 44, borderRadius: 12, background: P.primary + "22", border: `1px solid ${P.primary}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏪</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.storeName || p.sellerName || "NearMart Partner Store"}</div>
                                    <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>
                                        {p.sellerLocation || p.storeLocation || "Local seller"} · ⭐ {p.sellerRating || p.rating || "—"}
                                    </div>
                                </div>
                                <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700, background: "#10B98122", padding: "4px 10px", borderRadius: 8 }}>Open</span>
                            </div>

                            {/* Manufacturer */}
                            {p.manufacturer && (
                                <div style={{ fontSize: 12, color: P.textMuted, padding: "0 4px" }}>
                                    Manufactured by: <strong>{p.manufacturer}</strong>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Reviews Tab ── */}
                    {activeSection === "reviews" && (
                        <div style={{ padding: "18px 20px 100px", display: "flex", flexDirection: "column", gap: 20 }}>

                            {/* Rating summary */}
                            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", background: P.surface, borderRadius: 16, padding: 18 }}>
                                {/* Big score */}
                                <div style={{ textAlign: "center", minWidth: 72 }}>
                                    <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>{rating ? rating.toFixed(1) : "—"}</div>
                                    <StarRow value={Math.round(rating)} readonly size={16} />
                                    <div style={{ fontSize: 11, color: P.textMuted, marginTop: 4 }}>{reviewCount} ratings</div>
                                </div>
                                {/* Distribution bars */}
                                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                                    {[5, 4, 3, 2, 1].map((star, i) => (
                                        <RatingBar key={star} label={star} pct={distPcts[i]} />
                                    ))}
                                </div>
                            </div>

                            {/* Rate this product widget */}
                            {user?.role === "customer" && !submitted && (
                                <div style={{ background: P.surface, borderRadius: 16, padding: 18 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Rate this product</div>
                                    <StarRow value={myRating} onChange={setMyRating} size={32} />
                                    {myRating > 0 && (
                                        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                                            <textarea
                                                placeholder="Share your experience (optional)..."
                                                value={myComment}
                                                onChange={e => setMyComment(e.target.value)}
                                                maxLength={500}
                                                rows={3}
                                                style={{
                                                    width: "100%", boxSizing: "border-box",
                                                    padding: "12px 14px", borderRadius: 12,
                                                    border: `1px solid ${P.border}`, background: P.bg,
                                                    color: P.text, fontSize: 13, resize: "none",
                                                    fontFamily: "inherit", outline: "none",
                                                }}
                                            />
                                            <button
                                                className="p-btn p-btn-primary"
                                                onClick={submitRating}
                                                disabled={submitting}
                                                style={{ minHeight: 46, fontSize: 14 }}
                                            >
                                                {submitting ? "Submitting..." : "Submit Review ✓"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {submitted && (
                                <div style={{ background: "#10B98122", border: "1px solid #10B98144", borderRadius: 12, padding: "14px 18px", color: "#10B981", fontWeight: 600, fontSize: 14 }}>
                                    ✅ Thanks for your review! It helps other shoppers.
                                </div>
                            )}

                            {/* Reviews list */}
                            {reviews.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "40px 0", color: P.textMuted }}>
                                    <div style={{ fontSize: 48, marginBottom: 10 }}>💬</div>
                                    <div style={{ fontWeight: 600 }}>No reviews yet</div>
                                    <div style={{ fontSize: 13, marginTop: 6 }}>Be the first to review this product!</div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                    {reviews.map((r, i) => (
                                        <div key={i} style={{ background: P.surface, borderRadius: 14, padding: "14px 16px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                                <Avatar name={r.userName} url={r.userAvatar} size={36} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.userName}</div>
                                                    <div style={{ fontSize: 11, color: P.textMuted }}>{timeAgo(r.createdAt)}</div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#FBBF2422", padding: "4px 10px", borderRadius: 8 }}>
                                                    <span style={{ color: "#FBBF24", fontSize: 14 }}>★</span>
                                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{r.rating}</span>
                                                </div>
                                            </div>
                                            {r.comment && (
                                                <p style={{ fontSize: 13, lineHeight: 1.7, color: P.text, margin: 0 }}>{r.comment}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Sticky Add to Cart footer ── */}
                <div style={{
                    padding: "14px 20px",
                    background: P.card, borderTop: `1px solid ${P.border}`,
                    display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
                }}>
                    {p.stock === 0 ? (
                        <button className="p-btn w-100" disabled style={{ opacity: 0.5, fontSize: 15, minHeight: 52 }}>
                            Out of Stock
                        </button>
                    ) : qty > 0 ? (
                        <>
                            <div className="qty-stepper" style={{ flexShrink: 0 }}>
                                <button onClick={() => removeFromCart(p.id || p._id)} aria-label="Remove">−</button>
                                <span className="qty-val">{qty}</span>
                                <button onClick={() => addToCart(p.id || p._id)} aria-label="Add">+</button>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 900, fontSize: 20 }}>₹{p.sellingPrice * qty}</div>
                                <div style={{ fontSize: 11, color: P.textMuted }}>{qty} × ₹{p.sellingPrice}</div>
                            </div>
                            <button className="p-btn p-btn-primary" style={{ minHeight: 52, minWidth: 120, fontSize: 15 }} onClick={onClose}>
                                Go to Cart →
                            </button>
                        </>
                    ) : (
                        <>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 900, fontSize: 22 }}>₹{p.sellingPrice}</div>
                                {p.mrp > p.sellingPrice && (
                                    <div style={{ fontSize: 12, textDecoration: "line-through", color: P.textMuted }}>MRP ₹{p.mrp}</div>
                                )}
                            </div>
                            <button
                                className="p-btn p-btn-primary"
                                style={{ minHeight: 52, minWidth: 140, fontSize: 15, fontWeight: 700 }}
                                onClick={() => { addToCart(p.id || p._id); showToast(`${p.name} added!`, "success", "🛒"); }}
                            >
                                Add to Cart +
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(content, document.body);
}
