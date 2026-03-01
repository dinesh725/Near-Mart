import React from "react";
import { T } from "../theme/theme";

/**
 * LoadingFallback — branded loading spinner shown during React.lazy() chunk downloads.
 */
export function LoadingFallback() {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "60vh",
                gap: 16,
                color: T.textMuted,
                fontFamily: "'Sora', sans-serif",
            }}
        >
            <div
                style={{
                    width: 40,
                    height: 40,
                    border: `3px solid ${T.border}`,
                    borderTopColor: T.primary,
                    borderRadius: "50%",
                    animation: "spin .8s linear infinite",
                }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Loading…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}
