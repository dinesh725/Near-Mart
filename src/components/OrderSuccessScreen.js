import React, { useEffect, useState } from "react";
import { P } from "../theme/theme";

/**
 * OrderSuccessScreen — Stage 1 of the new post-checkout UX.
 * Shows a brief animated success transition (2-3 seconds) before
 * transitioning to the Order Command Center.
 *
 * Props:
 *  - orders: Array of backend order objects
 *  - paymentMethod: "wallet" | "razorpay" | "hybrid"
 *  - onComplete: Called when animation finishes (navigates to Command Center)
 */
export function OrderSuccessScreen({ orders, paymentMethod, onComplete }) {
    const [phase, setPhase] = useState(0); // 0=enter, 1=details, 2=exit

    const total = orders?.reduce((s, o) => s + (o.total || 0), 0) || 0;
    const orderCount = orders?.length || 1;

    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 600);   // Show details after checkmark animation
        const t2 = setTimeout(() => setPhase(2), 2200);  // Start exit transition
        const t3 = setTimeout(() => onComplete?.(), 2800); // Navigate away
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [onComplete]);

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: P.bg,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            transition: "opacity 0.5s ease, transform 0.5s ease",
            opacity: phase === 2 ? 0 : 1,
            transform: phase === 2 ? "scale(1.05)" : "scale(1)",
        }}>
            {/* Radial pulse background */}
            <div style={{
                position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
            }}>
                <div style={{
                    position: "absolute", top: "40%", left: "50%",
                    width: 600, height: 600,
                    transform: "translate(-50%, -50%)",
                    background: `radial-gradient(circle, ${P.success}18 0%, transparent 70%)`,
                    borderRadius: "50%",
                    animation: "successPulseRing 2s ease-out forwards",
                }} />
            </div>

            {/* Checkmark circle */}
            <div style={{
                width: 96, height: 96, borderRadius: "50%",
                background: `linear-gradient(135deg, ${P.success}, #10B981)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 60px ${P.success}44, 0 8px 32px rgba(0,0,0,0.4)`,
                animation: "successCheckIn 0.6s cubic-bezier(.34,1.56,.64,1) forwards",
                marginBottom: 24,
            }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                        strokeDasharray: 40,
                        strokeDashoffset: phase >= 0 ? 0 : 40,
                        transition: "stroke-dashoffset 0.5s ease 0.3s",
                    }}
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            {/* Title */}
            <div style={{
                fontSize: 24, fontWeight: 800, color: P.text,
                marginBottom: 8,
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? "translateY(0)" : "translateY(12px)",
                transition: "all 0.4s ease",
            }}>
                Order Confirmed! 🎉
            </div>

            {/* Subtitle */}
            <div style={{
                fontSize: 14, color: P.textMuted, marginBottom: 20,
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? "translateY(0)" : "translateY(12px)",
                transition: "all 0.4s ease 0.1s",
            }}>
                {paymentMethod === "wallet" ? "Paid from wallet" :
                    paymentMethod === "hybrid" ? "Wallet + Gateway payment" :
                        "Payment successful"}
            </div>

            {/* Amount & Order info */}
            <div style={{
                opacity: phase >= 1 ? 1 : 0,
                transform: phase >= 1 ? "translateY(0)" : "translateY(16px)",
                transition: "all 0.4s ease 0.2s",
                textAlign: "center",
            }}>
                <div style={{
                    fontSize: 36, fontWeight: 800, color: P.success,
                    fontFamily: "'JetBrains Mono', monospace",
                    marginBottom: 6,
                }}>
                    ₹{total.toLocaleString("en-IN")}
                </div>
                {orderCount > 1 && (
                    <div style={{ fontSize: 12, color: P.textMuted }}>
                        Split into {orderCount} deliveries
                    </div>
                )}
            </div>

            {/* Inline keyframes */}
            <style>{`
                @keyframes successCheckIn {
                    0% { opacity: 0; transform: scale(0.3) rotate(-10deg); }
                    60% { opacity: 1; transform: scale(1.1) rotate(2deg); }
                    100% { opacity: 1; transform: scale(1) rotate(0deg); }
                }
                @keyframes successPulseRing {
                    0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
                }
            `}</style>
        </div>
    );
}

export default OrderSuccessScreen;
