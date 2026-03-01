import React, { useState, useEffect } from 'react';
import { T } from "../../theme/theme";
import api from "../../api/client";

/**
 * EmailVerifyPage — handles the email verification link flow.
 * When a user clicks the link from their email, this page:
 *  1. Extracts the token from the URL query string
 *  2. Calls the backend GET /auth/verify-email/:token
 *  3. Shows success or error state
 */
export function EmailVerifyPage() {
    const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
    const [message, setMessage] = useState("");

    useEffect(() => {
        const verify = async () => {
            const params = new URLSearchParams(window.location.search || window.location.hash?.split("?")[1]);
            const token = params.get("token");

            if (!token) {
                setStatus("error");
                setMessage("Missing verification token.");
                return;
            }

            try {
                const res = await api.get(`/auth/verify-email/${token}`);
                if (res.ok) {
                    setStatus("success");
                    setMessage(res.message || "Email verified successfully!");
                } else {
                    setStatus("error");
                    setMessage(res.error || "Invalid or expired verification token.");
                }
            } catch {
                setStatus("error");
                setMessage("Network error. Please try again.");
            }
        };

        verify();
    }, []);

    return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "100vh", padding: 20, background: T.surface, color: T.text
        }}>
            <div style={{
                background: T.card, padding: 40, borderRadius: 16, width: "100%", maxWidth: 420,
                border: `1px solid ${T.border}`, textAlign: "center"
            }}>
                {status === "verifying" && (
                    <>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                        <h2 style={{ color: T.gold, marginBottom: 8 }}>Verifying Email...</h2>
                        <p style={{ color: T.textMuted, fontSize: 14 }}>Please wait while we verify your email address.</p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                        <h2 style={{ color: "#10b981", marginBottom: 8 }}>Email Verified!</h2>
                        <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 24 }}>{message}</p>
                        <button
                            onClick={() => { window.location.replace("/"); }}
                            style={{
                                padding: "12px 32px", background: T.gold, color: "#000",
                                border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", fontSize: 15
                            }}
                        >
                            Go to Dashboard
                        </button>
                    </>
                )}

                {status === "error" && (
                    <>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
                        <h2 style={{ color: "#ef4444", marginBottom: 8 }}>Verification Failed</h2>
                        <p style={{ color: T.textMuted, fontSize: 14, marginBottom: 24 }}>{message}</p>
                        <button
                            onClick={() => { window.location.href = "/#/login"; }}
                            style={{
                                padding: "12px 32px", background: T.border, color: T.text,
                                border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", fontSize: 15
                            }}
                        >
                            Back to Login
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
