import React from "react";
import { T } from "../theme/theme";

/**
 * Generic bottom tab bar shown only on mobile (< 1024px).
 * items: [{ icon, label, key }]
 * activeKey, onSelect: string → void
 * accentColor: valid CSS color
 */
export function MobileNav({ items, activeKey, onSelect, accentColor = T.gold }) {
    return (
        <nav className="mobile-nav" aria-label="Bottom Navigation">
            {items.map(item => (
                <button
                    key={item.key}
                    className={`mobile-nav-btn ${activeKey === item.key ? "active" : ""}`}
                    onClick={() => onSelect(item.key)}
                    style={{ "--nav-accent": accentColor }}
                    aria-current={activeKey === item.key ? "page" : undefined}
                >
                    <span className="mobile-nav-icon">{item.icon}</span>
                    <span className="mobile-nav-label">{item.label}</span>
                    {item.count ? <span className="mobile-nav-count">{item.count}</span> : null}
                </button>
            ))}
        </nav>
    );
}

/**
 * Hamburger button shown on mobile for menus that have many items.
 */
export function HamburgerBtn({ open, onClick, color = T.gold }) {
    return (
        <button
            className="hamburger-btn"
            onClick={onClick}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            style={{ "--hbg-color": color }}
        >
            <span className={`hbg-line ${open ? "open" : ""}`} />
            <span className={`hbg-line ${open ? "open" : ""}`} />
            <span className={`hbg-line ${open ? "open" : ""}`} />
        </button>
    );
}
