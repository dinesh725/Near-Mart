import React from "react";
import { useNetwork } from "../hooks/useNetwork";

/**
 * OfflineBanner — slim top-banner that appears when the device goes offline
 * and shows a brief "Back online!" confirmation when reconnected.
 */
export function OfflineBanner() {
    const { isOnline, wasOffline } = useNetwork();

    if (isOnline && !wasOffline) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100000,
                padding: "8px 16px",
                textAlign: "center",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "'Sora', sans-serif",
                color: "white",
                background: isOnline
                    ? "linear-gradient(135deg, #22c55e, #16a34a)"
                    : "linear-gradient(135deg, #ef4444, #dc2626)",
                transition: "all .3s ease",
                animation: "slideDown .3s ease",
            }}
        >
            {isOnline ? "✅ Back online!" : "📡 You're offline — some features may be unavailable"}
            <style>{`@keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        </div>
    );
}
