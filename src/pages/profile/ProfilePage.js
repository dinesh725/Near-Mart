import React, { useState, useCallback } from "react";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";

// ── Section Card ──────────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
    return (
        <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 14 }}>
            {title && <div style={{ fontSize: 13, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>{icon} {title}</div>}
            {children}
        </div>
    );
}

function InfoRow({ label, value, muted }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${P.border}22` }}>
            <span style={{ fontSize: 13, color: P.textMuted }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: muted ? P.textMuted : P.text }}>{value || "—"}</span>
        </div>
    );
}

// ── Main Profile Page ─────────────────────────────────────────────────────────
export function ProfilePage() {
    const { user, role, logout, updateUser, changePassword } = useAuth();
    const { orders, cartCount } = useStore();
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: user?.name || "",
        phone: user?.phone || "",
        address: user?.address || "",
        storeName: user?.storeName || "",
        storeId: user?.storeId || "",
        city: user?.city || "",
        payoutAccount: user?.payoutAccount || "",
        companyName: user?.companyName || "",
        supplierId: user?.supplierId || "",
        paymentTerms: user?.paymentTerms || "",
        vehicleType: user?.vehicleType || "",
        vehicleNo: user?.vehicleNo || "",
        department: user?.department || "",
        shift: user?.shift || ""
    });
    const [pwForm, setPwForm] = useState({ old: "", new: "", confirm: "" });
    const [pwMsg, setPwMsg] = useState(null);
    const [saveMsg, setSaveMsg] = useState(null);
    const [showPwSection, setShowPwSection] = useState(false);

    const myOrders = orders?.filter(o => o.customerId === user?.id) || [];

    const ROLE_COLORS = {
        customer: P.primary, seller: P.success, vendor: "#F59E0B",
        delivery: P.accent, support: P.warning, admin: P.purple,
    };
    const accentColor = ROLE_COLORS[role] || P.primary;

    const handleSave = useCallback(() => {
        updateUser({
            name: editForm.name.trim(),
            phone: editForm.phone.trim(),
            address: editForm.address.trim(),
            ...(role === "seller" && { storeName: editForm.storeName, storeId: editForm.storeId, city: editForm.city, payoutAccount: editForm.payoutAccount }),
            ...(role === "vendor" && { companyName: editForm.companyName, supplierId: editForm.supplierId, city: editForm.city, paymentTerms: editForm.paymentTerms }),
            ...(role === "delivery" && { vehicleType: editForm.vehicleType, vehicleNo: editForm.vehicleNo, payoutAccount: editForm.payoutAccount }),
            ...((role === "support" || role === "admin") && { department: editForm.department, shift: editForm.shift })
        });
        setEditing(false);
        setSaveMsg("Profile updated!");
        setTimeout(() => setSaveMsg(null), 3000);
    }, [editForm, updateUser, role]);

    const handlePwChange = useCallback(() => {
        setPwMsg(null);
        if (pwForm.new !== pwForm.confirm) { setPwMsg({ type: "error", text: "Passwords don't match" }); return; }
        const result = changePassword(pwForm.old, pwForm.new);
        if (result.ok) {
            setPwMsg({ type: "success", text: "Password changed successfully!" });
            setPwForm({ old: "", new: "", confirm: "" });
            setTimeout(() => setPwMsg(null), 3000);
        } else {
            setPwMsg({ type: "error", text: result.error });
        }
    }, [pwForm, changePassword]);

    const pwStrength = (pw) => {
        if (!pw) return null;
        let score = 0;
        if (pw.length >= 6) score++;
        if (pw.length >= 10) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        if (score <= 2) return { label: "Weak", color: P.danger, pct: 33 };
        if (score <= 3) return { label: "Medium", color: P.warning, pct: 66 };
        return { label: "Strong", color: P.success, pct: 100 };
    };

    const strength = pwStrength(pwForm.new);

    return (
        <div className="col gap14 profile-container">
            {/* Profile header */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "white", border: `2px solid ${accentColor}55`, boxShadow: `0 4px 20px ${accentColor}33`, flexShrink: 0 }}>
                    {user?.avatar || "?"}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 20 }}>{user?.name}</div>
                    <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{user?.email}</div>
                    <div style={{ marginTop: 6 }}>
                        <span style={{ background: accentColor + "20", color: accentColor, border: `1px solid ${accentColor}44`, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{role}</span>
                    </div>
                </div>
            </div>

            {saveMsg && <div style={{ background: `${P.success}15`, border: `1px solid ${P.success}44`, borderRadius: 10, padding: "10px 14px", color: P.success, fontSize: 13, fontWeight: 600 }}>✅ {saveMsg}</div>}

            {/* Edit Profile */}
            <Section title="Personal Information" icon="👤">
                {editing ? (
                    <div className="col gap12">
                        <div className="p-field">
                            <label htmlFor="prof-name" style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Full Name</label>
                            <input id="prof-name" type="text" className="p-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="p-field">
                            <label htmlFor="prof-phone" style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Phone Number</label>
                            <input id="prof-phone" type="tel" className="p-input" placeholder="+91 98765 43210" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                        </div>
                        {role === "customer" && (
                            <div className="p-field">
                                <label htmlFor="prof-addr" style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Delivery Address</label>
                                <input id="prof-addr" type="text" className="p-input" placeholder="Enter your address" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                            </div>
                        )}
                        {role === "seller" && (
                            <>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Store Name</label><input type="text" className="p-input" value={editForm.storeName} onChange={e => setEditForm(f => ({ ...f, storeName: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Store ID</label><input type="text" className="p-input" value={editForm.storeId} onChange={e => setEditForm(f => ({ ...f, storeId: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>City</label><input type="text" className="p-input" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Payout Account (Bank)</label><input type="text" className="p-input" placeholder="e.g. HDFC 5432" value={editForm.payoutAccount} onChange={e => setEditForm(f => ({ ...f, payoutAccount: e.target.value }))} /></div>
                            </>
                        )}
                        {role === "vendor" && (
                            <>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Company Name</label><input type="text" className="p-input" value={editForm.companyName} onChange={e => setEditForm(f => ({ ...f, companyName: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Supplier ID</label><input type="text" className="p-input" value={editForm.supplierId} onChange={e => setEditForm(f => ({ ...f, supplierId: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>City</label><input type="text" className="p-input" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Payment Terms</label><input type="text" className="p-input" placeholder="e.g. Net 14" value={editForm.paymentTerms} onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))} /></div>
                            </>
                        )}
                        {role === "delivery" && (
                            <>
                                <div className="p-field">
                                    <label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Vehicle Type</label>
                                    <select className="p-input" value={editForm.vehicleType} onChange={e => setEditForm(f => ({ ...f, vehicleType: e.target.value }))}>
                                        <option value="bike">Bike (Standard)</option>
                                        <option value="scooter">Scooter</option>
                                        <option value="mini_truck">Mini Truck (Wholesale/B2B)</option>
                                        <option value="van">Van (Wholesale/B2B)</option>
                                        <option value="large_truck">Large Truck (Heavy B2B)</option>
                                    </select>
                                </div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Cargo Weight Limit (kg)</label><input type="number" className="p-input" value={editForm.weightCapacity} onChange={e => setEditForm(f => ({ ...f, weightCapacity: Number(e.target.value) }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Vehicle / License Plate No.</label><input type="text" className="p-input" value={editForm.vehicleNo} onChange={e => setEditForm(f => ({ ...f, vehicleNo: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Payout Account (Bank)</label><input type="text" className="p-input" placeholder="e.g. SBI 7890" value={editForm.payoutAccount} onChange={e => setEditForm(f => ({ ...f, payoutAccount: e.target.value }))} /></div>
                            </>
                        )}
                        {(role === "support" || role === "admin") && (
                            <>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Department</label><input type="text" className="p-input" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} /></div>
                                <div className="p-field"><label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Primary Shift</label><input type="text" className="p-input" placeholder="e.g. 9:00 AM - 6:00 PM" value={editForm.shift} onChange={e => setEditForm(f => ({ ...f, shift: e.target.value }))} /></div>
                            </>
                        )}
                        <div style={{ display: "flex", gap: 10 }}>
                            <button className="p-btn p-btn-primary" style={{ flex: 1 }} onClick={handleSave}>Save Changes</button>
                            <button className="p-btn p-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <InfoRow label="Name" value={user?.name} />
                        <InfoRow label="Email" value={user?.email} />
                        <InfoRow label="Phone" value={user?.phone || "Not set"} muted={!user?.phone} />
                        {role === "customer" && <InfoRow label="Address" value={user?.address || "Not set"} muted={!user?.address} />}
                        <button className="p-btn p-btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => {
                            setEditing(true);
                            setEditForm({
                                name: user?.name || "", phone: user?.phone || "", address: user?.address || "",
                                storeName: user?.storeName || "", storeId: user?.storeId || "", city: user?.city || "", payoutAccount: user?.payoutAccount || "",
                                companyName: user?.companyName || "", supplierId: user?.supplierId || "", paymentTerms: user?.paymentTerms || "",
                                vehicleType: user?.vehicleType || "bike", vehicleNo: user?.vehicleNo || "", weightCapacity: user?.weightCapacity || 20,
                                department: user?.department || "", shift: user?.shift || ""
                            });
                        }}>Edit Profile ✏️</button>
                    </div>
                )}
            </Section>

            {/* Role-specific sections */}
            {role === "customer" && (
                <Section title="Account Overview" icon="📊">
                    <InfoRow label="Wallet Balance" value={`₹${(user?.walletBalance || 0).toLocaleString("en-IN")}`} />
                    <InfoRow label="Loyalty Points" value={user?.loyaltyPoints || 0} />
                    <InfoRow label="Total Orders" value={myOrders.length} />
                    <InfoRow label="Items in Cart" value={cartCount} />
                </Section>
            )}

            {role === "seller" && (
                <Section title="Store Information" icon="🏪">
                    <InfoRow label="Store Name" value={user?.storeName || "Not set"} />
                    <InfoRow label="Store ID" value={user?.storeId || "Not set"} />
                    <InfoRow label="City" value={user?.city || "Not set"} />
                    <InfoRow label="Business Hours" value={user?.businessHours?.open ? `${user?.businessHours?.open} - ${user?.businessHours?.close}` : "Not set"} />
                    <InfoRow label="Payout Account" value={user?.payoutAccount || "Not mapped"} muted={!user?.payoutAccount} />
                </Section>
            )}

            {role === "vendor" && (
                <Section title="Company Details" icon="🏭">
                    <InfoRow label="Company" value={user?.companyName || "Not set"} />
                    <InfoRow label="Supplier ID" value={user?.supplierId || "Not set"} />
                    <InfoRow label="City" value={user?.city || "Not set"} />
                    <InfoRow label="Payment Terms" value={user?.paymentTerms || "Not configured"} />
                </Section>
            )}

            {role === "delivery" && (
                <Section title="Delivery Profile" icon="🛵">
                    <InfoRow label="Vehicle Type" value={user?.vehicleType?.toUpperCase() || "Not configured"} />
                    <InfoRow label="Cargo Capacity" value={`${user?.weightCapacity || 20} kg`} />
                    <InfoRow label="Vehicle No." value={user?.vehicleNo || "Not configured"} />
                    <InfoRow label="Rating" value={`⭐ ${user?.rating?.toFixed(1) || 5.0}`} />
                    <InfoRow label="Deliveries Today" value={user?.resolvedToday || 0} />
                    <InfoRow label="Payout Account" value={user?.payoutAccount || "Not mapped"} muted={!user?.payoutAccount} />
                </Section>
            )}

            {role === "support" && (
                <Section title="Agent Details" icon="🎧">
                    <InfoRow label="Department" value={user?.department || "General Support"} />
                    <InfoRow label="Resolved Today" value={user?.resolvedToday || 0} />
                    <InfoRow label="Shift" value={user?.shift || "Not scheduled"} />
                </Section>
            )}

            {role === "admin" && (
                <Section title="Admin Access" icon="🛡">
                    <InfoRow label="Access Level" value={user?.accessLevel?.toUpperCase() || "L1"} />
                    <InfoRow label="Department" value={user?.department || "HQ"} />
                    <InfoRow label="Shift" value={user?.shift || "Not scheduled"} />
                </Section>
            )}

            {/* Security / Password */}
            <Section title="Security" icon="🔒">
                {showPwSection ? (
                    <div className="col gap12">
                        <div className="p-field">
                            <label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Current Password</label>
                            <input type="password" className="p-input" value={pwForm.old} onChange={e => setPwForm(f => ({ ...f, old: e.target.value }))} placeholder="Enter current password" />
                        </div>
                        <div className="p-field">
                            <label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>New Password</label>
                            <input type="password" className="p-input" value={pwForm.new} onChange={e => setPwForm(f => ({ ...f, new: e.target.value }))} placeholder="Min 6 characters" />
                            {strength && (
                                <div style={{ marginTop: 6 }}>
                                    <div style={{ height: 4, borderRadius: 4, background: P.border, overflow: "hidden" }}>
                                        <div style={{ width: `${strength.pct}%`, height: "100%", background: strength.color, borderRadius: 4, transition: "width .3s" }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: strength.color, fontWeight: 600, marginTop: 2, display: "inline-block" }}>{strength.label}</span>
                                </div>
                            )}
                        </div>
                        <div className="p-field">
                            <label style={{ fontSize: 12, color: P.textMuted, fontWeight: 600 }}>Confirm New Password</label>
                            <input type="password" className="p-input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Re-enter new password" />
                        </div>
                        {pwMsg && <div style={{ background: pwMsg.type === "error" ? `${P.danger}15` : `${P.success}15`, border: `1px solid ${pwMsg.type === "error" ? P.danger : P.success}44`, borderRadius: 10, padding: "10px 14px", color: pwMsg.type === "error" ? P.danger : P.success, fontSize: 13 }}>{pwMsg.text}</div>}
                        <div style={{ display: "flex", gap: 10 }}>
                            <button className="p-btn p-btn-primary" style={{ flex: 1 }} onClick={handlePwChange} disabled={!pwForm.old || !pwForm.new || !pwForm.confirm}>Change Password</button>
                            <button className="p-btn p-btn-ghost" onClick={() => { setShowPwSection(false); setPwMsg(null); }}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <InfoRow label="Password" value="••••••••" muted />
                        <InfoRow label="Last Changed" value="Never" muted />
                        <button className="p-btn p-btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setShowPwSection(true)}>Change Password 🔑</button>
                    </div>
                )}
            </Section>

            {/* Logout */}
            <button onClick={logout} style={{ background: `${P.danger}12`, border: `1px solid ${P.danger}33`, borderRadius: 14, padding: "14px 20px", color: P.danger, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s" }}>
                🚪 Logout
            </button>
        </div>
    );
}
