import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAuth } from "../../auth/AuthContext";
import api from "../../api/client";
import { P } from "../../theme/theme";

// ── Capacitor detection ─────────────────────────────────────────────────────
const isCapacitorNative = () => {
    try {
        return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    } catch { return false; }
};

const API_BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

// ── Google OAuth Wrapper ──────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// ── Custom Google button for Capacitor (GSI SDK doesn't work in WebView) ────
function CapacitorGoogleButton({ onSuccess, onError }) {
    const [loading, setLoading] = useState(false);

    const handleGoogleOAuth = useCallback(async () => {
        setLoading(true);
        try {
            // Use implicit flow — returns id_token directly to the redirect page
            const redirectUri = `${API_BASE_URL}/api/auth/google/mobile-redirect`;
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&response_type=id_token` +
                `&scope=${encodeURIComponent('openid email profile')}` +
                `&nonce=${Math.random().toString(36).slice(2)}` +
                `&prompt=select_account`;

            // Use Capacitor Browser plugin
            let browserPlugin;
            try {
                const mod = await import('@capacitor/browser');
                browserPlugin = mod.Browser;
            } catch { /* Browser plugin not installed */ }

            if (browserPlugin) {
                const { App: CapApp } = await import('@capacitor/app');
                const listener = await CapApp.addListener('appUrlOpen', async (event) => {
                    try {
                        const url = new URL(event.url);
                        const accessToken = url.searchParams.get('accessToken');
                        const refreshToken = url.searchParams.get('refreshToken');
                        const error = url.searchParams.get('error');
                        listener.remove();
                        await browserPlugin.close().catch(() => { });

                        if (accessToken && refreshToken) {
                            api.setTokens(accessToken, refreshToken);
                            window.location.reload();
                        } else if (error) {
                            onError(error);
                        } else {
                            onError('Google sign-in failed');
                        }
                    } catch (e) {
                        onError(e?.message || 'Google sign-in failed');
                    }
                    setLoading(false);
                });
                await browserPlugin.open({ url: authUrl });
            } else {
                window.open(authUrl, '_system');
                setLoading(false);
            }
        } catch (err) {
            console.error('Google OAuth error:', err);
            onError(err?.message || 'Google sign-in failed');
            setLoading(false);
        }
    }, [onError]);

    return (
        <button
            onClick={handleGoogleOAuth}
            disabled={loading}
            style={{
                width: "100%",
                marginTop: 16,
                padding: "12px 16px",
                background: "#ffffff",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 14,
                cursor: loading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                transition: "all 0.2s ease",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
        >
            <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
                {loading ? "Signing in..." : "Continue with Google"}
            </span>
        </button>
    );
}

// ── Web GSI Google Button (original — works on web browsers) ─────────────────
function WebGoogleAuthScript({ onSuccess, onError }) {
    const instanceId = useRef(`g_btn_${Math.random().toString(36).slice(2, 8)}`);

    useEffect(() => {
        if (document.getElementById("google-gsi")) {
            // Script already loaded, just initialize
            if (window.google) {
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: (res) => onSuccess(res.credential),
                });
            }
            return;
        }
        const script = document.createElement("script");
        script.id = "google-gsi";
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = () => {
            window.google?.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (res) => onSuccess(res.credential),
            });
        };
        script.onerror = onError;
        document.body.appendChild(script);
    }, [onSuccess, onError]);

    const renderButton = (id) => {
        if (window.google) {
            const btnWidth = Math.min(384, window.innerWidth > 440 ? 384 : window.innerWidth - 32).toString();
            window.google.accounts.id.renderButton(document.getElementById(id), {
                theme: "filled_black", size: "large", type: "standard", shape: "pill", width: btnWidth
            });
        }
    };

    useEffect(() => {
        const id = instanceId.current;
        const t = setInterval(() => { if (window.google) { renderButton(id); clearInterval(t); } }, 500);
        return () => clearInterval(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return <div id={instanceId.current} style={{ marginTop: 16 }}></div>;
}

// ── Unified Google Auth Component ────────────────────────────────────────────
function GoogleAuthScript({ onSuccess, onError }) {
    if (isCapacitorNative()) {
        return <CapacitorGoogleButton onSuccess={onSuccess} onError={onError} />;
    }
    return <WebGoogleAuthScript onSuccess={onSuccess} onError={onError} />;
}

const ROLE_CONFIG = {
    customer: { color: P.primary, icon: "🛍", label: "Customer", desc: "Browse, shop & track orders" },
    seller: { color: P.success, icon: "🏪", label: "Seller / Retailer", desc: "Manage orders & inventory" },
    vendor: { color: "#F59E0B", icon: "🏭", label: "Vendor / Supplier", desc: "Supply chain & bulk orders" },
    delivery: { color: P.accent, icon: "🛵", label: "Delivery Partner", desc: "Accept & fulfill deliveries" },
    support: { color: P.warning, icon: "🎧", label: "Support Agent", desc: "Resolve tickets & disputes" },
    admin: { color: P.purple, icon: "🛡", label: "Admin", desc: "Platform intelligence & controls" },
};

const ROLES_LIST = Object.keys(ROLE_CONFIG);

function validate(form) {
    const errs = {};
    if (!form.name?.trim()) errs.name = "Name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || "")) errs.email = "Valid email required";
    if ((form.password || "").length < 6) errs.password = "Min 6 characters";
    if (!form.role) errs.role = "Select a role";
    return errs;
}

function validateLogin(form) {
    const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email || "")) errs.email = "Valid email required";
    if (!form.password) errs.password = "Password required";
    return errs;
}

// ── Floating Label Input ──────────────────────────────────────────────────────
function FloatingInput({ id, label, type = "text", value, onChange, onKeyDown, error, icon, rightSlot, autoFocus, autoComplete }) {
    const [focused, setFocused] = useState(false);
    const hasValue = !!value;
    const isActive = focused || hasValue;

    return (
        <div style={{ position: "relative", marginBottom: error ? 4 : 0, width: "100%", boxSizing: "border-box" }}>
            <div style={{
                position: "relative",
                width: "100%",
                boxSizing: "border-box",
                border: `1.5px solid ${error ? P.danger : focused ? P.primary : "rgba(255,255,255,0.12)"}`,
                borderRadius: 14,
                background: focused ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                transition: "all .25s ease",
                boxShadow: focused ? `0 0 0 3px ${P.primary}15` : "none",
            }}>
                {icon && <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.5, pointerEvents: "none", transition: "opacity .2s" }}>{icon}</span>}
                <input
                    id={id}
                    type={type}
                    value={value}
                    onChange={onChange}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={onKeyDown}
                    autoFocus={autoFocus}
                    autoComplete={autoComplete}
                    {...(type === "tel" || id === "otp-code" ? { inputMode: "numeric", pattern: "[0-9]*" } : {})}
                    {...(id === "otp-code" ? { autoComplete: "one-time-code" } : {})}
                    style={{
                        width: "100%", padding: `22px ${rightSlot ? 48 : 16}px 8px ${icon ? 42 : 16}px`,
                        background: "none", border: "none", outline: "none",
                        color: "white", fontSize: 14, fontFamily: "'Sora',sans-serif",
                        boxSizing: "border-box",
                    }}
                />
                <label htmlFor={id} style={{
                    position: "absolute", left: icon ? 42 : 16,
                    top: isActive ? 6 : "50%",
                    transform: isActive ? "none" : "translateY(-50%)",
                    fontSize: isActive ? 10 : 14,
                    fontWeight: isActive ? 600 : 400,
                    color: error ? P.danger : focused ? P.primary : "rgba(255,255,255,0.4)",
                    pointerEvents: "none",
                    transition: "all .2s cubic-bezier(.4,0,.2,1)",
                    letterSpacing: isActive ? 0.5 : 0,
                    textTransform: isActive ? "uppercase" : "none",
                    fontFamily: "'Sora',sans-serif",
                }}>{label}</label>
                {rightSlot && <div style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>{rightSlot}</div>}
            </div>
            {error && <div style={{ fontSize: 11, color: P.danger, marginTop: 4, marginLeft: 4, fontWeight: 600 }}>{error}</div>}
        </div>
    );
}

// ── Password Strength Bar ─────────────────────────────────────────────────────
function StrengthBar({ password }) {
    if (!password) return null;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const cfg = score <= 2 ? { label: "Weak", color: P.danger, pct: 33 } : score <= 3 ? { label: "Medium", color: P.warning, pct: 66 } : { label: "Strong", color: P.success, pct: 100 };
    return (
        <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${cfg.pct}%`, height: "100%", background: cfg.color, borderRadius: 3, transition: "width .4s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            <span style={{ fontSize: 10, color: cfg.color, fontWeight: 700, marginTop: 3, display: "inline-block", letterSpacing: 0.5, textTransform: "uppercase" }}>{cfg.label}</span>
        </div>
    );
}

export function LoginPage() {
    const { login, signup, loginWithGoogle } = useAuth();
    const [tab, setTab] = useState("signin");
    const [loginMethod, setLoginMethod] = useState("email"); // "email" | "phone"
    const [form, setForm] = useState({ name: "", email: "", password: "", role: "customer" });
    const [errs, setErrs] = useState({});
    const [serverErr, setServerErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [success, setSuccess] = useState(false);

    // OTP state
    const [otpPhone, setOtpPhone] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [otpName, setOtpName] = useState("");
    const [otpStep, setOtpStep] = useState("phone"); // 'phone' | 'otp' | 'name'
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState("");
    const [otpCooldown, setOtpCooldown] = useState(0);

    const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrs(e => ({ ...e, [k]: "" })); setServerErr(""); };

    // API_BASE used by OTP handlers below
    const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/+$/, ''); // eslint-disable-line no-unused-vars

    const isLocked = useMemo(() => {
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

    const handleSendOtp = useCallback(async () => {
        const rawPhone = otpPhone.replace(/\D/g, "").slice(0, 10);
        if (rawPhone.length !== 10) { setOtpError("Enter a valid 10-digit phone number"); return; }
        if (otpPhone !== rawPhone) setOtpPhone(rawPhone);
        setOtpLoading(true); setOtpError("");
        try {
            const data = await api.post("/auth/send-otp", { phone: rawPhone });
            if (data.status === 429 || (data.error && (data.error.includes("limit reached") || data.error.includes("Wait")))) {
                if (data.error?.includes("limit reached")) {
                    localStorage.setItem("nm_otp_lock", Date.now().toString());
                    setOtpError("Phone verification limit reached for today. Please use email verification.");
                } else {
                    setOtpError(data.error);
                }
                setOtpLoading(false);
                return;
            }
            if (data.ok) {
                setOtpStep("otp");
                setOtpCooldown(60);
                const timer = setInterval(() => setOtpCooldown(v => { if (v <= 1) { clearInterval(timer); return 0; } return v - 1; }), 1000);
            } else {
                setOtpError(data.error || "Failed to send OTP");
            }
        } catch (err) {
            setOtpError(err?.message || "Network error. Check connection.");
        }
        setOtpLoading(false);
    }, [otpPhone]);

    const handleVerifyOtp = useCallback(async (nameOverride) => {
        if (otpCode.length !== 6) { setOtpError("Enter 6-digit OTP"); return; }
        setOtpLoading(true); setOtpError("");
        try {
            const effectiveName = nameOverride || otpName.trim();
            const body = { phone: otpPhone.replace(/\D/g, "").slice(0, 10), otp: otpCode };
            if (effectiveName) body.name = effectiveName;
            const data = await api.post("/auth/verify-otp", body);
            if (data.ok) {
                // Store tokens via api client and reload to trigger AuthContext
                if (data.accessToken) api.setTokens(data.accessToken, data.refreshToken);
                window.location.reload();
            } else if (data.needsName && !effectiveName) {
                setOtpStep("name");
                setOtpLoading(false);
                return;
            } else {
                setOtpError(data.error || "Invalid OTP");
            }
        } catch (err) {
            setOtpError(err?.message || "Network error");
        }
        setOtpLoading(false);
    }, [otpPhone, otpCode, otpName]);

    const handleGoogleLogin = useCallback(async (token, role) => {
        setLoading(true); setServerErr("");
        try {
            const res = await loginWithGoogle(token, role);
            if (!res.ok) {
                setServerErr(res.error || "Google authentication failed");
            }
        } catch (err) { setServerErr(err?.message || "Connection failed during Google sign-in"); }
        setLoading(false);
    }, [loginWithGoogle]);


    const handleSignIn = useCallback(async () => {
        const e = validateLogin(form);
        if (Object.keys(e).length) { setErrs(e); return; }
        setLoading(true); setServerErr("");
        try {
            const res = await login(form.email, form.password);
            if (!res.ok) setServerErr(res.error);
        } catch (err) { setServerErr(err?.message || "Connection failed — check your internet"); }
        setLoading(false);
    }, [form, login]);

    const handleSignUp = useCallback(async () => {
        const e = validate(form);
        if (Object.keys(e).length) { setErrs(e); return; }
        setLoading(true); setServerErr("");
        try {
            const res = await signup(form.name, form.email, form.password, form.role);
            if (!res.ok) { setServerErr(res.error); } else { setSuccess(true); }
        } catch (err) { setServerErr(err?.message || "Connection failed — check your internet"); }
        setLoading(false);
    }, [form, signup]);

    const pwToggle = useMemo(() => (
        <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 16, padding: "8px", transition: "color .2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,.7)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.4)"}>
                {showPw ? "🙈" : "👁"}
            </button>
        </div>
    ), [showPw]);

    const TAB_STYLE = (active) => ({
        flex: 1, padding: "11px 0",
        background: active ? "linear-gradient(135deg, #3B6FFF, #6366F1)" : "none",
        border: "none", borderRadius: 12,
        color: active ? "white" : "rgba(255,255,255,0.4)",
        fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 12,
        cursor: "pointer", transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        boxShadow: active ? "0 4px 16px rgba(59,111,255,0.3)" : "none",
        letterSpacing: 0.3,
    });

    // Card wrapper style
    const cardStyle = {
        width: "100%", maxWidth: 440, boxSizing: "border-box",
        background: "rgba(15,20,35,0.85)",
        backdropFilter: "blur(20px) saturate(1.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "32px 28px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
    };

    return (
        <div style={{
            minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", background: "#060A12", padding: "24px 16px",
            boxSizing: "border-box", width: "100%", maxWidth: "100vw", overflowX: "hidden", overflowY: "auto", overscrollBehaviorX: "none",
            backgroundImage: "radial-gradient(ellipse at 30% 20%, rgba(59,111,255,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.06) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(99,102,241,0.03) 0%, transparent 70%)",
        }}>
            {/* Brand */}
            <div style={{ textAlign: "center", marginBottom: 36 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 10 }}>
                    <img src="/logo-full.png" alt="NearMart" style={{ height: 60, objectFit: "contain", filter: "drop-shadow(0 8px 16px rgba(59,111,255,0.4))", marginBottom: -10 }} />
                </div>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 500 }}>Multi-Role Commerce Platform</p>
            </div>

            {/* Tab Switcher */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 4, gap: 4, marginBottom: 28, width: "100%", maxWidth: 440 }}>
                {[["signin", "Sign In"], ["signup", "Sign Up"]].map(([k, l]) => (
                    <button key={k} style={TAB_STYLE(tab === k)} onClick={() => { setTab(k); setErrs({}); setServerErr(""); setSuccess(false); setOtpError(""); setOtpStep("phone"); setLoginMethod("email"); }}>{l}</button>
                ))}
            </div>



            {/* ── SIGN IN TAB ── */}
            {tab === "signin" && (
                <div style={cardStyle}>
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                        <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 6, color: "white" }}>Welcome back</h2>
                        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Sign in to your NearMart account</p>
                    </div>

                    {/* Login Method Toggle */}
                    <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 4, gap: 4, marginBottom: 20 }}>
                        {[["email", "✉ Email"], ["phone", "📱 Phone"]].map(([m, l]) => (
                            <button key={m} onClick={() => { setLoginMethod(m); setOtpStep("phone"); setOtpError(""); setServerErr(""); }}
                                style={{ flex: 1, padding: "9px 0", background: loginMethod === m ? "linear-gradient(135deg,#3B6FFF,#6366F1)" : "none", border: "none", borderRadius: 10, color: loginMethod === m ? "white" : "rgba(255,255,255,0.4)", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all .25s" }}>{l}</button>
                        ))}
                    </div>

                    {/* Email + Password Sign In */}
                    {loginMethod === "email" && (
                        <form onSubmit={e => { e.preventDefault(); handleSignIn(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <FloatingInput id="si-email" label="Email Address" type="email" icon="✉" value={form.email} onChange={e => set("email", e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignIn()} error={errs.email} autoFocus autoComplete="username" />
                            <FloatingInput id="si-pw" label="Password" type={showPw ? "text" : "password"} icon="🔒" value={form.password} onChange={e => set("password", e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignIn()} error={errs.password} rightSlot={pwToggle} autoComplete="current-password" />
                            {serverErr && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {serverErr}</div>}
                            <button onClick={handleSignIn} disabled={loading} style={{ width: "100%", padding: "14px 0", background: loading ? "rgba(59,111,255,0.5)" : "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 14, color: "white", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s", letterSpacing: 0.3 }}>
                                {loading ? <><span className="spinner" style={{ marginRight: 8 }} />Signing in...</> : "Sign In"}
                            </button>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                                <button onClick={() => setServerErr("✉ Password reset link sent to your email!")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12 }}>Forgot Password?</button>
                                <button type="button" onClick={() => setTab("signup")} style={{ background: "none", border: "none", color: P.primary, cursor: "pointer", fontWeight: 700, fontFamily: "'Sora',sans-serif", fontSize: 12 }}>Create Account →</button>
                            </div>
                        </form>
                    )}

                    {/* Phone + OTP Sign In */}
                    {loginMethod === "phone" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {isLocked && (
                                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "16px", color: P.danger, fontSize: 13, fontWeight: 500, textAlign: "center", lineHeight: 1.6 }}>
                                    ⚠ Phone verification limit reached for today.<br />Please continue with email verification.
                                </div>
                            )}
                            {!isLocked && otpStep === "phone" && (
                                <>
                                    <FloatingInput id="si-otp-phone" label="Phone Number (10 digits)" type="tel" icon="📱" value={otpPhone} onChange={e => { setOtpPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setOtpError(""); }} onKeyDown={e => e.key === "Enter" && handleSendOtp()} autoFocus />
                                    {otpError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {otpError}</div>}
                                    <button onClick={handleSendOtp} disabled={otpLoading} style={{ width: "100%", padding: "14px 0", background: otpLoading ? "rgba(59,111,255,0.5)" : "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 14, color: "white", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15, cursor: otpLoading ? "wait" : "pointer", boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s" }}>
                                        {otpLoading ? "Sending..." : "Send OTP"}
                                    </button>
                                </>
                            )}
                            {!isLocked && otpStep === "otp" && (
                                <>
                                    <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>OTP sent to <strong style={{ color: P.primary }}>{otpPhone}</strong></div>
                                    <FloatingInput id="si-otp-code" label="Enter 6-Digit OTP" icon="🔑" value={otpCode} onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(""); }} onKeyDown={e => e.key === "Enter" && handleVerifyOtp()} autoFocus />
                                    {otpError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {otpError}</div>}
                                    <button onClick={() => handleVerifyOtp()} disabled={otpLoading} style={{ width: "100%", padding: "14px 0", background: otpLoading ? "rgba(59,111,255,0.5)" : "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 14, color: "white", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15, cursor: otpLoading ? "wait" : "pointer", boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s" }}>
                                        {otpLoading ? "Verifying..." : "Verify & Sign In"}
                                    </button>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <button onClick={() => setOtpStep("phone")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12 }}>← Change Number</button>
                                        <button onClick={handleSendOtp} disabled={otpCooldown > 0 || otpLoading} style={{ background: "none", border: "none", color: otpCooldown > 0 ? "rgba(255,255,255,0.2)" : P.primary, cursor: otpCooldown > 0 ? "default" : "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700 }}>
                                            {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend OTP"}
                                        </button>
                                    </div>
                                </>
                            )}
                            {!isLocked && otpStep === "name" && (
                                <>
                                    <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Welcome! Enter your name to complete registration.</div>
                                    <FloatingInput id="si-otp-name" label="Your Name" icon="👤" value={otpName} onChange={e => { setOtpName(e.target.value); setOtpError(""); }} onKeyDown={e => e.key === "Enter" && handleVerifyOtp()} autoFocus />
                                    {otpError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {otpError}</div>}
                                    <button onClick={() => handleVerifyOtp()} disabled={otpLoading || !otpName.trim()} style={{ width: "100%", padding: "14px 0", background: !otpName.trim() ? "rgba(59,111,255,0.3)" : "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 14, color: "white", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15, cursor: !otpName.trim() ? "not-allowed" : "pointer", boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s" }}>
                                        {otpLoading ? "Creating account..." : "Complete Registration"}
                                    </button>
                                </>
                            )}
                            {/* Google Sign-In still available */}
                            <GoogleAuthScript onSuccess={(res) => handleGoogleLogin(res, "customer")} onError={() => setServerErr("Google Login failed")} />
                        </div>
                    )}
                </div>
            )
            }

            {/* ── SIGN UP TAB ── */}
            {
                tab === "signup" && (
                    <div style={cardStyle}>
                        {success ? (
                            <div style={{ textAlign: "center", padding: "40px 0" }}>
                                <div style={{ width: 64, height: 64, borderRadius: "50%", background: `${P.success}18`, border: `2px solid ${P.success}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 16px" }}>✅</div>
                                <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Account Created!</h2>
                                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Check your email to verify, then sign in.</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ textAlign: "center", marginBottom: 20 }}>
                                    <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 6, color: "white" }}>Create account</h2>
                                    <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Join NearMart as your role</p>
                                </div>

                                <form onSubmit={e => { e.preventDefault(); handleSignUp(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                    <FloatingInput id="su-name" label="Full Name" icon="👤" value={form.name} onChange={e => set("name", e.target.value)} error={errs.name} autoFocus />
                                    <FloatingInput id="su-email" label="Email Address" type="email" icon="✉" value={form.email} onChange={e => set("email", e.target.value)} error={errs.email} />

                                    {/* Optional Phone + OTP — inline in signup */}
                                    <FloatingInput id="su-phone" label="Phone Number (optional, 10 digits)" type="tel" icon="📱" value={otpPhone} onChange={e => { setOtpPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setOtpError(""); }} />
                                    {otpPhone.trim().length >= 10 && !isLocked && (
                                        <div style={{ background: "rgba(59,111,255,0.06)", border: "1px solid rgba(59,111,255,0.2)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>📲 Verify phone number via OTP for instant access</div>
                                            {otpStep === "phone" && (
                                                <button onClick={handleSendOtp} disabled={otpLoading} style={{ padding: "10px 16px", background: "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 10, color: "white", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13, cursor: otpLoading ? "wait" : "pointer" }}>
                                                    {otpLoading ? "Sending..." : "Send OTP to Phone"}
                                                </button>
                                            )}
                                            {otpStep === "otp" && (
                                                <div style={{ display: "flex", gap: 8 }}>
                                                    <FloatingInput id="su-otp-code" label="6-Digit OTP" icon="🔑" value={otpCode} onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(""); }} onKeyDown={e => e.key === "Enter" && handleVerifyOtp(form.name.trim() || undefined)} autoFocus />
                                                    <button onClick={() => handleVerifyOtp(form.name.trim() || undefined)} disabled={otpLoading || otpCode.length < 6} style={{ padding: "0 16px", background: "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 10, color: "white", fontWeight: 700, cursor: otpLoading ? "wait" : "pointer", whiteSpace: "nowrap", fontSize: 13 }}>Verify</button>
                                                </div>
                                            )}
                                            {otpError && <div style={{ color: P.danger, fontSize: 12 }}>⚠ {otpError}</div>}
                                        </div>
                                    )}
                                    {isLocked && otpPhone.trim().length >= 10 && (
                                        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: 10, color: P.danger, fontSize: 12 }}>
                                            ⚠ Phone verification limit reached for today. Email verification will be sent after account creation.
                                        </div>
                                    )}

                                    <div>
                                        <FloatingInput id="su-pw" label="Password" type={showPw ? "text" : "password"} icon="🔒" value={form.password} onChange={e => set("password", e.target.value)} error={errs.password} rightSlot={pwToggle} autoComplete="new-password" />
                                        <StrengthBar password={form.password} />
                                    </div>

                                    {/* Role Selection */}
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Select Your Role</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                            {ROLES_LIST.map(r => {
                                                const cfg = ROLE_CONFIG[r];
                                                const sel = form.role === r;
                                                return (
                                                    <button key={r} onClick={() => set("role", r)} style={{
                                                        padding: "10px 10px", borderRadius: 12,
                                                        border: `1.5px solid ${sel ? cfg.color + "66" : "rgba(255,255,255,0.06)"}`,
                                                        background: sel ? cfg.color + "0d" : "rgba(255,255,255,0.02)",
                                                        cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                                                        fontFamily: "'Sora',sans-serif", transition: "all 0.2s",
                                                        boxShadow: sel ? `0 0 0 2px ${cfg.color}15` : "none",
                                                    }}>
                                                        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: sel ? cfg.color : "rgba(255,255,255,0.45)" }}>{cfg.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {errs.role && <span style={{ color: P.danger, fontSize: 11, marginTop: 4, display: "block" }}>{errs.role}</span>}
                                    </div>

                                    {serverErr && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {serverErr}</div>}

                                    <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px 0", background: loading ? "rgba(59,111,255,0.5)" : "linear-gradient(135deg,#3B6FFF,#6366F1)", border: "none", borderRadius: 14, color: "white", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15, cursor: loading ? "wait" : "pointer", boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s", letterSpacing: 0.3 }}>
                                        {loading ? <><span className="spinner" style={{ marginRight: 8 }} />Creating account...</> : "Create Account"}
                                    </button>
                                </form>

                                <div style={{ marginTop: 16, textAlign: "center" }}>
                                    <button type="button" onClick={() => setTab("signin")} style={{ background: "none", border: "none", color: P.primary, cursor: "pointer", fontWeight: 700, fontFamily: "'Sora',sans-serif", fontSize: 12 }}>Already have an account? Sign In</button>
                                </div>
                            </>
                        )}
                    </div>
                )
            }

            {/* Google Global Sign-In handler for Sign In email tab & Sign Up tab */}
            {
                tab !== "demo" && loginMethod === "email" && <GoogleAuthScript onSuccess={(res) => handleGoogleLogin(res, form.role)} onError={() => setServerErr("Google Login failed")} />
            }

            <p style={{ color: "rgba(255,255,255,0.12)", fontSize: 11, marginTop: 32, textAlign: "center", letterSpacing: 0.5 }}>
                NearMart v2.0 — Production Demo
            </p>

            {/* ── REMOVED: Standalone Phone tab replaced by Email/Phone toggle inside Sign In & Sign Up ── */}
            {
                false && (
                    <div style={cardStyle}>
                        <div style={{ textAlign: "center", marginBottom: 24 }}>
                            <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 6, color: "white" }}>📱 Phone Login</h2>
                            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0 }}>Sign in with OTP verification</p>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {otpStep === "phone" && (
                                <>
                                    {isLocked ? (
                                        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "20px", color: P.danger, fontSize: 14, fontWeight: 500, textAlign: "center", lineHeight: 1.5 }}>
                                            ⚠ Phone verification disabled for today.<br />Please use 'Sign In' with email to continue.
                                        </div>
                                    ) : (
                                        <>
                                            <FloatingInput id="otp-phone" label="Phone Number" type="tel" icon="📱" value={otpPhone}
                                                onChange={e => { setOtpPhone(e.target.value); setOtpError(""); }}
                                                onKeyDown={e => e.key === "Enter" && handleSendOtp()} autoFocus />

                                            {otpError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {otpError}</div>}

                                            <button onClick={handleSendOtp} disabled={otpLoading} style={{
                                                width: "100%", padding: "14px 0",
                                                background: otpLoading ? "rgba(59,111,255,0.5)" : "linear-gradient(135deg, #3B6FFF, #6366F1)",
                                                border: "none", borderRadius: 14, color: "white",
                                                fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15,
                                                cursor: otpLoading ? "wait" : "pointer",
                                                boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s",
                                            }}>
                                                {otpLoading ? <>Sending...</> : "Send OTP"}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}

                            {otpStep === "otp" && (
                                <>
                                    <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 8 }}>
                                        OTP sent to <strong style={{ color: P.primary }}>{otpPhone}</strong>
                                    </div>

                                    <FloatingInput id="otp-code" label="Enter 6-Digit OTP" icon="🔑" value={otpCode}
                                        onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(""); }}
                                        onKeyDown={e => e.key === "Enter" && handleVerifyOtp()} autoFocus />

                                    {otpError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {otpError}</div>}

                                    <button onClick={() => handleVerifyOtp()} disabled={otpLoading} style={{
                                        width: "100%", padding: "14px 0",
                                        background: otpLoading ? "rgba(59,111,255,0.5)" : "linear-gradient(135deg, #3B6FFF, #6366F1)",
                                        border: "none", borderRadius: 14, color: "white",
                                        fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15,
                                        cursor: otpLoading ? "wait" : "pointer",
                                        boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s",
                                    }}>
                                        {otpLoading ? <>Verifying...</> : "Verify OTP"}
                                    </button>

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <button onClick={() => setOtpStep("phone")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12 }}>← Change Number</button>
                                        <button onClick={handleSendOtp} disabled={otpCooldown > 0 || otpLoading}
                                            style={{ background: "none", border: "none", color: otpCooldown > 0 ? "rgba(255,255,255,0.2)" : P.primary, cursor: otpCooldown > 0 ? "default" : "pointer", fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700 }}>
                                            {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend OTP"}
                                        </button>
                                    </div>
                                </>
                            )}

                            {otpStep === "name" && (
                                <>
                                    <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 8 }}>
                                        Welcome! Please enter your name to complete registration.
                                    </div>

                                    <FloatingInput id="otp-name" label="Your Name" icon="👤" value={otpName}
                                        onChange={e => { setOtpName(e.target.value); setOtpError(""); }}
                                        onKeyDown={e => e.key === "Enter" && handleVerifyOtp()} autoFocus />

                                    {otpError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", color: P.danger, fontSize: 13, fontWeight: 500 }}>⚠ {otpError}</div>}

                                    <button onClick={() => handleVerifyOtp()} disabled={otpLoading || !otpName.trim()} style={{
                                        width: "100%", padding: "14px 0",
                                        background: !otpName.trim() ? "rgba(59,111,255,0.3)" : "linear-gradient(135deg, #3B6FFF, #6366F1)",
                                        border: "none", borderRadius: 14, color: "white",
                                        fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 15,
                                        cursor: !otpName.trim() ? "not-allowed" : "pointer",
                                        boxShadow: "0 8px 28px rgba(59,111,255,0.35)", transition: "all .25s",
                                    }}>
                                        {otpLoading ? <>Creating account...</> : "Complete Registration"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
        </div>
    );
}
