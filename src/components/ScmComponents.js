import React, { memo, useRef } from "react";
import { T } from "../theme/theme";
import { clamp } from "../utils/helpers";

export const Sparkline = memo(({ data, color = T.gold, width = 80, height = 32 }) => {
    const uid = useRef(`sg${Math.random().toString(36).slice(2, 8)}`).current;
    if (!data || data.length < 2) return null;
    const mx = Math.max(...data), mn = Math.min(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - mn) / rng) * (height - 2) + 1}`).join(" ");
    return (
        <svg width={width} height={height} style={{ overflow: "visible" }}>
            <defs>
                <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${uid})`} />
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
});

export const DonutRing = memo(({ pct, color, size = 72, sw = 8, label }) => {
    const safePct = clamp(Math.round(pct || 0));
    const r = (size - sw) / 2, circ = 2 * Math.PI * r;
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" }}>
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.border} strokeWidth={sw} />
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
                        strokeDasharray={`${(safePct / 100) * circ} ${circ}`} strokeLinecap="round"
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        style={{ transition: "stroke-dasharray 1.2s ease" }} />
                </svg>
                <div style={{ textAlign: "center", zIndex: 1 }}>
                    <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, fontSize: size > 80 ? 16 : 13, color }}>{safePct}%</div>
                </div>
            </div>
            {label && <div style={{ fontSize: 10, color: T.textSub, fontWeight: 600 }}>{label}</div>}
        </div>
    );
});

export const Stars = memo(({ rating }) => (
    <span className="star-rating">
        {"★".repeat(Math.floor(rating || 0))}{"☆".repeat(5 - Math.floor(rating || 0))}
        <span style={{ color: T.textSub, fontFamily: "Sora", fontSize: 10, marginLeft: 4 }}>{rating}</span>
    </span>
));

export const TierBadge = memo(({ tier }) => {
    const m = { manufacturer: { label: "Manufacturer", cls: "badge-gold" }, wholesaler: { label: "Wholesaler", cls: "badge-sapphire" }, distributor: { label: "Distributor", cls: "badge-emerald" } };
    const { label = "Unknown", cls = "badge-muted" } = m[tier] || {};
    return <span className={`badge ${cls}`}>{label}</span>;
});

export const StatusBadge = memo(({ status }) => {
    const m = {
        delivered: { label: "✓ Delivered", cls: "badge-emerald" },
        in_transit: { label: "↑ Transit", cls: "badge-sapphire" },
        pending: { label: "⏳ Pending", cls: "badge-amber" },
        delayed: { label: "⚠ Delayed", cls: "badge-coral" },
        active: { label: "● Active", cls: "badge-emerald" },
        review: { label: "◎ Review", cls: "badge-amber" },
        paid: { label: "✓ Paid", cls: "badge-emerald" },
        out: { label: "✕ Sold Out", cls: "badge-coral" },
        low: { label: "⚠ Low Stock", cls: "badge-amber" },
        ok: { label: "✓ In Stock", cls: "badge-emerald" },
    };
    const { label = status, cls = "badge-muted" } = m[status] || {};
    return <span className={`badge ${cls}`}>{label}</span>;
});

export const SupplierAvatar = memo(({ name, type, size = 38 }) => {
    const colors = { manufacturer: [T.gold, T.goldDim], wholesaler: [T.sapphire, "#2563EB"], distributor: [T.emerald, "#059669"] };
    const [c1, c2] = colors[type] || [T.textSub, T.textDim];
    return (
        <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg,${c1},${c2})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * .38, color: type === "wholesaler" ? "white" : T.bg, boxShadow: `0 2px 8px ${c1}44` }}>
            {(name || "?").split(" ").map(w => w[0]).slice(0, 2).join("")}
        </div>
    );
});

export const ScmToast = memo(({ msg, type, onClose }) => (
    <div className="scm-toast" style={{ borderColor: type === "gold" ? `${T.gold}55` : `${T.emerald}55` }}>
        <span style={{ fontSize: 18 }}>{type === "gold" ? "✨" : "✅"}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{msg}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 16 }}>✕</button>
    </div>
));
