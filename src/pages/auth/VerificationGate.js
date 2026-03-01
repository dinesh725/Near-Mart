import React, { useState } from 'react';
import { T } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import api from "../../api/client";

export function VerificationGate() {
    const { user, logout, refreshUser } = useAuth();
    const [mode, setMode] = useState(user?.phone ? "phone" : "email");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [msgType, setMsgType] = useState("error"); // "error" | "success"

    const isLocked = React.useMemo(() => {
        const e = localStorage.getItem("nm_otp_lock");
        if (!e) return false;
        const d = new Date(parseInt(e, 10));
        const now = new Date();
        if (now.getDate() !== d.getDate() || now.getMonth() !== d.getMonth() || now.getFullYear() !== d.getFullYear()) {
            localStorage.removeItem("nm_otp_lock");
            return false;
        }
        return true;
    }, []);

    const handleLogout = async () => {
        await logout();
    };

    const handleSendAction = async (type) => {
        setLoading(true);
        setMsg("");
        try {
            let res;
            if (type === "email") {
                res = await api.post("/auth/send-email-verification");
            } else {
                res = await api.post("/auth/send-otp", { phone: user?.phone });
            }

            // 401 is handled automatically by api/client.js (refresh → retry → nm:logout)
            if (res.status === 429 && res.error?.includes("limit reached")) {
                localStorage.setItem("nm_otp_lock", Date.now().toString());
                setMsg("Phone verification disabled for today. Please use Email verification.");
                setMsgType("error");
                setMode("email");
                setLoading(false);
                return;
            }

            if (res.ok) {
                setMsg(type === "email" ? "Verification email sent! Check your inbox!" : "OTP sent to your phone!");
                setMsgType("success");
            } else {
                setMsg(res.error || "Failed to send verification.");
                setMsgType("error");
            }
        } catch (err) {
            setMsg("Network error. Please try again.");
            setMsgType("error");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (otp.length !== 6) { setMsg("Enter 6-digit OTP"); setMsgType("error"); return; }
        setLoading(true);
        setMsg("");
        try {
            const res = await api.post("/auth/verify-otp", { phone: user?.phone, otp });

            if (res.ok) {
                // Refresh user from backend to get updated verification status
                await refreshUser();
            } else {
                setMsg(res.error || "Invalid OTP");
                setMsgType("error");
            }
        } catch (err) {
            setMsg("Network error. Please try again.");
            setMsgType("error");
        } finally {
            setLoading(false);
        }
    };

    // If fully verified, this component shouldn't be rendered, but just in case:
    if (user?.emailVerified || user?.phoneVerified) {
        return <div style={{ padding: 20, textAlign: 'center' }}>Account Verified. Redirecting...</div>;
    }

    const msgBg = msgType === "success" ? '#10b98120' : '#db277720';
    const msgColor = msgType === "success" ? '#10b981' : '#db2777';

    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "100vh", padding: 20, background: T.surface, color: T.text
        }}>
            <div style={{ background: T.card, padding: 30, borderRadius: 16, width: "100%", maxWidth: 400, border: `1px solid ${T.border}` }}>
                <h2 style={{ margin: "0 0 10px 0", color: T.gold }}>Verify Account</h2>
                <p style={{ fontSize: 14, color: T.textMuted, marginBottom: 20 }}>
                    Please verify your account to start placing orders.
                </p>

                {msg && <div style={{ padding: 10, borderRadius: 6, background: msgBg, color: msgColor, fontSize: 13, marginBottom: 15, textAlign: 'center' }}>{msg}</div>}

                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                    {user?.phone && (!isLocked) && (
                        <button onClick={() => setMode("phone")} style={{
                            flex: 1, padding: 10, background: mode === "phone" ? T.primary : "transparent",
                            color: mode === "phone" ? "#fff" : T.text, border: `1px solid ${mode === "phone" ? T.primary : T.border}`, borderRadius: 8
                        }}>Phone (OTP)</button>
                    )}
                    {user?.email && (
                        <button onClick={() => setMode("email")} style={{
                            flex: 1, padding: 10, background: mode === "email" ? T.primary : "transparent",
                            color: mode === "email" ? "#fff" : T.text, border: `1px solid ${mode === "email" ? T.primary : T.border}`, borderRadius: 8
                        }}>Email link</button>
                    )}
                </div>

                {mode === "email" && user?.email && (
                    <div className="col gap10">
                        <div style={{ fontSize: 13, color: T.textMuted }}>We will send a verification link to <b>{user.email}</b></div>
                        <button
                            onClick={() => handleSendAction("email")}
                            disabled={loading}
                            style={{ padding: 12, background: T.gold, color: '#000', border: 'none', borderRadius: 8, fontWeight: 'bold' }}>
                            {loading ? "Sending..." : "Send Verification Email"}
                        </button>
                    </div>
                )}

                {mode === "phone" && user?.phone && (
                    <div className="col gap10">
                        <div style={{ fontSize: 13, color: T.textMuted }}>We will send a 6-digit OTP to <b>{user.phone}</b></div>
                        <button
                            onClick={() => handleSendAction("phone")}
                            disabled={loading}
                            style={{ padding: 12, background: T.border, color: T.text, border: 'none', borderRadius: 8 }}>
                            {loading ? "Sending..." : "Send OTP"}
                        </button>

                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            autoFocus
                            placeholder="Enter 6-digit OTP"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            style={{ width: "100%", boxSizing: "border-box", padding: 12, background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, marginTop: 10, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
                        />

                        <button
                            onClick={handleVerifyOtp}
                            disabled={loading || otp.length < 6}
                            style={{ padding: 12, background: T.gold, color: '#000', border: 'none', borderRadius: 8, fontWeight: 'bold' }}>
                            {loading ? "Verifying..." : "Verify OTP"}
                        </button>
                    </div>
                )}

                {!user?.email && !user?.phone && (
                    <div style={{ color: '#db2777', fontSize: 13 }}>Please update your profile with an email or phone number to verify your account.</div>
                )}

                <button
                    onClick={handleLogout}
                    style={{ marginTop: 20, width: "100%", padding: 10, background: "transparent", color: T.textMuted, border: "none", cursor: 'pointer' }}>
                    Logout
                </button>
            </div>
        </div>
    );
}
