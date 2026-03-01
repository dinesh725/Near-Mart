import React, { memo } from "react";
import { P } from "../theme/theme";
import { clamp } from "../utils/helpers";

export const PSparkline = memo(({ data, color, width = 60, height = 24 }) => {
    if (!data || data.length < 2) return null;
    const mx = Math.max(...data), mn = Math.min(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - mn) / rng) * (height - 2) + 1}`).join(" ");
    return (
        <svg width={width} height={height} style={{ overflow: "visible" }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
});

export const PDonut = memo(({ pct, color, size = 64, sw = 6, label }) => {
    const safePct = clamp(Math.round(pct || 0));
    const r = (size - sw) / 2, circ = 2 * Math.PI * r;
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute" }}>
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.border} strokeWidth={sw} />
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
                        strokeDasharray={`${(safePct / 100) * circ} ${circ}`} strokeLinecap="round"
                        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray 1s ease" }} />
                </svg>
                <div style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, fontSize: 13, color, zIndex: 1 }}>{safePct}%</div>
            </div>
            {label && <div style={{ fontSize: 10, color: P.textMuted, fontWeight: 600 }}>{label}</div>}
        </div>
    );
});

export const PBarChart = memo(({ data, color, height = 40 }) => {
    if (!data || !data.length) return null;
    const mx = Math.max(...data) || 1;
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, width: "100%" }}>
            {data.map((v, i) => (
                <div key={i} style={{ flex: 1, height: `${(v / mx) * 100}%`, background: color, borderRadius: "3px 3px 0 0", opacity: i === data.length - 1 ? 1 : 0.5 }} />
            ))}
        </div>
    );
});

export const MapView = memo(({ markers }) => (
    <div className="map-placeholder" style={{ height: 200, width: "100%" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(circle at 50% 50%, ${P.primary}11 0%, transparent 60%)` }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(${P.border}22 1px, transparent 1px), linear-gradient(90deg, ${P.border}22 1px, transparent 1px)`, backgroundSize: "20px 20px" }} />
        {markers.map((m, i) => (
            <div key={i} className="map-dot" style={{ top: `${m.y}%`, left: `${m.x}%`, background: m.color || P.primary }} />
        ))}
    </div>
));
