import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

// Local theme reference from theme.js
const P = {
    primary: "#3B6FFF",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    accent: "#6366F1",
    purple: "#8B5CF6",
    background: "#060A12",
    surface: "#111827",
    card: "#1F2937",
    text: "#F9FAFB",
    textMuted: "#9CA3AF"
};

const triggerHaptic = async () => {
    try {
        if (window.Capacitor?.isNativePlatform?.()) {
            const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
            await Haptics.impact({ style: ImpactStyle.Light });
        }
    } catch { /* ignore */ }
};

export function MobileIntro({ onComplete }) {
    const [phase, setPhase] = useState("boot"); // boot -> carousel
    const [slideIndex, setSlideIndex] = useState(0);

    useEffect(() => {
        // Boot up sequence: 3 seconds total
        const t = setTimeout(() => {
            setPhase("carousel");
        }, 3200);
        return () => clearTimeout(t);
    }, []);

    // Phase 1: Cinematic Boot
    if (phase === "boot") {
        return (
            <div style={{
                position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
                background: "#000000", display: "flex", justifyContent: "center", alignItems: "center",
                overflow: "hidden", zIndex: 9999
            }}>
                {/* Expanding Grid Lines */}
                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 4, 8], opacity: [0, 0.4, 0] }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    style={{
                        position: "absolute", width: 50, height: 50, borderRadius: "50%",
                        border: `1px solid ${P.primary}`, boxShadow: `0 0 40px ${P.primary}`
                    }}
                />
                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 3, 6], opacity: [0, 0.3, 0] }}
                    transition={{ duration: 2, ease: "easeOut", delay: 0.3 }}
                    style={{
                        position: "absolute", width: 50, height: 50, borderRadius: "50%",
                        border: `1px solid ${P.purple}`, boxShadow: `0 0 40px ${P.purple}`
                    }}
                />
                
                {/* Morphing into Logo */}
                <motion.div
                    initial={{ scale: 0.1, opacity: 0, filter: "brightness(5)" }}
                    animate={{ 
                        scale: [0.1, 1.2, 1], 
                        opacity: [0, 1, 1],
                        filter: ["brightness(5) drop-shadow(0 0 40px #3B6FFF)", "brightness(2) drop-shadow(0 0 20px #3B6FFF)", "brightness(1) drop-shadow(0 0 10px rgba(59,111,255,0.5))"]
                    }}
                    transition={{ duration: 1.5, delay: 1, type: "spring", bounce: 0.4 }}
                    style={{ position: "relative", zIndex: 10 }}
                >
                    <img src="/logo-full.png" alt="NearMart" style={{ height: 48, objectFit: "contain" }} />
                </motion.div>
                
                {/* Logo Glides Up Transition (handled by AnimatePresence exiting, or just transitioning states) */}
            </div>
        );
    }

    // Phase 2 & 3: Carousel and Role Select
    // We treat Role Select as slide index 3
    const slides = [
        {
            title: "Your Neighborhood, Digitized.",
            visual: <Slide1Visual />
        },
        {
            title: "One Cart. Infinite Stores.",
            visual: <Slide2Visual />
        },
        {
            title: "Lightning Fast. AI Routed.",
            visual: <Slide3Visual />
        },
        {
            title: "How will you use NearMart?",
            visual: <RoleSelection onSelect={onComplete} />
        }
    ];

    const isLast = slideIndex === 3;

    return (
        <div style={{
            position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
            background: "#060A12", color: "white", overflow: "hidden", zIndex: 9999,
            display: "flex", flexDirection: "column", fontFamily: "'Sora', sans-serif"
        }}>
            <style>
                {`
                    ::-webkit-scrollbar { display: none; }
                    * { -ms-overflow-style: none; scrollbar-width: none; user-select: none; -webkit-user-select: none; }
                `}
            </style>

            {/* Parallax Background */}
            <motion.div
                animate={{ 
                    x: isLast ? "-30vw" : `-${slideIndex * 5}vw`,
                    scale: isLast ? 1.2 : 1
                }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
                style={{
                    position: "absolute", top: "-20vh", left: "-20vw", width: "150vw", height: "150vh",
                    background: `radial-gradient(circle at 30% 30%, ${P.primary}20 0%, transparent 60%), radial-gradient(circle at 70% 70%, ${P.purple}15 0%, transparent 60%)`,
                    pointerEvents: "none", zIndex: 0
                }}
            />

            {/* Gliding Logo Header */}
            <motion.div
                initial={{ y: 200, scale: 1.5, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 1, type: "spring", bounce: 0.3 }}
                style={{
                    position: "absolute", top: 60, left: 0, width: "100%", display: "flex", justifyContent: "center", zIndex: 20
                }}
            >
                <img src="/logo-full.png" alt="NearMart" style={{ height: 28, filter: "drop-shadow(0 0 10px rgba(255,255,255,0.2))" }} />
            </motion.div>

            {/* Swiper Content */}
            <div style={{ flex: 1, position: "relative", zIndex: 10, marginTop: 120 }}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={slideIndex}
                        initial={{ opacity: 0, x: 50, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -50, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        drag={isLast ? false : "x"}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={(e, { offset, velocity }) => {
                            if (isLast) return;
                            if (offset.x < -50 || velocity.x < -500) {
                                triggerHaptic();
                                setSlideIndex(Math.min(slideIndex + 1, 3));
                            } else if (offset.x > 50 || velocity.x > 500) {
                                triggerHaptic();
                                setSlideIndex(Math.max(slideIndex - 1, 0));
                            }
                        }}
                        style={{ position: "absolute", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
                    >
                        {/* Visual Container */}
                        <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px box-sizing: border-box" }}>
                            {slides[slideIndex].visual}
                        </div>

                        {/* Title Copy */}
                        <div style={{ height: 140, width: "100%", textAlign: "center", padding: "0 32px", boxSizing: "border-box" }}>
                            <motion.h2 
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                style={{ fontSize: isLast ? 24 : 32, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-1px", marginBottom: 16 }}
                            >
                                {slides[slideIndex].title}
                            </motion.h2>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Footer & Progress Indicators */}
            <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", padding: "0 24px 48px", boxSizing: "border-box", zIndex: 20 }}>
                
                {/* Progress Capsules */}
                {!isLast && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40 }}>
                        {[0, 1, 2].map(i => (
                            <motion.div
                                key={i}
                                layout
                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                style={{
                                    height: 4, borderRadius: 2,
                                    width: slideIndex === i ? 24 : 8,
                                    background: slideIndex === i ? "white" : "rgba(255,255,255,0.2)"
                                }}
                            />
                        ))}
                    </div>
                )}

                <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                    Everything near you. Delivered smarter.
                </p>
            </div>

            {/* Absolute continue button for early slides (optional, mobile users swipe) */}
            {!isLast && (
                <button 
                    onClick={() => { triggerHaptic(); setSlideIndex(prev => prev + 1); }} 
                    style={{ position: "absolute", right: 32, bottom: 40, width: 44, height: 44, borderRadius: 22, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 30, backdropFilter: "blur(10px)" }}
                >
                    →
                </button>
            )}
        </div>
    );
}

// ── Slide Visuals ─────────────────────────────────────────────────────────────

function Slide1Visual() {
    return (
        <div style={{ position: "relative", width: 280, height: 280, display: "flex", justifyContent: "center", alignItems: "center" }}>
            {/* Grid */}
            <div style={{ position: "absolute", width: "100%", height: "100%", background: "repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(59,111,255,0.1) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(59,111,255,0.1) 20px)", transform: "perspective(400px) rotateX(60deg) scale(1.5)", filter: "drop-shadow(0 0 20px rgba(59,111,255,0.2))", opacity: 0.8 }} />
            
            {/* Map Pin Dropping */}
            <motion.div 
                initial={{ y: -100, opacity: 0, scale: 0 }}
                animate={{ y: [0, -20, 0], opacity: 1, scale: 1 }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{ position: "absolute", zIndex: 10, fontSize: 64, filter: `drop-shadow(0 20px 20px ${P.primary}60)` }}
            >
                📍
            </motion.div>

            {/* Glowing Rings */}
            <motion.div
                animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                style={{ position: "absolute", width: 60, height: 60, border: `2px solid ${P.primary}`, borderRadius: "50%", transform: "perspective(400px) rotateX(60deg)" }}
            />
        </div>
    );
}

function Slide2Visual() {
    return (
        <div style={{ position: "relative", width: 300, height: 300 }}>
            <motion.div 
                animate={{ y: [-10, 10, -10], x: [10, -10, 10] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ position: "absolute", top: 20, left: 20, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", padding: 16, borderRadius: 16, border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: 12, boxShadow: `0 10px 30px rgba(0,0,0,0.5)` }}
            >
                <div style={{ fontSize: 24 }}>☕</div> <div style={{ height: 6, width: 40, background: "rgba(255,255,255,0.4)", borderRadius: 3 }} />
            </motion.div>
            
            <motion.div 
                animate={{ y: [10, -10, 10], x: [-10, 10, -10] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                style={{ position: "absolute", bottom: 40, right: 20, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", padding: 16, borderRadius: 16, border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: 12, boxShadow: `0 10px 30px rgba(0,0,0,0.5)` }}
            >
                <div style={{ fontSize: 24 }}>🥑</div> <div style={{ height: 6, width: 40, background: "rgba(255,255,255,0.4)", borderRadius: 3 }} />
            </motion.div>

            {/* Central Cart Portal */}
            <motion.div 
                animate={{ scale: [1, 1.05, 1], boxShadow: [`0 0 20px ${P.success}20`, `0 0 40px ${P.success}60`, `0 0 20px ${P.success}20`] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 100, height: 100, borderRadius: 32, background: `linear-gradient(135deg, ${P.success}20, ${P.accent}20)`, border: `1px solid ${P.success}50`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 40, backdropFilter: "blur(12px)" }}
            >
                🛍️
            </motion.div>
        </div>
    );
}

function Slide3Visual() {
    return (
        <div style={{ position: "relative", width: 300, height: 300, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <svg width="240" height="240" style={{ overflow: "visible" }}>
                {/* Route Path */}
                <path d="M 20,200 C 60,180 140,220 180,100 C 200,40 180,20 120,40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" strokeLinecap="round" />
                
                {/* Glowing Progress */}
                <motion.path 
                    d="M 20,200 C 60,180 140,220 180,100 C 200,40 180,20 120,40" fill="none"
                    stroke={P.primary} strokeWidth="6" strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    style={{ filter: `drop-shadow(0 0 8px ${P.primary})` }}
                />

                {/* Nodes */}
                <circle cx="20" cy="200" r="8" fill={P.background} stroke={P.primary} strokeWidth="4" />
                <circle cx="120" cy="40" r="8" fill={P.success} stroke={P.background} strokeWidth="4" style={{ filter: `drop-shadow(0 0 10px ${P.success})` }} />
            </svg>
            <motion.div 
                animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 150, height: 150, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "50%" }}
            />
        </div>
    );
}

// ── Role Selection Gateway ──────────────────────────────────────────────────

function RoleSelection({ onSelect }) {
    const roles = [
        { id: "customer", label: "Shop", sub: "Buy from nearby local stores", icon: "🛍️", color: P.primary },
        { id: "seller", label: "Sell", sub: "Grow your retail inventory", icon: "🏪", color: P.success },
        { id: "vendor", label: "Supply", sub: "Wholesale & B2B distribution", icon: "🏭", color: P.purple },
        { id: "delivery", label: "Deliver", sub: "Drive, deliver, and earn", icon: "🛵", color: P.warning }
    ];

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", padding: "0 24px", boxSizing: "border-box" }}>
            {roles.map((role, i) => (
                <motion.button
                    key={role.id}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.1 * i, type: "spring" }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                        triggerHaptic();
                        onSelect(role.id);
                    }}
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: `1px solid rgba(255,255,255,0.1)`,
                        borderRadius: 24,
                        padding: "24px 16px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                        cursor: "pointer", outline: "none",
                        boxShadow: `0 10px 40px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.02)`,
                        transition: "all 0.3s ease"
                    }}
                    onPointerDown={e => {
                        e.currentTarget.style.boxShadow = `0 5px 20px ${role.color}40, inset 0 0 0 1.5px ${role.color}80`;
                        e.currentTarget.style.background = `${role.color}15`;
                    }}
                    onPointerUp={e => {
                        e.currentTarget.style.boxShadow = `0 10px 40px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.02)`;
                        e.currentTarget.style.background = `rgba(255,255,255,0.03)`;
                    }}
                >
                    <div style={{ fontSize: 36, filter: `drop-shadow(0 4px 12px ${role.color}60)` }}>{role.icon}</div>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ color: "white", fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>{role.label}</div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 4, lineHeight: 1.3 }}>{role.sub}</div>
                    </div>
                </motion.button>
            ))}
        </div>
    );
}
