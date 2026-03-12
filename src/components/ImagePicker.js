import React, { useState, useRef, useCallback } from "react";
import { P } from "../theme/theme";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const TAB_STYLE = (active, color = P.primary) => ({
    flex: 1, padding: "9px 0", background: active ? color : "none",
    border: "none", borderRadius: 8, color: active ? "white" : P.textMuted,
    fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 12,
    cursor: "pointer", transition: "all 0.2s ease",
});

export function ImagePicker({ productName = "", currentUrl = "", onSelect, onClose }) {
    const [tab, setTab] = useState("upload");
    const [urlInput, setUrlInput] = useState(currentUrl || "");
    const [preview, setPreview] = useState(currentUrl || "");
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(currentUrl || "");
    const fileRef = useRef(null);

    // ── Upload to Cloudinary via backend ─────────────────────────────────────
    const handleFile = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { setError("Please select an image file"); return; }
        if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5 MB"); return; }

        setError("");
        setLoading(true);
        setUploadProgress(0);

        // Show local preview immediately
        const localUrl = URL.createObjectURL(file);
        setPreview(localUrl);

        try {
            const token = localStorage.getItem("nm_access_token");
            
            // 1. Fetch Cloudinary signature from our Node backend
            const sigRes = await fetch(`${API_BASE}/upload/signature`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ folder: 'nearmart/products' })
            });

            const sigData = await sigRes.json();
            if (!sigData.ok || !sigData.signature) {
                throw new Error("Failed to get secure upload signature");
            }

            // 2. Upload directly from Browser memory to Cloudinary AWS CDN
            const formData = new FormData();
            formData.append("file", file);
            formData.append("api_key", sigData.apiKey);
            formData.append("timestamp", sigData.timestamp);
            formData.append("signature", sigData.signature);
            formData.append("folder", "nearmart/products");

            // Use XMLHttpRequest for progress tracking
            const result = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`);

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        setUploadProgress(Math.round((e.loaded / e.total) * 100));
                    }
                };

                xhr.onload = () => {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
                            resolve(data);
                        } else {
                            reject(new Error(data.error?.message || "Cloudinary Upload failed"));
                        }
                    } catch {
                        reject(new Error("Invalid response from Cloudinary"));
                    }
                };

                xhr.onerror = () => reject(new Error("Network error — check your connection"));
                xhr.ontimeout = () => reject(new Error("Upload timed out"));
                xhr.timeout = 30000;
                xhr.send(formData);
            });

            // Use Cloudinary CDN URL securely formatted
            setPreview(result.secure_url);
            setSelected(result.secure_url);
            setUploadProgress(100);
        } catch (err) {
            setError(err.message || "Upload failed");
            setPreview("");
            setSelected("");
        } finally {
            setLoading(false);
            URL.revokeObjectURL(localUrl);
        }
    }, []);

    // ── URL input ─────────────────────────────────────────────────────────────
    const handleUrlChange = (v) => {
        setUrlInput(v);
        setError("");
        if (v.startsWith("http")) { setSelected(v); setPreview(v); }
    };

    const handleSave = () => {
        if (selected) onSelect(selected);
    };

    const handleRemove = () => { onSelect(null); };

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 16 }}>
            <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, width: "100%", maxWidth: 440, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}>
                {/* Header */}
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>🖼 Product Image</div>
                        <div style={{ color: P.textMuted, fontSize: 12, marginTop: 2 }}>{productName}</div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
                </div>

                {/* Preview strip */}
                <div style={{ background: P.surface, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${P.border}` }}>
                    <div style={{ width: 64, height: 64, borderRadius: 12, border: `2px dashed ${preview ? P.primary : P.border}`, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: P.bg }}>
                        {preview
                            ? <img src={preview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setPreview("")} />
                            : <span style={{ fontSize: 24 }}>📷</span>
                        }
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 4 }}>Preview</div>
                        {preview
                            ? <div style={{ fontSize: 11, color: P.success }}>✓ Image ready to save</div>
                            : <div style={{ fontSize: 11, color: P.textMuted }}>No image selected yet</div>
                        }
                    </div>
                    {currentUrl && (
                        <button onClick={handleRemove} style={{ background: `${P.danger}15`, border: `1px solid ${P.danger}33`, borderRadius: 8, color: P.danger, fontSize: 12, padding: "6px 10px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 600 }}>
                            Remove
                        </button>
                    )}
                </div>

                {/* Tab bar */}
                <div style={{ display: "flex", background: P.surface, padding: "6px 12px", gap: 6, borderBottom: `1px solid ${P.border}` }}>
                    {[["upload", "📁 Upload"], ["url", "🔗 URL"]].map(([k, l]) => (
                        <button key={k} style={TAB_STYLE(tab === k)} onClick={() => { setTab(k); setError(""); }}>{l}</button>
                    ))}
                </div>

                {/* Tab content */}
                <div style={{ padding: 20, minHeight: 180 }}>
                    {/* UPLOAD */}
                    {tab === "upload" && (
                        <div style={{ textAlign: "center" }}>
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} id="img-upload" />
                            <div onClick={() => !loading && fileRef.current?.click()} style={{
                                border: `2px dashed ${P.primary}66`, borderRadius: 14,
                                padding: "32px 16px", cursor: loading ? "default" : "pointer",
                                transition: "all 0.2s", background: `${P.primary}05`,
                                opacity: loading ? 0.7 : 1,
                            }}>
                                {loading ? (
                                    <>
                                        <div style={{ fontSize: 36, marginBottom: 10 }}>☁️</div>
                                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Uploading to cloud...</div>
                                        {/* Progress bar */}
                                        <div style={{ width: "80%", margin: "0 auto", height: 6, background: P.border, borderRadius: 3, overflow: "hidden" }}>
                                            <div style={{
                                                height: "100%", background: P.primary,
                                                borderRadius: 3, width: `${uploadProgress}%`,
                                                transition: "width 0.3s ease",
                                            }} />
                                        </div>
                                        <div style={{ color: P.textMuted, fontSize: 12, marginTop: 6 }}>{uploadProgress}%</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: 36, marginBottom: 10 }}>📤</div>
                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Click to upload image</div>
                                        <div style={{ color: P.textMuted, fontSize: 12 }}>JPG, PNG, WebP · Max 5 MB</div>
                                        <div style={{ color: P.textMuted, fontSize: 11, marginTop: 4 }}>Auto-compressed & optimized via CDN</div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* URL */}
                    {tab === "url" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div className="p-field">
                                <label htmlFor="img-url-in">Image URL</label>
                                <input id="img-url-in" type="url" className="p-input" placeholder="https://example.com/tomato.jpg" value={urlInput} onChange={e => handleUrlChange(e.target.value)} />
                            </div>
                            {urlInput && !urlInput.startsWith("http") && (
                                <div style={{ fontSize: 12, color: P.warning }}>⚠ Must start with https://</div>
                            )}
                        </div>
                    )}

                    {/* Error message */}
                    {error && (
                        <div style={{ marginTop: 12, padding: "8px 12px", background: `${P.danger}15`, border: `1px solid ${P.danger}33`, borderRadius: 8, color: P.danger, fontSize: 12, fontWeight: 600 }}>
                            ⚠ {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${P.border}`, display: "flex", gap: 10 }}>
                    <button className="p-btn p-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                    <button className="p-btn p-btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={!selected || loading}>
                        {loading ? "Uploading..." : "Save Image ✓"}
                    </button>
                </div>
            </div>
        </div>
    );
}
