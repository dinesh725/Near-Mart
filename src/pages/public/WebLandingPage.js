import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, useTexture, RoundedBox, Text } from "@react-three/drei";
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from "three";

// P theme colors matching your global theme
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
    textMuted: "#9CA3AF",
    textDim: "#6B7280",
    border: "#374151"
};

const FEATURES = [
    { title: "Hyperlocal Discovery", desc: "Find stores, groceries, and services in your exact neighborhood instantly.", icon: "🧭", color: P.primary },
    { title: "Multi-Vendor Cart", desc: "Order from different stores simultaneously and get it all delivered together.", icon: "🛒", color: P.success },
    { title: "Lightning Delivery", desc: "Real-time tracking with dedicated delivery partners for ultra-fast fulfillment.", icon: "⚡", color: P.warning },
    { title: "Secure Payments", desc: "Multiple payment gateways, UPI, wallets, and cash on delivery supported.", icon: "🔒", color: P.accent }
];

const ROLES = [
    { name: "Customers", desc: "Browse local markets, get exclusive deals, and enjoy fast deliveries directly to your door.", icon: "🛍", color: P.primary },
    { name: "Sellers", desc: "Digitize your retail store, manage inventory effortlessly, and expand your reach across the city.", icon: "🏪", color: P.success },
    { name: "Vendors", desc: "Supply wholesale products, manage B2B channels, and distribute directly to our hyperlocal sellers.", icon: "🏭", color: P.purple },
    { name: "Delivery Partners", desc: "Earn independently with flexible hours, transparent payouts, and optimized AI routing.", icon: "🛵", color: P.warning }
];

const STORY_STEPS = [
    { label: "Customer", sub: "Discovers & Orders instantly from local spaces.", color: P.primary, icon: "🛍" },
    { label: "Seller", sub: "Sources supplies & Curates local retail storefront.", color: P.success, icon: "🏷️" },
    { label: "Vendor", sub: "Accepts & Prepares bulk orders via dedicated dashboard.", color: P.purple, icon: "🏪" },
    { label: "Payment", sub: "Settles securely through dual-wallet ledgers.", color: P.accent, icon: "💵" },
    { label: "Delivery", sub: "Picks up & Routes using AI navigation.", color: P.warning, icon: "🛵" }
];

// ── Floating Product Ecosystem Visualization ──────────────────────────────────────────
function EcosystemVisualization() {
    const radius = 180;
    const size = 500;
    const center = size / 2;

    const nodes = [
        { id: 1, label: "Customer Ordering", icon: "🛍️", color: P.primary, angle: 0 },
        { id: 2, label: "Seller Storefront", icon: "🏷️", color: P.success, angle: Math.PI * 0.4 },
        { id: 3, label: "Vendor Dashboard", icon: "🏪", color: P.purple, angle: Math.PI * 0.8 },
        { id: 4, label: "Delivery Routing", icon: "🛵", color: P.warning, angle: Math.PI * 1.2 },
        { id: 5, label: "Secure Payments", icon: "💵", color: P.accent, angle: Math.PI * 1.6 },
    ];

    const orbitDuration = 45;

    return (
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ position: "relative", width: size, height: size, transform: "scale(min(1, 100vw / 600))" }}>
                
                {/* Background Glows */}
                <div style={{ position: "absolute", top: center, left: center, transform: "translate(-50%, -50%)", width: 400, height: 400, background: `radial-gradient(circle, ${P.primary}30 0%, transparent 60%)`, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: center, left: center, transform: "translate(-50%, -50%)", width: 600, height: 600, background: `radial-gradient(circle, ${P.purple}15 0%, transparent 60%)`, pointerEvents: "none" }} />

                {/* Orbiting Layer */}
                <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ duration: orbitDuration, repeat: Infinity, ease: "linear" }}
                    style={{ position: "absolute", width: size, height: size, top: 0, left: 0 }}
                >
                    {/* SVG Connections & Pulses */}
                    <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}>
                        {nodes.map((n, i) => {
                            const nx = center + Math.cos(n.angle) * radius;
                            const ny = center + Math.sin(n.angle) * radius;

                            return (
                                <g key={`line-group-${i}`}>
                                    <line x1={center} y1={center} x2={nx} y2={ny} stroke="rgba(255,255,255,0.15)" strokeWidth={2} strokeDasharray="4 6" />
                                    {/* Outward Pulse */}
                                    <motion.circle 
                                        r={4} 
                                        fill={n.color}
                                        style={{ filter: `drop-shadow(0 0 6px ${n.color})` }}
                                        initial={{ cx: center, cy: center, opacity: 0 }}
                                        animate={{ 
                                            cx: [center, nx], 
                                            cy: [center, ny], 
                                            opacity: [0, 1, 0] 
                                        }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                                    />
                                    {/* Inward Pulse */}
                                    <motion.circle 
                                        r={4} 
                                        fill={n.color}
                                        style={{ filter: `drop-shadow(0 0 6px ${n.color})` }}
                                        initial={{ cx: nx, cy: ny, opacity: 0 }}
                                        animate={{ 
                                            cx: [nx, center], 
                                            cy: [ny, center], 
                                            opacity: [0, 1, 0] 
                                        }}
                                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 + 1.25 }}
                                    />
                                </g>
                            );
                        })}
                    </svg>

                    {/* Orbiting Cards */}
                    {nodes.map((n, i) => {
                        const nx = center + Math.cos(n.angle) * radius;
                        const ny = center + Math.sin(n.angle) * radius;
                        
                        return (
                            <div key={n.id} style={{ position: "absolute", top: ny, left: nx, transform: "translate(-50%, -50%)" }}>
                                {/* Counter-rotation to keep cards upright */}
                                <motion.div animate={{ rotate: -360 }} transition={{ duration: orbitDuration, repeat: Infinity, ease: "linear" }}>
                                    <div style={{ 
                                        background: "rgba(11, 17, 32, 0.6)", 
                                        backdropFilter: "blur(12px)", 
                                        WebkitBackdropFilter: "blur(12px)",
                                        border: `1px solid ${n.color}50`, 
                                        padding: "16px 20px", 
                                        borderRadius: 20, 
                                        display: "flex", 
                                        alignItems: "center", 
                                        gap: 16,
                                        boxShadow: `0 16px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)`,
                                        whiteSpace: "nowrap"
                                    }}>
                                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${n.color}20`, border: `1px solid ${n.color}40`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 20, boxShadow: `0 0 16px ${n.color}30` }}>
                                            {n.icon}
                                        </div>
                                        <span style={{ color: "white", fontSize: 13, fontWeight: 700 }}>{n.label}</span>
                                    </div>
                                </motion.div>
                            </div>
                        );
                    })}
                </motion.div>

                {/* Central Platform Node */}
                <div style={{ position: "absolute", top: center, left: center, transform: "translate(-50%, -50%)", zIndex: 10 }}>
                    <motion.div 
                        animate={{ y: [-8, 8, -8], scale: [1, 1.05, 1] }} 
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                        style={{
                            background: `linear-gradient(135deg, rgba(59,111,255,0.2), rgba(139,92,246,0.2))`,
                            backdropFilter: "blur(24px)",
                            WebkitBackdropFilter: "blur(24px)",
                            border: `1px solid rgba(255,255,255,0.2)`,
                            boxShadow: `0 24px 60px rgba(0,0,0,0.6), inset 0 0 30px ${P.primary}40, 0 0 80px ${P.primary}40`,
                            padding: "32px 40px",
                            borderRadius: 32,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 12
                        }}
                    >
                        <img src="/logo-full.png" alt="NearMart" style={{ height: 28, filter: "brightness(2) drop-shadow(0 0 10px rgba(255,255,255,0.5))" }} />
                        <span style={{ color: "white", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2, marginTop: 4 }}>Platform Engine</span>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

// ── Interactive AI Network Background ──────────────────────────────────────────
function AINetworkBackground() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const particles = [];
        const numParticles = Math.min(60, Math.floor(width / 20));

        for (let i = 0; i < numParticles; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                radius: Math.random() * 1.5 + 0.5,
            });
        }

        let animationFrameId;

        const render = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = P.primary;
            ctx.strokeStyle = `rgba(59, 111, 255, 0.25)`;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                // Base particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(59, 111, 255, ${0.4 + (Math.sin(Date.now() / 1000 + i) * 0.2)})`; // Pulsing glow
                ctx.fill();

                // Multi-layer depth simulation (faint background particle trail)
                if (i % 3 === 0) {
                     ctx.beginPath();
                     ctx.arc(p.x - p.vx*5, p.y - p.vy*5, p.radius * 0.5, 0, Math.PI * 2);
                     ctx.fillStyle = `rgba(139, 92, 246, 0.2)`;
                     ctx.fill();
                }

                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dist = Math.hypot(p.x - p2.x, p.y - p2.y);

                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.globalAlpha = 1 - Math.pow(dist / 150, 2);
                        ctx.stroke();
                        ctx.globalAlpha = 1;
                    }
                }
            }
            animationFrameId = requestAnimationFrame(render);
        };

        render();

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 0,
                opacity: 0.8
            }}
        />
    );
}

// ── Magnetic Button Interaction ──────────────────────────────────────────────
function MagneticButton({ children, onClick, style, className }) {
    const ref = useRef(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        const { clientX, clientY } = e;
        const rect = ref.current.getBoundingClientRect();
        const middleX = clientX - (rect.left + rect.width / 2);
        const middleY = clientY - (rect.top + rect.height / 2);
        setPosition({ x: middleX * 0.15, y: middleY * 0.15 });
    };

    return (
        <motion.button
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setPosition({ x: 0, y: 0 })}
            animate={{ x: position.x, y: position.y }}
            transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
            onClick={onClick}
            style={{ ...style, cursor: 'pointer', zIndex: 20 }}
            className={className}
        >
            {children}
        </motion.button>
    );
}

export function WebLandingPage() {
    const scrollRef = useRef(null);
    const { scrollYProgress } = useScroll({ container: scrollRef });
    const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
    
    const yHeroText = useTransform(scrollYProgress, [0, 1], [0, 150]);
    const opacityHero = useTransform(scrollYProgress, [0, 0.4], [1, 0]);

    const handleLogin = () => {
        window.location.hash = "login";
    };

    const handleSignup = (role = "customer") => {
        window.location.hash = `signup-${role}`;
    };

    const handleRoleExplore = (roleName) => {
        if (roleName === "Customers") handleSignup("customer");
        else if (roleName === "Sellers") handleSignup("seller");
        else if (roleName === "Vendors") handleSignup("vendor");
        else if (roleName === "Delivery Partners") handleSignup("delivery");
        else handleSignup("customer");
    };

    return (
        <div ref={scrollRef} style={{ backgroundColor: "#060A12", color: P.text, height: "100vh", overflowX: "hidden", overflowY: "auto", fontFamily: "'Sora', sans-serif", boxSizing: "border-box", position: "relative" }}>
            <style>
                {`
                    ::-webkit-scrollbar {
                        display: none;
                    }
                    * {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}
            </style>
            
            <AINetworkBackground />

            {/* Scroll Progress Indicator */}
            <motion.div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${P.primary}, ${P.accent})`, transformOrigin: "0%", scaleX, zIndex: 200 }} />

            {/* Ambient Background Gradient Meshes */}
            <div style={{ position: "absolute", top: "10%", left: "5%", width: "40vw", height: "40vw", background: P.primary, filter: "blur(180px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: "40%", right: "5%", width: "30vw", height: "30vw", background: P.purple, filter: "blur(180px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />
            
            {/* Header */}
            <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(6,10,18,0.5)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src="/logo-full.png" alt="NearMart" style={{ height: 40, filter: "drop-shadow(0 4px 16px rgba(59,111,255,0.5))" }} />
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                        <button onClick={handleLogin} style={{ background: "none", border: "none", color: P.text, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Sign In</button>
                        <MagneticButton onClick={() => handleSignup()} style={{ background: `linear-gradient(135deg, ${P.primary}, ${P.accent})`, border: "none", borderRadius: 12, padding: "8px 20px", color: "white", fontWeight: 700, boxShadow: `0 8px 24px ${P.primary}60`, transition: "box-shadow 0.3s" }} onMouseEnter={e => e.currentTarget.style.boxShadow = `0 12px 32px ${P.primary}80`} onMouseLeave={e => e.currentTarget.style.boxShadow = `0 8px 24px ${P.primary}60`}>
                            Get Started
                        </MagneticButton>
                    </div>
                </div>
            </header>

            {/* Cinematic Hero Section */}
            <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", paddingTop: 80, zIndex: 10 }}>
                <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                    
                    {/* Left Copy */}
                    <motion.div style={{ flex: "1 1 500px", y: yHeroText, opacity: opacityHero, zIndex: 20 }}>
                        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
                            <span style={{ display: "inline-block", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", border: `1px solid rgba(255,255,255,0.1)`, padding: "8px 24px", borderRadius: 24, fontSize: 13, fontWeight: 700, color: P.text, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 24, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
                                <span style={{ color: P.primary }}>🚀</span> The OS for Hyperlocal
                            </span>
                        </motion.div>
                        
                        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} style={{ fontSize: "clamp(52px, 8vw, 84px)", fontWeight: 800, lineHeight: 1.05, marginBottom: 32, letterSpacing: "-2px", textShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
                            Deliver. Scale.<br />
                            <span style={{ background: `linear-gradient(135deg, ${P.primary}, #A78BFA, ${P.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Dominate.</span>
                        </motion.h1>
                        
                        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }} style={{ fontSize: "clamp(18px, 2vw, 22px)", color: P.textMuted, maxWidth: 500, marginBottom: 48, lineHeight: 1.6 }}>
                            NearMart provides the complete infrastructure to unify local vendors, lightning-fast delivery networks, and millions of customers in one powerful ecosystem.
                        </motion.p>
                        
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }} style={{ display: "flex", gap: 20, flexWrap: "wrap", zIndex: 30 }}>
                            <MagneticButton onClick={() => handleSignup()} style={{ padding: "20px 40px", fontSize: 16, fontWeight: 700, background: "white", color: "#060A12", border: "none", borderRadius: 16, boxShadow: `0 8px 30px rgba(255,255,255,0.2)` }}>
                                Start Building <span>→</span>
                            </MagneticButton>
                            <MagneticButton onClick={handleLogin} style={{ padding: "20px 40px", fontSize: 16, fontWeight: 700, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "white", borderRadius: 16, backdropFilter: "blur(12px)" }}>
                                Sign In
                            </MagneticButton>
                        </motion.div>
                    </motion.div>

                    {/* Right 3D Visual */}
                    <div style={{ flex: "1 1 500px", height: "80vh", position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
                            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "120%", height: "120%", background: `radial-gradient(circle, ${P.primary}15 0%, transparent 60%)`, pointerEvents: "none", zIndex: 0 }} />
                            <EcosystemVisualization />
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Premium Glassmorphism Features Grid */}
            <section style={{ padding: "160px 24px", position: "relative", zIndex: 10 }}>
                <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                    <div style={{ textAlign: "center", marginBottom: 80 }}>
                        <h2 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, marginBottom: 16, letterSpacing: "-1px" }}>Engineered for Scale</h2>
                        <p style={{ color: P.textMuted, fontSize: 18, maxWidth: 600, margin: "0 auto" }}>Everything you need to run a full-scale commerce operation beautifully embedded into one platform.</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32 }}>
                        {FEATURES.map((feat, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ root: scrollRef, once: false, margin: "-50px" }} transition={{ duration: 0.6, delay: i * 0.1, type: "spring", stiffness: 100 }} style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 32, padding: "48px 32px", position: "relative", overflow: "hidden", transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-10px) scale(1.02)"; e.currentTarget.style.boxShadow = `0 30px 60px rgba(0,0,0,0.5), inset 0 0 0 1px ${feat.color}40`; }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                                <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, background: feat.color, filter: "blur(100px)", opacity: 0.2, borderRadius: "50%", pointerEvents: "none" }} />
                                <div style={{ width: 64, height: 64, borderRadius: 20, background: `${feat.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 32, border: `1px solid ${feat.color}30`, boxShadow: `0 8px 32px ${feat.color}20` }}>
                                    {feat.icon}
                                </div>
                                <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: "white" }}>{feat.title}</h3>
                                <p style={{ color: P.textMuted, lineHeight: 1.7, fontSize: 16 }}>{feat.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Scroll-Driven Storytelling Section */}
            <section style={{ padding: "120px 24px", position: "relative", zIndex: 10, background: "linear-gradient(180deg, transparent, rgba(6,10,18,0.8), transparent)" }}>
                <div style={{ maxWidth: 1000, margin: "0 auto" }}>
                    <div style={{ textAlign: "center", marginBottom: 80 }}>
                        <h2 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, marginBottom: 16 }}>The NearMart Ecosystem</h2>
                        <p style={{ color: P.textMuted, fontSize: 18, maxWidth: 600, margin: "0 auto" }}>A completely seamless flow combining multiple systems into one continuous engine.</p>
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
                        {STORY_STEPS.map((step, i) => (
                            <React.Fragment key={i}>
                                <motion.div initial={{ opacity: 0, y: 50, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ root: scrollRef, once: false, margin: "-100px" }} transition={{ duration: 0.7, type: "spring" }} style={{ width: "100%", background: "rgba(255,255,255,0.02)", backdropFilter: "blur(16px)", border: `1px solid ${step.color}30`, borderRadius: 24, padding: "24px 32px", display: "flex", alignItems: "center", gap: 24, boxShadow: `0 24px 48px rgba(0,0,0,0.4)`, position: "relative", overflow: "hidden" }}>
                                    <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: `linear-gradient(90deg, ${step.color}10, transparent)`, opacity: 0.8 }} />
                                    <div style={{ width: 70, height: 70, borderRadius: 20, background: `${step.color}20`, border: `1px solid ${step.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, flexShrink: 0 }}>
                                        {step.icon}
                                    </div>
                                    <div style={{ zIndex: 1 }}>
                                        <h3 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{step.label}</h3>
                                        <p style={{ color: P.textMuted, fontSize: 16, margin: 0 }}>{step.sub}</p>
                                    </div>
                                </motion.div>
                                
                                {i < STORY_STEPS.length - 1 && (
                                    <div style={{ position: "relative", width: 2, height: 60, margin: "0 0" }}>
                                        {/* Static Track */}
                                        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: `linear-gradient(to bottom, ${step.color}20, ${STORY_STEPS[i+1].color}20)` }} />
                                        
                                        {/* Animated Pulse Line */}
                                        <motion.div 
                                            initial={{ height: 0, opacity: 0 }} 
                                            whileInView={{ height: "100%", opacity: 1 }} 
                                            viewport={{ root: scrollRef, once: false, margin: "-50px" }} 
                                            transition={{ duration: 1, ease: "easeInOut" }} 
                                            style={{ position: "absolute", top: 0, left: 0, width: "100%", background: `linear-gradient(to bottom, ${step.color}, ${STORY_STEPS[i+1].color})`, boxShadow: `0 0 10px ${step.color}` }} 
                                        />
                                        
                                        {/* Traveling Blip */}
                                        <motion.div
                                            animate={{ top: ["0%", "100%"], opacity: [0, 1, 0] }}
                                            transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
                                            style={{ position: "absolute", left: -2, width: 6, height: 12, borderRadius: 3, background: "white", boxShadow: "0 0 8px white" }}
                                        />
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            </section>

            {/* Seamless Roles Demo View - Upgraded */}
            <section style={{ padding: "160px 24px", position: "relative", zIndex: 10 }}>
                <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 160 }}>
                        {ROLES.map((role, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 80 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ root: scrollRef, once: false, margin: "-100px" }} transition={{ duration: 0.8, ease: "easeOut" }} style={{ display: "flex", flexDirection: i % 2 === 0 ? "row" : "row-reverse", alignItems: "center", gap: 80, flexWrap: "wrap" }}>
                                <div style={{ flex: "1 1 400px" }}>
                                    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 80, height: 80, borderRadius: 24, background: `${role.color}15`, border: `1px solid ${role.color}40`, fontSize: 40, marginBottom: 32, boxShadow: `0 16px 32px ${role.color}20` }}>{role.icon}</div>
                                    <h2 style={{ fontSize: "clamp(36px, 5vw, 52px)", fontWeight: 800, marginBottom: 24, color: "white", letterSpacing: "-1px" }}>Built for <span style={{ color: role.color }}>{role.name}</span></h2>
                                    <p style={{ color: P.textMuted, fontSize: 20, lineHeight: 1.8, marginBottom: 40 }}>{role.desc}</p>
                                    <MagneticButton onClick={() => handleRoleExplore(role.name)} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${role.color}50`, borderRadius: 16, padding: "16px 32px", color: "white", fontWeight: 700, fontSize: 16, backdropFilter: "blur(12px)", boxShadow: `0 12px 24px rgba(0,0,0,0.3)` }}>
                                        Explore as {role.name} →
                                    </MagneticButton>
                                </div>
                                
                                {/* Abstract Cinematic Graphic */}
                                <div style={{ flex: "1 1 400px", height: 440, background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 100%)", borderRadius: 40, border: "1px solid rgba(255,255,255,0.05)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }}>
                                    <div style={{ position: "absolute", width: "150%", height: "150%", background: `radial-gradient(circle at center, ${role.color}20 0%, transparent 50%)`, pointerEvents: "none" }} />
                                    
                                    <motion.div animate={{ y: [-15, 15, -15], rotateZ: [-2, 2, -2] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} style={{ background: "rgba(11,17,32,0.8)", backdropFilter: "blur(20px)", padding: "32px 40px", borderRadius: 24, border: `1px solid ${role.color}50`, boxShadow: `0 32px 64px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.1)`, zIndex: 1, display: "flex", alignItems: "center", gap: 24, width: "80%" }}>
                                        <div style={{ width: 64, height: 64, borderRadius: 16, background: `${role.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{role.icon}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ height: 12, width: "70%", background: "rgba(255,255,255,0.2)", borderRadius: 6, marginBottom: 16 }} />
                                            <div style={{ height: 10, width: "40%", background: "rgba(255,255,255,0.1)", borderRadius: 5, marginBottom: 12 }} />
                                            <div style={{ height: 10, width: "50%", background: "rgba(255,255,255,0.1)", borderRadius: 5 }} />
                                        </div>
                                    </motion.div>
                                    
                                    <motion.div animate={{ y: [10, -20, 10], x: [10, -10, 10] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }} style={{ position: "absolute", bottom: "10%", right: "5%", background: "rgba(11,17,32,0.9)", backdropFilter: "blur(10px)", padding: "16px 24px", borderRadius: 16, border: `1px solid ${role.color}40`, boxShadow: `0 20px 40px rgba(0,0,0,0.6)`, zIndex: 2 }}>
                                        <div style={{ height: 8, width: 48, background: role.color, borderRadius: 4, opacity: 0.9 }} />
                                    </motion.div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom Call to Action */}
            <section style={{ padding: "180px 24px", textAlign: "center", position: "relative", overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#060A12", zIndex: 10 }}>
                <div style={{ position: "absolute", bottom: "-50%", left: "50%", transform: "translateX(-50%)", width: "100%", height: 600, background: P.primary, filter: "blur(250px)", opacity: 0.2, borderRadius: "50%", pointerEvents: "none" }} />
                
                <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ root: scrollRef, once: false }} transition={{ duration: 0.8, type: "spring" }} style={{ position: "relative", zIndex: 10, maxWidth: 800, margin: "0 auto" }}>
                    <div style={{ display: "inline-block", background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`, padding: "10px 24px", borderRadius: 30, fontSize: 14, fontWeight: 700, color: P.text, marginBottom: 32 }}>
                        ✨ Start for free today
                    </div>
                    <h2 style={{ fontSize: "clamp(42px, 6vw, 64px)", fontWeight: 800, marginBottom: 32, letterSpacing: "-2px", lineHeight: 1.1 }}>Ready to accelerate<br />your business?</h2>
                    <p style={{ color: P.textMuted, fontSize: 22, marginBottom: 48, lineHeight: 1.6 }}>Join thousands of vendors, customers, and partners powering the future of delivery.</p>
                    
                    <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
                        <MagneticButton onClick={() => handleSignup()} style={{ padding: "24px 56px", fontSize: 18, fontWeight: 800, background: "white", color: "#060A12", border: "none", borderRadius: 20, boxShadow: `0 20px 40px rgba(255,255,255,0.2)` }}>
                            Get Started Now
                        </MagneticButton>
                    </div>
                </motion.div>
            </section>

            <footer style={{ position: "relative", zIndex: 10, padding: "48px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center", color: P.textDim, fontSize: 15, background: "#060A12" }}>
                <p>© {new Date().getFullYear()} NearMart Inc. All rights reserved.</p>
                <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16 }}>
                    <span style={{ cursor: "pointer", hover: { color: "white" }}}>Privacy Policy</span>
                    <span style={{ cursor: "pointer", hover: { color: "white" }}}>Terms of Service</span>
                    <span style={{ cursor: "pointer", hover: { color: "white" }}}>Contact</span>
                </div>
            </footer>
        </div>
    );
}
