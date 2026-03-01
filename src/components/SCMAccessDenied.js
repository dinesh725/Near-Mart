import React from "react";
import { P } from "../theme/theme";
import { useAuth } from "../auth/AuthContext";

export function SCMAccessDenied() {
    const { user } = useAuth();
    return (
        <div style={{
            minHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 24,
            background: P.bg,
        }}>
            {/* lock icon */}
            <div style={{
                width: 80, height: 80, borderRadius: 24,
                background: `${P.danger}15`, border: `2px solid ${P.danger}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, marginBottom: 24,
                boxShadow: `0 0 40px ${P.danger}22`,
            }}>🔒</div>

            <h1 style={{ fontWeight: 800, fontSize: 22, color: P.text, marginBottom: 8 }}>
                Access Restricted
            </h1>
            <p style={{ color: P.textMuted, fontSize: 14, textAlign: "center", maxWidth: 340, lineHeight: 1.7, marginBottom: 24 }}>
                The <strong style={{ color: P.text }}>Supply Chain Management</strong> module is only
                available to <strong style={{ color: P.text }}>Sellers, Vendors, Support Agents, and Admins</strong>.
            </p>

            <div style={{
                background: P.card, border: `1px solid ${P.border}`, borderRadius: 14,
                padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, marginBottom: 28
            }}>
                <div style={{
                    width: 38, height: 38, borderRadius: "50%", background: `${P.danger}22`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: P.danger
                }}>
                    {user?.avatar}
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.name}</div>
                    <div style={{ fontSize: 12, color: P.danger, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        {user?.role} — No SCM Access
                    </div>
                </div>
            </div>

            <p style={{ fontSize: 12, color: P.textMuted }}>
                Contact your administrator to request access.
            </p>
        </div>
    );
}
