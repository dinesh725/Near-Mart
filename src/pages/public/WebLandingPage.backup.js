import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

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
    { name: "Delivery Partners", desc: "Earn independently with flexible hours, transparent payouts, and optimized AI routing.", icon: "🛵", color: P.warning }
];

export function WebLandingPage() {
    const scrollRef = React.useRef(null);
    const { scrollYProgress } = useScroll({ container: scrollRef });
    const yHero = useTransform(scrollYProgress, [0, 1], [0, 200]);
    const opacityHero = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

    const handleLogin = () => {
        window.location.hash = "login";
    };

    const handleSignup = (role = "customer") => {
        window.location.hash = `signup-${role}`;
    };

    const handleRoleExplore = (roleName) => {
        if (roleName === "Customers") handleSignup("customer");
        else if (roleName === "Sellers") handleSignup("seller");
        else if (roleName === "Delivery Partners") handleSignup("delivery");
        else handleSignup("customer");
    };

    return (
        <div ref={scrollRef} style={{ backgroundColor: "#060A12", color: P.text, height: "100vh", overflowX: "hidden", overflowY: "auto", fontFamily: "'Sora', sans-serif", boxSizing: "border-box" }}>

            {/* Header */}
            <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: "rgba(6,10,18,0.7)", backdropFilter: "blur(12px)", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src="/logo-full.png" alt="NearMart" style={{ height: 40, filter: "drop-shadow(0 4px 12px rgba(59,111,255,0.4))" }} />
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                        <button onClick={handleLogin} style={{ background: "none", border: "none", color: P.text, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Sign In</button>
                        <button onClick={() => handleSignup()} style={{ background: `linear-gradient(135deg, ${P.primary}, ${P.accent})`, border: "none", borderRadius: 12, padding: "8px 20px", color: "white", fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 16px ${P.primary}40`, transition: "transform 0.2s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>Get Started</button>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section style={{ position: "relative", paddingTop: 180, paddingBottom: 100, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: "10%", left: "20%", width: 500, height: 500, background: P.primary, filter: "blur(140px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "30%", right: "10%", width: 400, height: 400, background: P.purple, filter: "blur(120px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />

                <motion.div style={{ y: yHero, opacity: opacityHero, maxWidth: 1000, margin: "0 auto", textAlign: "center", padding: "0 24px", position: "relative", zIndex: 10 }}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                        <span style={{ background: "rgba(59,111,255,0.1)", border: `1px solid rgba(59,111,255,0.2)`, padding: "8px 20px", borderRadius: 24, fontSize: 12, fontWeight: 700, color: P.primary, letterSpacing: 1.5, textTransform: "uppercase" }}>The Future of Hyperlocal Commerce</span>
                    </motion.div>

                    <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} style={{ fontSize: "clamp(46px, 7vw, 84px)", fontWeight: 800, lineHeight: 1.1, marginTop: 28, marginBottom: 28, letterSpacing: "-1.5px" }}>
                        Your Entire Neighborhood,<br />
                        <span style={{ background: `linear-gradient(135deg, ${P.primary}, #A78BFA, ${P.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>In Your Pocket.</span>
                    </motion.h1>

                    <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} style={{ fontSize: "clamp(16px, 2vw, 22px)", color: P.textMuted, maxWidth: 700, margin: "0 auto 48px", lineHeight: 1.6 }}>
                        NearMart transforms how you interact with local businesses. Order groceries, manage retail inventory, or fulfill deliveries — all on one unified platform.
                    </motion.p>

                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.3 }} style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                        <button onClick={() => handleSignup()} style={{ padding: "18px 36px", fontSize: 16, fontWeight: 700, background: `linear-gradient(135deg, ${P.primary}, ${P.accent})`, color: "white", border: "none", borderRadius: 16, cursor: "pointer", boxShadow: `0 8px 30px ${P.primary}50`, display: "flex", alignItems: "center", gap: 12, transition: "transform 0.2s" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                            Join NearMart Today <span>→</span>
                        </button>
                    </motion.div>
                </motion.div>
            </section>

            {/* Features Grid */}
            <section style={{ padding: "120px 24px", position: "relative" }}>
                <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                    <div style={{ textAlign: "center", marginBottom: 70 }}>
                        <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, marginBottom: 16 }}>Everything You Need</h2>
                        <p style={{ color: P.textMuted, fontSize: 18, maxWidth: 600, margin: "0 auto" }}>Built from the ground up to solve real-world logistical challenges and connect you with the best stores around you.</p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
                        {FEATURES.map((feat, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ root: scrollRef, once: true, margin: "0px" }} transition={{ duration: 0.5, delay: i * 0.1 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 24, padding: "40px 32px", position: "relative", overflow: "hidden", transition: "transform 0.3s, background 0.3s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-5px)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)" }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.background = "rgba(255,255,255,0.02)" }}>
                                <div style={{ position: "absolute", top: 0, right: 0, width: 150, height: 150, background: feat.color, filter: "blur(90px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />
                                <div style={{ width: 64, height: 64, borderRadius: 16, background: `${feat.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 24, border: `1px solid ${feat.color}30`, boxShadow: `0 8px 24px ${feat.color}20` }}>
                                    {feat.icon}
                                </div>
                                <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{feat.title}</h3>
                                <p style={{ color: P.textMuted, lineHeight: 1.6, fontSize: 15 }}>{feat.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Seamless Roles Demo View */}
            <section style={{ padding: "120px 24px", background: "linear-gradient(180deg, rgba(6,10,18,0) 0%, rgba(17,24,39,0.3) 100%)", borderTop: "1px solid rgba(255,255,255,0.02)" }}>
                <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 100 }}>
                        {ROLES.map((role, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -60 : 60 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ root: scrollRef, once: true, margin: "0px" }} transition={{ duration: 0.7, ease: "easeOut" }} style={{ display: "flex", flexDirection: i % 2 === 0 ? "row" : "row-reverse", alignItems: "center", gap: 60, flexWrap: "wrap" }}>
                                <div style={{ flex: "1 1 400px" }}>
                                    <div style={{ fontSize: 56, marginBottom: 24 }}>{role.icon}</div>
                                    <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, marginBottom: 16, color: role.color }}>For {role.name}</h2>
                                    <p style={{ color: P.textMuted, fontSize: 18, lineHeight: 1.7, marginBottom: 32 }}>{role.desc}</p>
                                    <button onClick={() => handleRoleExplore(role.name)} style={{ background: "none", border: `2px solid ${role.color}40`, borderRadius: 14, padding: "12px 24px", color: "white", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = `${role.color}20`} onMouseLeave={e => e.currentTarget.style.background = "none"}>Explore as {role.name} →</button>
                                </div>

                                {/* Abstract Visual Graphic */}
                                <div style={{ flex: "1 1 400px", height: 360, background: "rgba(255,255,255,0.015)", borderRadius: 32, border: "1px solid rgba(255,255,255,0.05)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <div style={{ position: "absolute", width: "150%", height: "150%", background: `radial-gradient(circle at center, ${role.color}15 0%, transparent 60%)`, pointerEvents: "none" }} />
                                    <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ background: "#0B1120", padding: "24px 32px", borderRadius: 20, border: `1px solid ${role.color}40`, boxShadow: `0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset`, zIndex: 1, display: "flex", alignItems: "center", gap: 20, width: "70%" }}>
                                        <div style={{ width: 56, height: 56, borderRadius: 14, background: `${role.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{role.icon}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ height: 10, width: "80%", background: "rgba(255,255,255,0.15)", borderRadius: 5, marginBottom: 12 }} />
                                            <div style={{ height: 8, width: "50%", background: "rgba(255,255,255,0.08)", borderRadius: 4, marginBottom: 8 }} />
                                            <div style={{ height: 8, width: "40%", background: "rgba(255,255,255,0.08)", borderRadius: 4 }} />
                                        </div>
                                    </motion.div>

                                    {/* Secondary floating element */}
                                    <motion.div animate={{ y: [0, 15, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }} style={{ position: "absolute", bottom: "15%", right: "10%", background: "#0B1120", padding: "12px 20px", borderRadius: 12, border: `1px solid ${role.color}30`, boxShadow: `0 16px 32px rgba(0,0,0,0.5)`, zIndex: 2 }}>
                                        <div style={{ height: 6, width: 40, background: role.color, borderRadius: 3, opacity: 0.8 }} />
                                    </motion.div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom Call to Action */}
            <section style={{ padding: "140px 24px", textAlign: "center", position: "relative", overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.05)", background: "#060A12" }}>
                <div style={{ position: "absolute", bottom: "-30%", left: "50%", transform: "translateX(-50%)", width: "80%", height: 400, background: P.primary, filter: "blur(200px)", opacity: 0.15, borderRadius: "50%", pointerEvents: "none" }} />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ root: scrollRef, once: true }} transition={{ duration: 0.6 }} style={{ position: "relative", zIndex: 10 }}>
                    <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 800, marginBottom: 24, letterSpacing: "-1px" }}>Ready to start scaling?</h2>
                    <p style={{ color: P.textMuted, fontSize: 20, marginBottom: 48, maxWidth: 600, margin: "0 auto 48px", lineHeight: 1.6 }}>Deliver seamlessly, expand your inventory, and discover the best products right in your area.</p>
                    <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                        <button onClick={() => handleSignup()} style={{ padding: "18px 40px", fontSize: 16, fontWeight: 700, background: "white", color: "#060A12", border: "none", borderRadius: 16, cursor: "pointer", boxShadow: `0 8px 30px rgba(255,255,255,0.2)`, transition: "transform 0.2s" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                            Open Web Platform
                        </button>
                    </div>
                </motion.div>
            </section>

            <footer style={{ padding: "40px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center", color: P.textDim, fontSize: 14 }}>
                <p>© {new Date().getFullYear()} NearMart App Logistics. All rights reserved.</p>
            </footer>
        </div>
    );
}
