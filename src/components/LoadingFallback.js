import React from "react";
import { T } from "../theme/theme";

/**
 * LoadingFallback — A jaw-dropping premium splash/loading screen
 * Used during app cold-starts and code chunk downloads.
 */
export function LoadingFallback() {
    return (
        <div style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: `radial-gradient(circle at center, ${T.surface} 0%, ${T.bg} 100%)`,
            zIndex: 99999, // Super high z-index to cover everything
            overflow: "hidden"
        }}>
            {/* ── Ambient Background Glows ── */}
            <div style={{
                position: "absolute",
                width: "50vw", height: "50vw", minWidth: 350, minHeight: 350,
                background: `radial-gradient(circle, ${T.primary}15 0%, transparent 70%)`,
                borderRadius: "50%",
                animation: "fallback-ambient 5s ease-in-out infinite alternate",
                pointerEvents: "none",
                top: "-10%", left: "-10%"
            }} />
            <div style={{
                position: "absolute",
                width: "60vw", height: "60vw", minWidth: 450, minHeight: 450,
                background: `radial-gradient(circle, ${T.gold}10 0%, transparent 70%)`,
                borderRadius: "50%",
                animation: "fallback-ambient 7s ease-in-out infinite alternate-reverse",
                pointerEvents: "none",
                bottom: "-15%", right: "-15%"
            }} />

            {/* ── Central Animated Element ── */}
            <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ 
                    position: "relative", width: 90, height: 90, marginBottom: 28, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                    
                    {/* Ring 1 - Fast Forward */}
                    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", animation: "fallback-spin 1.2s linear infinite" }}>
                        <defs>
                            <linearGradient id="ringG1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={T.primary} stopOpacity="1"/>
                                <stop offset="100%" stopColor={T.primary} stopOpacity="0"/>
                            </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="46" fill="none" stroke="url(#ringG1)" strokeWidth="3" strokeLinecap="round" strokeDasharray="140 200" />
                    </svg>

                    {/* Ring 2 - Slow Reverse */}
                    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", animation: "fallback-spin-reverse 3s linear infinite" }}>
                        <defs>
                            <linearGradient id="ringG2" x1="100%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={T.gold} stopOpacity="1"/>
                                <stop offset="100%" stopColor={T.gold} stopOpacity="0"/>
                            </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="36" fill="none" stroke="url(#ringG2)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="70 150" />
                    </svg>

                    {/* Core Breathing Logo */}
                    <div style={{ 
                        width: 48, height: 48, 
                        background: `linear-gradient(135deg, ${T.primary}, ${T.purple})`, 
                        borderRadius: "32%", 
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 0 30px ${T.primary}60`,
                        animation: "fallback-breathe 2s ease-in-out infinite alternate"
                    }}>
                        <span style={{ 
                            color: "white", fontWeight: 800, fontSize: 26, 
                            letterSpacing: -1, fontFamily: "'Sora', sans-serif" 
                        }}>N</span>
                    </div>
                </div>

                {/* ── Text & Load Dots ── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        fontWeight: 800, 
                        fontSize: 24, 
                        letterSpacing: "1px",
                        fontFamily: "'Sora', sans-serif",
                        background: `linear-gradient(to right, #FFF, ${T.gold})`,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        animation: "fallback-fade-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards"
                    }}>
                        NearMart
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', margin: "0 auto" }}>
                        <div className="nm-bounce-dot" style={{ animationDelay: '0s' }} />
                        <div className="nm-bounce-dot" style={{ animationDelay: '0.15s' }} />
                        <div className="nm-bounce-dot" style={{ animationDelay: '0.3s' }} />
                    </div>
                </div>
            </div>

            {/* Scoped Keyframes */}
            <style>{`
                @keyframes fallback-spin { 
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); } 
                }
                @keyframes fallback-spin-reverse { 
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); } 
                }
                @keyframes fallback-ambient {
                    0% { transform: scale(0.9) translate(0, 0); opacity: 0.4; }
                    100% { transform: scale(1.1) translate(20px, 20px); opacity: 0.8; }
                }
                @keyframes fallback-breathe {
                    0% { transform: scale(0.95); box-shadow: 0 0 15px ${T.primary}40; }
                    100% { transform: scale(1.05); box-shadow: 0 0 45px ${T.primary}90; }
                }
                @keyframes fallback-fade-up {
                    0% { opacity: 0; transform: translateY(15px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes nm-bounce-up {
                    0%, 100% { transform: translateY(0); background: ${T.textDim}; }
                    50% { transform: translateY(-5px); background: ${T.gold}; box-shadow: 0 0 8px ${T.gold}80; }
                }
                .nm-bounce-dot {
                    width: 6px; height: 6px;
                    border-radius: 50%;
                    background: ${T.textDim};
                    margin: 0 3px;
                    animation: nm-bounce-up 1.2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
