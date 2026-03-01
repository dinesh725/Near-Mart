import React, { useState, useCallback, useEffect } from "react";
import { P } from "../theme/theme";

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || "";
const MAPBOX_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const SAVED_KEY = "nm_saved_addresses";

function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}
function saveSaved(list) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 8))); } catch { }
}

/**
 * AddressPicker — Three modes: GPS | Search | Saved
 * Calls onSelect({ lat, lng, address }) when user confirms an address
 */
export function AddressPicker({ value, onSelect, onClose }) {
    const [tab, setTab] = useState("gps"); // "gps" | "search" | "saved"
    const [gpsState, setGpsState] = useState("idle"); // "idle" | "loading" | "done" | "error"
    const [gpsResult, setGpsResult] = useState(null);
    const [gpsError, setGpsError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [savedAddresses, setSavedAddresses] = useState(loadSaved);
    const [selected, setSelected] = useState(value || null);

    // ── GPS Detect ────────────────────────────────────────────────────────────
    const detectGPS = useCallback(async () => {
        if (!navigator.geolocation) {
            setGpsError("GPS is not supported on this device.");
            setGpsState("error");
            return;
        }
        setGpsState("loading");
        setGpsError("");

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                try {
                    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    if (MAPBOX_TOKEN) {
                        const url = `${MAPBOX_BASE}/${lng},${lat}.json?limit=1&language=en&access_token=${MAPBOX_TOKEN}`;
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.features && data.features.length > 0) address = data.features[0].place_name;
                    }
                    const result = { lat, lng, address };
                    setGpsResult(result);
                    setSelected(result);
                    setGpsState("done");
                } catch {
                    const result = { lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
                    setGpsResult(result);
                    setSelected(result);
                    setGpsState("done");
                }
            },
            (err) => {
                setGpsError(
                    err.code === 1 ? "Location permission denied. Please allow access in browser settings." :
                        err.code === 2 ? "Location unavailable. Try Search instead." :
                            "Location request timed out. Try Search instead."
                );
                setGpsState("error");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    }, []);

    // Auto-detect on GPS tab open
    useEffect(() => {
        if (tab === "gps" && gpsState === "idle") {
            detectGPS();
        }
    }, [tab, gpsState, detectGPS]);

    // ── Nominatim Search ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.length < 3) { setSearchResults([]); return; }

        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const q = encodeURIComponent(searchQuery);
                if (!MAPBOX_TOKEN) { setSearchResults([]); setSearchLoading(false); return; }
                const url = `${MAPBOX_BASE}/${q}.json?limit=6&language=en&country=in&access_token=${MAPBOX_TOKEN}`;
                const res = await fetch(url);
                const data = await res.json();
                setSearchResults((data.features || []).map(f => ({
                    lat: f.center[1],
                    lng: f.center[0],
                    address: f.place_name,
                    type: f.place_type?.[0] || "place",
                })));
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ── Save to localStorage ──────────────────────────────────────────────────
    const handleConfirm = useCallback(() => {
        if (!selected) return;
        // Save to recents
        const saved = loadSaved();
        const already = saved.find(s => Math.abs(s.lat - selected.lat) < 0.0001 && Math.abs(s.lng - selected.lng) < 0.0001);
        if (!already) {
            const updated = [selected, ...saved];
            saveSaved(updated);
            setSavedAddresses(updated);
        }
        onSelect(selected);
        onClose?.();
    }, [selected, onSelect, onClose]);



    const TABS = [
        { id: "gps", label: "📍 GPS", icon: "📍" },
        { id: "search", label: "🔍 Search", icon: "🔍" },
        { id: "saved", label: "🏠 Saved", icon: "🏠" },
    ];

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: "var(--z-modal, 9000)",
            background: "rgba(0,0,0,0.6)", display: "flex", flexDirection: "column",
            justifyContent: "flex-end", alignItems: "center",
        }} onClick={onClose}>
            <div style={{
                background: P.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                width: "100%", maxWidth: 560,
                height: "auto", maxHeight: "calc(100vh - 20px)",
                display: "grid", gridTemplateRows: "auto 1fr auto", /* CRITICAL: Header, Scrollable Content, Footer */
                boxShadow: "0 -10px 50px rgba(0,0,0,0.5)",
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>📍 Delivery Address</div>
                        <button onClick={onClose} style={{ background: "none", border: "none", color: P.textMuted, fontSize: 22, cursor: "pointer" }}>✕</button>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 8 }}>
                        {TABS.map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)} style={{
                                flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 700,
                                background: tab === t.id ? P.primary : P.surface,
                                color: tab === t.id ? "white" : P.textMuted,
                                border: `1px solid ${tab === t.id ? P.primary : P.border}`,
                                borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                                transition: "all .2s",
                            }}>{t.label}</button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div style={{ overflowY: "auto", padding: "16px 20px" }}>

                    {/* ── GPS Tab ── */}
                    {tab === "gps" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {gpsState === "loading" && (
                                <div style={{ textAlign: "center", padding: "32px 0", color: P.textMuted }}>
                                    <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: "0 auto 16px" }} />
                                    <div style={{ fontWeight: 600 }}>Detecting your location...</div>
                                    <div style={{ fontSize: 12, marginTop: 8 }}>Allow location access when prompted</div>
                                </div>
                            )}

                            {gpsState === "error" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div style={{ background: P.danger + "15", border: `1px solid ${P.danger}33`, borderRadius: 12, padding: 16 }}>
                                        <div style={{ fontWeight: 700, color: P.danger, marginBottom: 6 }}>⚠️ Location Error</div>
                                        <div style={{ fontSize: 13, color: P.textMuted }}>{gpsError}</div>
                                    </div>
                                    <button onClick={detectGPS} className="p-btn p-btn-primary w-100">
                                        🔄 Try Again
                                    </button>
                                    <button onClick={() => setTab("search")} className="p-btn p-btn-ghost w-100">
                                        🔍 Search Address Instead
                                    </button>
                                </div>
                            )}

                            {gpsState === "done" && gpsResult && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div style={{
                                        background: P.success + "15", border: `1px solid ${P.success}33`,
                                        borderRadius: 14, padding: 16,
                                        cursor: "pointer", transition: "all .2s",
                                        outline: selected?.lat === gpsResult.lat ? `2px solid ${P.success}` : "none",
                                    }} onClick={() => setSelected(gpsResult)}>
                                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                            <div style={{ fontSize: 28, flexShrink: 0 }}>📍</div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Current Location</div>
                                                <div style={{ fontSize: 12, color: P.textMuted, lineHeight: 1.5 }}>{gpsResult.address}</div>
                                                <div style={{ fontSize: 11, color: P.textMuted, marginTop: 6, fontFamily: "monospace" }}>
                                                    {gpsResult.lat.toFixed(5)}, {gpsResult.lng.toFixed(5)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={detectGPS} className="p-btn p-btn-ghost" style={{ fontSize: 12 }}>
                                        🔄 Refresh Location
                                    </button>
                                </div>
                            )}

                            {gpsState === "idle" && (
                                <div style={{ textAlign: "center", padding: "32px 0" }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>📍</div>
                                    <button onClick={detectGPS} className="p-btn p-btn-primary">Detect My Location</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Search Tab ── */}
                    {tab === "search" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <input
                                autoFocus className="p-input"
                                placeholder="Search area, street, landmark..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ fontSize: 14 }}
                            />
                            {searchLoading && (
                                <div style={{ fontSize: 13, color: P.textMuted, textAlign: "center", padding: "12px 0" }}>
                                    🔍 Searching...
                                </div>
                            )}
                            {searchResults.map((r) => (
                                <button key={`${r.lat}-${r.lng}`} onClick={() => setSelected(r)} style={{
                                    display: "flex", alignItems: "flex-start", gap: 10,
                                    padding: "12px 14px", borderRadius: 12, textAlign: "left", width: "100%",
                                    background: selected?.lat === r.lat ? P.primary + "15" : P.surface,
                                    border: `1px solid ${selected?.lat === r.lat ? P.primary : P.border}`,
                                    cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
                                }}>
                                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>📍</span>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: P.text, marginBottom: 2 }}>
                                            {r.address.split(",")[0]}
                                        </div>
                                        <div style={{ fontSize: 11, color: P.textMuted, lineHeight: 1.4 }}>
                                            {r.address.split(",").slice(1, 4).join(",")}
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {searchQuery.length >= 3 && !searchLoading && searchResults.length === 0 && (
                                <div style={{ fontSize: 13, color: P.textMuted, textAlign: "center", padding: "16px 0" }}>
                                    No results found. Try a different search term.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Saved Tab ── */}
                    {tab === "saved" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {savedAddresses.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
                                    <div style={{ color: P.textMuted, fontSize: 14 }}>
                                        No saved addresses yet.<br />GPS-detected or searched addresses will appear here.
                                    </div>
                                    <button onClick={() => setTab("gps")} className="p-btn p-btn-primary" style={{ marginTop: 16 }}>
                                        Detect Current Location
                                    </button>
                                </div>
                            ) : savedAddresses.map((addr, i) => (
                                <button key={`saved-${addr.lat}-${addr.lng}`} onClick={() => setSelected(addr)} style={{
                                    display: "flex", alignItems: "flex-start", gap: 12,
                                    padding: "12px 14px", borderRadius: 12, textAlign: "left", width: "100%",
                                    background: selected?.lat === addr.lat ? P.primary + "15" : P.surface,
                                    border: `1px solid ${selected?.lat === addr.lat ? P.primary : P.border}`,
                                    cursor: "pointer", fontFamily: "inherit", transition: "all .2s",
                                }}>
                                    <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{i === 0 ? "🏠" : "📍"}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: P.text, marginBottom: 2 }}>
                                            {addr.address.split(",")[0]}
                                        </div>
                                        <div style={{ fontSize: 11, color: P.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {addr.address.split(",").slice(1, 3).join(",")}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Selected Preview + Confirm */}
                {selected && (
                    <div style={{ padding: "14px 20px 20px", borderTop: `1px solid ${P.border}`, flexShrink: 0, background: P.bg }}>
                        <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Selected Address
                        </div>
                        <div style={{
                            background: P.primary + "12", border: `1px solid ${P.primary}33`,
                            borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: P.text, lineHeight: 1.4,
                        }}>
                            <span style={{ marginRight: 8 }}>📍</span>
                            {selected.address.length > 80 ? selected.address.slice(0, 80) + "…" : selected.address}
                        </div>
                        <button className="p-btn p-btn-primary w-100" style={{ minHeight: 46, fontSize: 15, fontWeight: 700 }} onClick={handleConfirm}>
                            ✓ Confirm Delivery Address
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AddressPicker;
