import React, { useState } from "react";
import { T } from "../theme/theme";

/**
 * Usage: <Tooltip text="Gross Merchandise Value — total sales revenue before deductions." />
 * Renders a small ⓘ icon; shows the tooltip on hover/focus.
 */
export default function Tooltip({ text }) {
    const [show, setShow] = useState(false);
    return (
        <span
            style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 5, cursor: "help" }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onFocus={() => setShow(true)}
            onBlur={() => setShow(false)}
            tabIndex={0}
            aria-label={text}
        >
            <span style={{
                width: 15, height: 15, borderRadius: "50%",
                background: T.borderLt, color: T.textSub,
                fontSize: 9, fontWeight: 800, display: "flex",
                alignItems: "center", justifyContent: "center",
                lineHeight: 1, userSelect: "none",
            }}>?</span>

            {show && (
                <span style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: T.card, border: `1px solid ${T.borderLt}`,
                    borderRadius: 9, padding: "8px 12px",
                    fontSize: 11, color: T.textSub, fontWeight: 500,
                    maxWidth: 220, width: "max-content", lineHeight: 1.5,
                    boxShadow: "0 8px 24px rgba(0,0,0,.5)",
                    zIndex: 9999, pointerEvents: "none", whiteSpace: "pre-wrap",
                }}>
                    {text}
                    <span style={{
                        position: "absolute", top: "100%", left: "50%",
                        transform: "translateX(-50%)",
                        border: "5px solid transparent",
                        borderTopColor: T.borderLt,
                    }} />
                </span>
            )}
        </span>
    );
}
