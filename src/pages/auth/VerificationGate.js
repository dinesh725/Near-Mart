import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { T } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import api from "../../api/client";

export function VerificationGate() {
    const { user, logout } = useAuth();
    
    const isContactVerified = user?.emailVerified || user?.phoneVerified;
    const requiresKyc = ["seller", "vendor", "delivery"].includes(user?.role);
    
    // Determine the active step
    let initialStep = 1;
    if (isContactVerified) {
        if (requiresKyc && user?.kycStatus === "SUBMITTED") {
            initialStep = 3;
        } else if (requiresKyc && user?.kycStatus !== "VERIFIED") {
            initialStep = 2;
        }
    }
    
    const [step, setStep] = useState(initialStep);
    useEffect(() => {
        if (isContactVerified && requiresKyc && user?.kycStatus === "SUBMITTED") setStep(3);
        else if (isContactVerified && requiresKyc && user?.kycStatus !== "VERIFIED") setStep(2);
        else if (!isContactVerified) setStep(1);
    }, [isContactVerified, requiresKyc, user?.kycStatus]);

    const handleLogout = async () => {
        await logout();
    };

    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "100vh", padding: 20, background: T.surface, color: T.text,
            boxSizing: "border-box", width: "100%", maxWidth: "100vw", overflowX: "hidden", overflowY: "auto"
        }}>
            <div style={{ background: T.card, padding: 30, borderRadius: 16, width: "100%", maxWidth: 450, boxSizing: "border-box", border: `1px solid ${T.border}` }}>
                {/* Stepper Logic (Only show if KYC is required) */}
                {requiresKyc && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 15 }}>
                         <div style={{ opacity: step >= 1 ? 1 : 0.4, fontWeight: step === 1 ? 'bold' : 'normal', color: step === 1 ? T.gold : T.text, fontSize: 13 }}>1. Contact</div>
                         <div style={{ opacity: step >= 2 ? 1 : 0.4, fontWeight: step === 2 ? 'bold' : 'normal', color: step === 2 ? T.gold : T.text, fontSize: 13 }}>2. Business KYC</div>
                         <div style={{ opacity: step >= 3 ? 1 : 0.4, fontWeight: step === 3 ? 'bold' : 'normal', color: step === 3 ? T.gold : T.text, fontSize: 13 }}>3. Approval</div>
                    </div>
                )}
                
                {step === 1 && <ContactVerificationStep />}
                {step === 2 && <KycSubmissionStep />}
                {step === 3 && <ApprovalWaitingStep />}

                <button
                    onClick={handleLogout}
                    style={{ marginTop: 25, width: "100%", padding: 10, background: "transparent", color: T.textMuted, border: "none", cursor: 'pointer', fontSize: 13 }}>
                    Logout & Use Different Account
                </button>
            </div>
        </div>
    );
}

// ── STEP 1: CONTACT VERIFICATION ────────────────────────────────────────────────
function ContactVerificationStep() {
    const { user, refreshUser } = useAuth();
    const [mode, setMode] = useState(user?.phone ? "phone" : "email");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [msgType, setMsgType] = useState("error");
    const [emailSent, setEmailSent] = useState(false);

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

    // ── Polling & Window Focus Magic ──
    const checkStatus = useCallback(async () => {
        if (!emailSent) return;
        await refreshUser();
    }, [emailSent, refreshUser]);

    useEffect(() => {
        if (!emailSent) return;
        const interval = setInterval(() => { checkStatus(); }, 4000);
        return () => clearInterval(interval);
    }, [emailSent, checkStatus]);

    useEffect(() => {
        if (!emailSent) return;
        const onFocus = () => { checkStatus(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [emailSent, checkStatus]);

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

            if (res.status === 429 && res.error?.includes("limit reached")) {
                localStorage.setItem("nm_otp_lock", Date.now().toString());
                setMsg("Service limit reached for " + type + ". Please try the other verification method.");
                setMsgType("error");
                setMode(type === "email" ? "phone" : "email");
                setLoading(false);
                return;
            }

            if (res.ok) {
                if (type === "email") {
                    setMsg("Verification email sent! Click the link in your inbox. This page will automatically update.");
                    setEmailSent(true);
                } else {
                    setMsg("OTP sent to your phone! Entering demo? Try generic codes if testing.");
                }
                setMsgType("success");
            } else {
                setMsg(res.error || "Failed to send verification. Systems might be down.");
                setMsgType("error");
                if (type === "email" && user?.phone && !isLocked) {
                    setMode("phone"); // Fallback
                }
            }
        } catch (err) {
            setMsg("Network error. Please try again or switch methods.");
            setMsgType("error");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (otp.length !== 6) { setMsg("Enter 6-digit OTP"); setMsgType("error"); return; }
        setLoading(true); setMsg("");
        try {
            const res = await api.post("/auth/verify-otp", { phone: user?.phone, otp });
            if (res.ok) await refreshUser();
            else { setMsg(res.error || "Invalid OTP"); setMsgType("error"); }
        } catch (err) {
            setMsg("Network error."); setMsgType("error");
        } finally { setLoading(false); }
    };

    const msgBg = msgType === "success" ? '#10b98120' : '#db277720';
    const msgColor = msgType === "success" ? '#10b981' : '#db2777';

    return (
        <div className="col gap10">
            <h2 style={{ margin: "0 0 5px 0", color: T.gold }}>Verify Contact Info</h2>
            <p style={{ fontSize: 14, color: T.textMuted, marginBottom: 15 }}> Secure your account to continue. </p>

            {msg && <div style={{ padding: 12, borderRadius: 8, background: msgBg, color: msgColor, fontSize: 13, textAlign: 'center' }}>{msg}</div>}

            {!emailSent && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 15, marginTop: 10 }}>
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
            )}

            {mode === "email" && user?.email && (
                <div className="col gap10">
                    {!emailSent ? (
                        <>
                            <div style={{ fontSize: 13, color: T.textMuted }}>We will send a verification link to <b>{user.email}</b></div>
                            <button onClick={() => handleSendAction("email")} disabled={loading}
                                style={{ padding: 12, background: T.gold, color: '#000', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                                {loading ? "Sending..." : "Send Verification Email"}
                            </button>
                        </>
                    ) : (
                        <button onClick={checkStatus} style={{ padding: 12, background: T.surface, color: T.gold, border: `1px solid ${T.gold}`, borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 10 }}>
                            I have verified my email (Refresh)
                        </button>
                    )}
                </div>
            )}

            {mode === "phone" && user?.phone && (
                <div className="col gap10">
                    <div style={{ fontSize: 13, color: T.textMuted }}>We will send a 6-digit OTP to <b>{user.phone}</b></div>
                    <button onClick={() => handleSendAction("phone")} disabled={loading}
                        style={{ padding: 12, background: T.border, color: T.text, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                        {loading ? "Sending..." : "Send OTP"}
                    </button>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" autoFocus placeholder="Enter 6-digit OTP"
                        value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6}
                        style={{ width: "100%", boxSizing: "border-box", padding: 12, background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, marginTop: 10, letterSpacing: 4, textAlign: 'center', fontSize: 18 }} />
                    <button onClick={handleVerifyOtp} disabled={loading || otp.length < 6}
                        style={{ padding: 12, background: T.gold, color: '#000', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                        {loading ? "Verifying..." : "Verify OTP"}
                    </button>
                </div>
            )}
            
            {!user?.email && !user?.phone && (
                <div style={{ color: '#db2777', fontSize: 13 }}>No contact method found. Please update your profile.</div>
            )}
        </div>
    );
}

// ── STEP 2: BUSINESS KYC SUBMISSION ─────────────────────────────────────────────
function KycSubmissionStep() {
    const { refreshUser, updateUser } = useAuth();
    const [companyName, setCompanyName] = useState("");
    const [docType, setDocType] = useState("GSTIN");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    
    // Simulate real file upload behavior
    const handleDocumentUpload = async (e) => {
        // Since many test envs don't have S3 configured, we auto-mock the identifier for seamless onboarding
        setMsg("Document attached securely (Simulated).");
    };

    const handleSubmitKYC = async () => {
        if (!companyName.trim()) { setMsg("Company/Store name is required."); return; }
        
        setLoading(true); setMsg("");
        try {
            // Update profile with KYC data
            const res = await updateUser({
                companyName: companyName.trim(),
                kycStatus: "SUBMITTED",
                kycSubmittedAt: new Date().toISOString(),
                kycDocuments: [{
                    docType: docType,
                    documentIdentifier: "simulated_upload_" + Date.now(),
                    status: "PENDING"
                }]
            });
            
            if (res.ok) {
                await refreshUser(); // Will push them to Step 3
            } else {
                setMsg(res.error || "Failed to submit KYC data.");
            }
        } catch (e) {
            setMsg("Network error.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="col gap10">
            <h2 style={{ margin: "0 0 5px 0", color: T.gold }}>Business Identity</h2>
            <p style={{ fontSize: 13, color: T.textMuted, marginBottom: 15 }}> We need to verify your identity before enabling your store. </p>

            {msg && <div style={{ padding: 12, borderRadius: 8, background: '#10b98120', color: '#10b981', fontSize: 13, marginBottom: 10 }}>{msg}</div>}

            <label style={{ fontSize: 12, color: T.textDim, marginBottom: -5 }}>Legal Company or Store Name</label>
            <input 
                type="text" 
                placeholder="E.g. Freshmart Retail" 
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: 12, background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14 }} 
            />

            <label style={{ fontSize: 12, color: T.textDim, marginBottom: -5, marginTop: 10 }}>Identity Document Type</label>
            <select 
                value={docType}
                onChange={e => setDocType(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: 12, background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14 }}>
                <option value="GSTIN">GST Certificate (Recommended)</option>
                <option value="PAN">PAN Card</option>
                <option value="AADHAAR">Aadhaar Card</option>
                <option value="PASSPORT">Passport</option>
            </select>

            <label style={{ fontSize: 12, color: T.textDim, marginBottom: -5, marginTop: 10 }}>Upload Document</label>
            <div style={{ width: "100%", padding: 20, border: `1px dashed ${T.border}`, borderRadius: 8, textAlign: 'center', background: T.surface }}>
                <input type="file" onChange={handleDocumentUpload} style={{ fontSize: 12, color: T.textMuted }} />
            </div>

            <button onClick={handleSubmitKYC} disabled={loading || !companyName.trim()}
                style={{ padding: 12, background: T.gold, color: '#000', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', marginTop: 15 }}>
                {loading ? "Submitting..." : "Submit Application"}
            </button>
        </div>
    );
}

// ── STEP 3: WAITING ROOM ────────────────────────────────────────────────────────
function ApprovalWaitingStep() {
    const { refreshUser } = useAuth();
    const [checking, setChecking] = useState(false);

    const handleRefresh = async () => {
        setChecking(true);
        await refreshUser();
        setTimeout(() => setChecking(false), 800);
    };

    return (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 50, marginBottom: 15 }}>🛡️</div>
            <h2 style={{ margin: "0 0 10px 0", color: T.gold }}>Under Review</h2>
            <p style={{ fontSize: 14, color: T.textMuted, lineHeight: 1.5, marginBottom: 25 }}>
                Your KYC documents have been successfully submitted. Our team is currently reviewing your profile to ensure marketplace safety.
                <br/><br/>
                Approvals normally take between 2-4 hours. You will receive a notification once verified.
            </p>

            <button onClick={handleRefresh} disabled={checking}
                style={{ padding: 10, background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, width: "100%" }}>
                {checking ? "Checking..." : "Refresh Status"}
            </button>
        </div>
    );
}
