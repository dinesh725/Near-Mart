import React, { useState, useCallback } from "react";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import { fmtFull } from "../../utils/helpers";
import { CloudImage } from "../../components/CloudImage";
import { ImagePicker } from "../../components/ImagePicker";
import { PullToRefreshWrapper } from "../../components/ui/PullToRefreshWrapper";
import { InfiniteScrollTrigger } from "../../components/ui/InfiniteScrollTrigger";

function Toast({ msg, icon, onDone }) {
    React.useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className="plat-toast" style={{ borderLeft: `4px solid ${P.success}` }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{msg}</span>
            <button onClick={onDone} style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
    );
}

const STATUS_COLOR = { PENDING: P.warning, CONFIRMED: P.primary, PREPARING: "#8B5CF6", READY_FOR_PICKUP: P.accent, OUT_FOR_DELIVERY: "#F59E0B", DELIVERED: P.success, CANCELLED: P.danger };
const STATUS_ICON = { PENDING: "⏳", CONFIRMED: "✅", PREPARING: "👨‍🍳", READY_FOR_PICKUP: "📦", OUT_FOR_DELIVERY: "🛵", DELIVERED: "🎉", CANCELLED: "❌" };
const STATUS_LABEL = { PENDING: "Pending", CONFIRMED: "Confirmed", PREPARING: "Preparing", READY_FOR_PICKUP: "Ready for Pickup", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled" };

export function SellerDashboard({ activeTab }) {
    const { user } = useAuth();
    const { orders, products, acceptOrder, prepareOrder, markReadyForPickup, updatePrice, addProduct, removeProduct, updateStock, updateProductImage, showToast, fetchOrders } = useStore();
    const [toast, setToast] = useState(null);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({});
    const [imgPickerTarget, setImgPickerTarget] = useState(null); // { id, name, currentUrl }
    const [gpsLoading, setGpsLoading] = useState(false);
    const [storeLocation, setStoreLocation] = useState(user?.location || null);

    const storeOrders = orders.filter(o => o.storeId === user?.storeId);
    
    // SECURITY FIX: Filter the global catalog so seller ONLY sees their own items!
    // (We include items with matching sellerId or storeId to accommodate local mock data structures)
    const myProducts = products.filter(p => 
        p.sellerId === user?._id || 
        p.sellerId === user?.id || 
        p.storeId === user?.storeId || 
        (user?.role === "seller" && !p.sellerId) // Fallback for legacy mock data items
    );
    
    const pendingOrds = storeOrders.filter(o => o.status === "PENDING");
    const activeOrds = storeOrders.filter(o => !["DELIVERED", "CANCELLED"].includes(o.status));
    const totalRevenue = storeOrders.filter(o => o.status === "DELIVERED").reduce((s, o) => s + o.total, 0);
    const lowStock = myProducts.filter(p => p.stock < 10);

    const [prepTimeInput, setPrepTimeInput] = useState({});
    const API = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

    const getToken = () => localStorage.getItem("nm_access_token");

    const handleConfirmOrder = useCallback(async (orderId, silent = false) => {
        // Try backend API first
        try {
            if (!getToken()) throw new Error("Local session — skipping backend confirm");
            const res = await fetch(`${API}/orders/${orderId}/confirm`, {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.ok) {
                acceptOrder(orderId, user?.storeId);
                if (!silent) setToast({ msg: `Order confirmed ✔`, icon: "✅" });
                return;
            }
        } catch (e) { /* backend unavailable, use local fallback */ }
        // Local fallback for mock orders
        acceptOrder(orderId, user?.storeId);
        if (!silent) setToast({ msg: `Order confirmed ✔`, icon: "✅" });
    }, [API, acceptOrder, user]);

    const handleBulkConfirm = useCallback(async (orderIds, customerName) => {
        setToast({ msg: `Confirming ${orderIds.length} orders for ${customerName}...`, icon: "⏳" });
        for (const oid of orderIds) {
            await handleConfirmOrder(oid, true);
        }
        setToast({ msg: `All orders for ${customerName} confirmed! ✅`, icon: "✅" });
    }, [handleConfirmOrder]);

    const handlePrepareOrder = useCallback(async (orderId) => {
        const prepTime = prepTimeInput[orderId] || 15;
        // Try backend API first
        try {
            if (!getToken()) throw new Error("Local session — skipping backend prepare");
            const res = await fetch(`${API}/orders/${orderId}/prepare`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
                body: JSON.stringify({ prepTime })
            });
            const data = await res.json();
            if (data.ok) {
                prepareOrder(orderId, prepTime);
                setToast({ msg: `Preparing! Ready in ~${prepTime} min 👨‍🍳`, icon: "👨‍🍳" });
                return;
            }
        } catch (e) { /* backend unavailable, use local fallback */ }
        // Local fallback
        prepareOrder(orderId, prepTime);
        setToast({ msg: `Preparing! Ready in ~${prepTime} min 👨‍🍳`, icon: "👨‍🍳" });
    }, [API, prepTimeInput, prepareOrder]);

    const handleReadyForPickup = useCallback(async (orderId) => {
        // Try backend API first
        try {
            if (!getToken()) throw new Error("Local session — skipping backend ready-for-pickup");
            const res = await fetch(`${API}/orders/${orderId}/ready`, {
                method: "PATCH",
                headers: { "Authorization": `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.ok) {
                markReadyForPickup(orderId);
                setToast({ msg: `Order ready for pickup! 📦`, icon: "📦" });
                return;
            }
        } catch (e) { /* backend unavailable, use local fallback */ }
        // Local fallback
        markReadyForPickup(orderId);
        setToast({ msg: `Order ready for pickup! 📦`, icon: "📦" });
    }, [API, markReadyForPickup]);


    const handleSaveProduct = useCallback(() => {
        if (modal?.mode === "edit") {
            updatePrice(modal.product.id, form.sellingPrice);
            if (form.stock !== undefined) updateStock(modal.product.id, +form.stock - modal.product.stock);
            setToast({ msg: `${modal.product.name} updated!`, icon: "💰" });
        } else {
            addProduct({ ...form, supplierId: "S002", supplier: "Metro Wholesale Hub", sellerId: user?._id || user?.id, storeId: user?.storeId });
            setToast({ msg: `${form.name} added to catalog!`, icon: "🎉" });
        }
        setModal(null); setForm({});
    }, [modal, form, updatePrice, updateStock, addProduct, user]);

    const handleDeleteProduct = useCallback(async (productId, productName) => {
        if (!window.confirm(`Are you sure you want to delete ${productName}? This will permanently remove it from your inventory and the customer app.`)) return;
        try {
            if (getToken()) {
                const res = await fetch(`${API}/products/${productId}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${getToken()}` }
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error || "Failed to delete from DB");
            }
            removeProduct(productId);
            setToast({ msg: `${productName} deleted permanently 🗑️`, icon: "🗑️" });
        } catch (e) {
            setToast({ msg: e.message || "Could not delete product", icon: "❌" });
        }
    }, [API, removeProduct]);

    const handleDetectGPS = useCallback(() => {
        if (!navigator.geolocation) {
            setToast({ msg: "GPS not supported on this device", icon: "❌" });
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                try {
                    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
                    const res = await fetch(url, { headers: { "User-Agent": "NearMart/1.0" } });
                    const data = await res.json();
                    const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    const newLoc = { lat, lng, address };
                    setStoreLocation(newLoc);

                    // Save to backend only if a token exists
                    const token = localStorage.getItem("nm_access_token");
                    if (token) {
                        try {
                            await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/auth/location`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                                body: JSON.stringify(newLoc)
                            });
                            // Ignore updateRes status to prioritize local save success message
                        } catch (e) {
                            console.warn("Backend location sync unavailable");
                        }
                    }

                    setToast({ msg: "Store location saved successfully!", icon: "📍" });
                } catch (err) {
                    setToast({ msg: "Failed to save location", icon: "❌" });
                } finally {
                    setGpsLoading(false);
                }
            },
            (err) => {
                setToast({ msg: "Could not detect location. Please allow GPS.", icon: "❌" });
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    }, []);

    // ── TABS ──────────────────────────────────────────────────────────────────
    const OverviewTab = () => (
        <div className="col gap16">
            <div className="row-between">
                <div>
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>🏪 {user?.storeName}</h2>
                    <p style={{ color: P.textMuted, fontSize: 13 }}>{user?.city} · Seller Dashboard</p>
                </div>
                <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => { setModal({ mode: "add" }); setForm({ emoji: "🛒", name: "", sellingPrice: "", costPrice: "", stock: "", category: "Dairy" }); }}>+ Add Product</button>
            </div>

            <div className="stat-grid">
                {[
                    { label: "Revenue (Delivered)", val: `₹${totalRevenue.toLocaleString("en-IN")}`, sub: `${storeOrders.filter(o => o.status === "DELIVERED").length} orders`, color: P.success },
                    { label: "Pending Orders", val: pendingOrds.length, sub: "Awaiting acceptance", color: P.warning },
                    { label: "Active Orders", val: activeOrds.length, sub: "In progress", color: P.primary },
                    { label: "Low Stock SKUs", val: lowStock.length, sub: "< 10 units", color: lowStock.length > 0 ? P.danger : P.textMuted },
                ].map(s => (
                    <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                        <div className="p-label">{s.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                        <div style={{ fontSize: 12, color: P.textMuted, marginTop: 4 }}>{s.sub}</div>
                    </div>
                ))}
            </div>

            {pendingOrds.length > 0 ? (() => {
                // Group pending orders by customer
                const groupedPending = Object.values(pendingOrds.reduce((acc, o) => {
                    const key = o.customerId || o.customerName; // Fallback to name if ID missing
                    if (!acc[key]) acc[key] = { customerId: key, customerName: o.customerName, orders: [], total: 0 };
                    acc[key].orders.push(o);
                    acc[key].total += o.total;
                    return acc;
                }, {}));

                return (
                    <div className="p-card" style={{ borderColor: P.warning + "44", background: `${P.warning}08` }}>
                        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>⚡ Action Needed — {pendingOrds.length} Pending Actions</h3>
                        <div className="col gap14">
                            {groupedPending.map(group => (
                                <div key={group.customerId} className="p-card border-none" style={{ background: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                                    <div className="row-between mb12" style={{ borderBottom: `1px solid ${P.border}44`, paddingBottom: 10 }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: 15 }}>👤 {group.customerName}</div>
                                            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{group.orders.length} order{group.orders.length > 1 ? "s" : ""} · Total: ₹{group.total}</div>
                                        </div>
                                        {group.orders.length > 1 && (
                                            <button className="p-btn p-btn-sm" style={{ background: P.primary, color: "white" }} onClick={() => handleBulkConfirm(group.orders.map(o => o._id || o.id), group.customerName)}>
                                                ✅ Accept All
                                            </button>
                                        )}
                                    </div>
                                    <div className="col gap10">
                                        {group.orders.map(o => {
                                            const oid = o._id || o.id;
                                            return (
                                                <div key={oid} style={{ padding: "10px", background: P.surface, borderRadius: 8 }}>
                                                    <div className="row-between mb8">
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: 13 }}>#{oid?.slice(-6)?.toUpperCase() || oid}</div>
                                                            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 4 }}>{o.items?.map(i => `${i.emoji}×${i.qty}`).join(" ")}</div>
                                                        </div>
                                                        <div style={{ fontWeight: 700, color: P.warning }}>₹{o.total}</div>
                                                    </div>
                                                    <button className="p-btn p-btn-ghost w-100" style={{ fontSize: 13, minHeight: 40, border: `1px solid ${P.border}`, fontWeight: 700 }} onClick={() => handleConfirmOrder(oid)}>
                                                        ✅ Accept Order
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })() : null}

            {lowStock.length > 0 && (
                <div className="p-card" style={{ borderColor: P.danger + "44" }}>
                    <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>⚠ Low Stock Alert</h3>
                    {lowStock.map(p => (
                        <div key={p.id} className="row-between" style={{ padding: "8px 0", borderBottom: `1px solid ${P.border}44` }}>
                            <span>{p.emoji} {p.name}</span>
                            <span style={{ color: P.danger, fontWeight: 700 }}>{p.stock} {p.unit} left</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="p-card">
                <div className="row-between mb12">
                    <h3 style={{ fontWeight: 700, fontSize: 16 }}>📍 Store Location</h3>
                    <button className="p-btn p-btn-primary p-btn-sm" onClick={handleDetectGPS} disabled={gpsLoading}>
                        {gpsLoading ? "Detecting..." : "Detect GPS"}
                    </button>
                </div>
                {storeLocation?.address ? (
                    <div style={{ background: P.success + "15", border: `1px solid ${P.success}33`, borderRadius: 12, padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: P.success }}>Currently Saved</div>
                        <div style={{ fontSize: 13, color: P.text, lineHeight: 1.4 }}>{storeLocation.address}</div>
                        {storeLocation.lat != null && storeLocation.lng != null && (
                            <div style={{ fontSize: 11, color: P.textMuted, marginTop: 4, fontFamily: "monospace" }}>
                                {storeLocation.lat.toFixed(4)}, {storeLocation.lng.toFixed(4)}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ color: P.textMuted, fontSize: 13, padding: 10, textAlign: "center", border: `2px dashed ${P.border}`, borderRadius: 12 }}>
                        Store location not set. Set it so delivery partners can route to you.
                    </div>
                )}
            </div>
        </div>
    );

    const OrdersTab = () => {
        const filteredOrds = storeOrders.filter(o => o.status !== "DELIVERED" && o.status !== "CANCELLED");
        const allOrds = storeOrders;
        const [view, setView] = React.useState("active");
        const displayOrds = view === "active" ? filteredOrds : allOrds;

        return (
            <PullToRefreshWrapper onRefresh={fetchOrders}>
            <div className="col gap14">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>📋 Orders</h2>
                    <div style={{ display: "flex", gap: 8 }}>
                        {["active", "all"].map(v => (
                            <button key={v} onClick={() => setView(v)} style={{
                                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                                border: `1.5px solid ${view === v ? P.primary : P.border}`,
                                background: view === v ? P.primary : "transparent",
                                color: view === v ? "white" : P.text, cursor: "pointer"
                            }}>{v === "active" ? "Active" : "All"}</button>
                        ))}
                    </div>
                </div>
                {displayOrds.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: P.textMuted }}>No orders</div>
                ) : (
                    displayOrds.map(o => {
                        const oid = o._id || o.id;
                        return (
                            <div key={oid} className="p-card">
                                <div className="row-between mb8">
                                    <div>
                                        <div style={{ fontWeight: 700 }}>#{oid?.slice(-6)?.toUpperCase() || oid} · <span style={{ fontWeight: 400, color: P.textMuted }}>{o.customerName}</span></div>
                                        <div style={{ fontSize: 12, color: P.textMuted }}>{new Date(o.createdAt).toLocaleTimeString("en-IN")}</div>
                                    </div>
                                    <div style={{ background: (STATUS_COLOR[o.status] || P.textMuted) + "22", color: STATUS_COLOR[o.status] || P.textMuted, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                                        {STATUS_ICON[o.status]} {STATUS_LABEL[o.status] || o.status}
                                    </div>
                                </div>
                                <div style={{ fontSize: 13, color: P.textMuted, marginBottom: 8 }}>
                                    {o.items?.map(i => `${i.emoji} ${i.name} ×${i.qty}`).join(" · ")}
                                </div>
                                <div style={{ fontWeight: 700, marginBottom: 10 }}>₹{o.total} · {o.paymentMethod}</div>

                                {/* Action buttons based on status */}
                                {o.status === "PENDING" && (
                                    <button className="p-btn p-btn-primary w-100" onClick={() => handleConfirmOrder(oid)}>✅ Confirm Order</button>
                                )}
                                {o.status === "CONFIRMED" && (
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <input type="number" min={5} max={60} value={prepTimeInput[oid] || 15}
                                            onChange={e => setPrepTimeInput(p => ({ ...p, [oid]: e.target.value }))}
                                            className="p-input" style={{ width: 80, textAlign: "center" }}
                                            placeholder="min" />
                                        <button className="p-btn p-btn-primary" style={{ flex: 1 }} onClick={() => handlePrepareOrder(oid)}>👨‍🍳 Start Preparing</button>
                                    </div>
                                )}
                                {o.status === "PREPARING" && (
                                    <button className="p-btn w-100" style={{ background: P.accent, color: "white" }} onClick={() => handleReadyForPickup(oid)}>📦 Mark Ready for Pickup</button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
            </PullToRefreshWrapper>
        );
    };

    const StoreSetupTab = () => {
        const [form, setFormS] = React.useState({
            storeName: user?.storeName || "",
            storeDescription: user?.storeDescription || "",
            storePhone: user?.storePhone || "",
            deliveryRadius: user?.deliveryRadius || 5,
            isOpen: user?.isOpen ?? false,
            businessHours: user?.businessHours || { open: "09:00", close: "21:00", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
        });
        const [saving, setSaving] = React.useState(false);
        const [loc, setLoc] = React.useState(user?.location || null);
        const [gpsLoading, setGpsLoading] = React.useState(false);
        const [manualAddr, setManualAddr] = React.useState("");

        const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const API = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
        const getToken = () => localStorage.getItem("nm_access_token");

        const handleSave = async () => {
            setSaving(true);
            try {
                const payload = { ...form };
                if (loc) { payload.lat = loc.lat; payload.lng = loc.lng; payload.address = loc.address; }
                const res = await fetch(`${API}/sellers/onboard`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.ok) setToast({ msg: "Store settings saved! ✅", icon: "🏪" });
                else setToast({ msg: data.error || "Save failed", icon: "❌" });
            } catch { setToast({ msg: "Network error", icon: "❌" }); }
            setSaving(false);
        };

        const detectGPS = () => {
            if (!navigator.geolocation) return;
            setGpsLoading(true);
            navigator.geolocation.getCurrentPosition(async pos => {
                const { latitude: lat, longitude: lng } = pos.coords;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`, { headers: { "User-Agent": "NearMart/1.0" } });
                    const d = await res.json();
                    setLoc({ lat, lng, address: d.display_name || `${lat.toFixed(4)},${lng.toFixed(4)}` });
                } catch { setLoc({ lat, lng, address: `${lat.toFixed(4)},${lng.toFixed(4)}` }); }
                setGpsLoading(false);
            }, () => setGpsLoading(false), { enableHighAccuracy: true, timeout: 10000 });
        };

        const geocodeManual = async () => {
            if (!manualAddr.trim()) return;
            try {
                const q = encodeURIComponent(manualAddr);
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&limit=1&countrycodes=in`, { headers: { "User-Agent": "NearMart/1.0" } });
                const data = await res.json();
                if (data.length > 0) {
                    setLoc({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name });
                    setToast({ msg: "Address geocoded! 📍", icon: "📍" });
                } else setToast({ msg: "Address not found", icon: "⚠️" });
            } catch { setToast({ msg: "Geocoding failed", icon: "❌" }); }
        };

        const toggleDay = (day) => {
            const days = form.businessHours.days.includes(day)
                ? form.businessHours.days.filter(d => d !== day)
                : [...form.businessHours.days, day];
            setFormS(f => ({ ...f, businessHours: { ...f.businessHours, days } }));
        };

        return (
            <div className="col gap16">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>🏪 Store Setup</h2>

                {/* Open/Close Toggle */}
                <div className="p-card" style={{ borderColor: form.isOpen ? P.success + "55" : P.danger + "55" }}>
                    <div className="row-between">
                        <div>
                            <div style={{ fontWeight: 700 }}>Store Status</div>
                            <div style={{ fontSize: 13, color: form.isOpen ? P.success : P.danger, fontWeight: 600 }}>{form.isOpen ? "🟢 Open for orders" : "🔴 Closed"}</div>
                        </div>
                        <button onClick={() => setFormS(f => ({ ...f, isOpen: !f.isOpen }))} style={{
                            background: form.isOpen ? P.success : P.border, color: "white", border: "none",
                            borderRadius: 24, padding: "10px 24px", fontWeight: 700, cursor: "pointer", transition: "all 0.3s"
                        }}>{form.isOpen ? "Mark Closed" : "Open Store"}</button>
                    </div>
                </div>

                {/* Store Info */}
                <div className="p-card col gap10">
                    <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📋 Store Info</h3>
                    {[
                        { label: "Store Name", key: "storeName", placeholder: "e.g. Fresh Mart Bandra" },
                        { label: "Description", key: "storeDescription", placeholder: "What you sell..." },
                        { label: "Contact Phone", key: "storePhone", placeholder: "+91 98765 43210" },
                    ].map(({ label, key, placeholder }) => (
                        <div key={key}>
                            <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                            <input className="p-input" value={form[key]} onChange={e => setFormS(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} />
                        </div>
                    ))}
                </div>

                {/* Business Hours */}
                <div className="p-card col gap10">
                    <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⏰ Business Hours</h3>
                    <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 4 }}>Opens</div>
                            <input type="time" className="p-input" value={form.businessHours.open}
                                onChange={e => setFormS(f => ({ ...f, businessHours: { ...f.businessHours, open: e.target.value } }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 4 }}>Closes</div>
                            <input type="time" className="p-input" value={form.businessHours.close}
                                onChange={e => setFormS(f => ({ ...f, businessHours: { ...f.businessHours, close: e.target.value } }))} />
                        </div>
                    </div>
                    <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 4, fontWeight: 600 }}>Operating Days</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {DAYS.map(day => (
                            <button key={day} onClick={() => toggleDay(day)} style={{
                                padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                border: `1.5px solid ${form.businessHours.days.includes(day) ? P.primary : P.border}`,
                                background: form.businessHours.days.includes(day) ? P.primary + "18" : "transparent",
                                color: form.businessHours.days.includes(day) ? P.primary : P.textMuted,
                            }}>{day}</button>
                        ))}
                    </div>
                </div>

                {/* Delivery Radius */}
                <div className="p-card">
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>📍 Delivery Radius: <strong style={{ color: P.primary }}>{form.deliveryRadius} km</strong></div>
                    <input type="range" min={1} max={20} value={form.deliveryRadius}
                        onChange={e => setFormS(f => ({ ...f, deliveryRadius: parseInt(e.target.value) }))}
                        style={{ width: "100%", accentColor: P.primary }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: P.textMuted }}>
                        <span>1 km</span><span>10 km</span><span>20 km</span>
                    </div>
                </div>

                {/* Location */}
                <div className="p-card col gap10">
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>📍 Store Location</h3>
                    {loc?.address && (
                        <div style={{ background: P.success + "15", border: `1px solid ${P.success}33`, borderRadius: 10, padding: 12, fontSize: 13 }}>
                            <div style={{ fontWeight: 700, color: P.success, marginBottom: 2 }}>✅ Location Set</div>
                            <div>{loc.address}</div>
                            <div style={{ fontSize: 11, color: P.textMuted, fontFamily: "monospace", marginTop: 4 }}>{loc.lat?.toFixed(5)}, {loc.lng?.toFixed(5)}</div>
                        </div>
                    )}
                    <button className="p-btn p-btn-primary" onClick={detectGPS} disabled={gpsLoading}>
                        {gpsLoading ? "Detecting..." : "📡 Auto-detect GPS"}
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input className="p-input" value={manualAddr} onChange={e => setManualAddr(e.target.value)} placeholder="Or type address..." style={{ flex: 1 }} />
                        <button className="p-btn p-btn-ghost" onClick={geocodeManual}>Geocode</button>
                    </div>
                </div>

                <button className="p-btn p-btn-primary" onClick={handleSave} disabled={saving} style={{ fontWeight: 800, fontSize: 15 }}>
                    {saving ? "Saving..." : "💾 Save Store Settings"}
                </button>
            </div>
        );
    };

    const [inventoryPage, setInventoryPage] = useState(1);
    const INVENTORY_LIMIT = 20;

    const InventoryTab = () => {
        const displayProducts = myProducts.slice(0, inventoryPage * INVENTORY_LIMIT);
        const hasMore = displayProducts.length < myProducts.length;

        const loadMore = useCallback(() => {
            setInventoryPage(p => p + 1);
        }, []);

        return (
        <div className="col gap14">
            <div className="row-between">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>📦 Inventory ({myProducts.length} SKUs)</h2>
                <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => { setModal({ mode: "add" }); setForm({ emoji: "🛒", name: "", sellingPrice: "", mrp: "", costPrice: "", stock: "", category: "Dairy", description: "", weight: "", tags: "" }); }}>+ Add</button>
            </div>
            <div className="col gap10">
                {displayProducts.map(p => (
                    <div key={p.id} className="p-card" style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            {/* Product image or emoji */}
                            <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: P.surface, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                                onClick={() => setImgPickerTarget({ id: p.id, name: p.name, currentUrl: p.imageUrl })}>
                                {p.imageUrl
                                    ? <CloudImage src={p.imageUrl} width={100} height={100} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} className="product-card-img" />
                                    : <span style={{ fontSize: 24 }}>{p.emoji}</span>
                                }
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{p.name}</div>
                                {/* Seller can see cost price - permission enforced */}
                                <div style={{ fontSize: 12, color: P.textMuted }}>Cost ₹{p.costPrice} · Sell ₹{p.sellingPrice} · Margin {Math.round((p.sellingPrice - p.costPrice) / p.sellingPrice * 100)}%</div>
                                <div style={{ fontSize: 11, color: p.stock === 0 ? P.danger : p.stock < 10 ? P.warning : P.textMuted }}>
                                    {p.stock === 0 ? "Out of stock" : `${p.stock} ${p.unit}`}
                                </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => { setModal({ mode: "edit", product: p }); setForm({ sellingPrice: p.sellingPrice, costPrice: p.costPrice, stock: p.stock }); }}>✏ Edit</button>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button style={{ fontSize: 11, background: "none", border: `1px solid ${P.border}`, borderRadius: 6, color: P.textMuted, cursor: "pointer", padding: "3px 8px", fontFamily: "'Sora',sans-serif" }}
                                        onClick={() => setImgPickerTarget({ id: p.id, name: p.name, currentUrl: p.imageUrl })}>📷 Image</button>
                                    <button style={{ fontSize: 11, background: "none", border: `1px solid ${P.danger}44`, borderRadius: 6, color: P.danger, cursor: "pointer", padding: "3px 8px", fontFamily: "'Sora',sans-serif" }}
                                        onClick={() => handleDeleteProduct(p._id || p.id, p.name)}>🗑️ Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {hasMore && <InfiniteScrollTrigger onLoadMore={loadMore} loadingMore={false} hasMore={true} />}
            </div>
        </div>
        );
    };

    const FinanceTab = () => {
        const totalCost = storeOrders.filter(o => o.status === "DELIVERED").reduce((s, o) => s + o.items.reduce((si, i) => { const p = myProducts.find(x => x.id === i.productId); return si + (p?.costPrice || 0) * i.qty; }, 0), 0);
        const grossProfit = totalRevenue - totalCost;
        return (
            <div className="col gap16">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>💰 Finance Dashboard</h2>
                <div className="stat-grid">
                    {[
                        { label: "Total Revenue", val: fmtFull(totalRevenue), color: P.success },
                        { label: "Total Cost", val: fmtFull(totalCost), color: P.danger },
                        { label: "Gross Profit", val: fmtFull(grossProfit), color: P.primary },
                        { label: "Profit Margin", val: totalRevenue > 0 ? `${Math.round(grossProfit / totalRevenue * 100)}%` : "—", color: P.accent },
                    ].map(s => (
                        <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                            <div className="p-label">{s.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                        </div>
                    ))}
                </div>
                <div className="p-card">
                    <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Product Profitability</h3>
                    {myProducts.map(p => (
                        <div key={p.id} className="row-between" style={{ padding: "8px 0", borderBottom: `1px solid ${P.border}44` }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <span>{p.emoji}</span>
                                <span style={{ fontSize: 13 }}>{p.name}</span>
                            </div>
                            <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                                <span style={{ color: P.textMuted }}>×{p.monthlySales}</span>
                                <span style={{ fontWeight: 700, color: P.success }}>{fmtFull(p.monthlyProfit)}</span>
                                <span>{Math.round((p.sellingPrice - p.costPrice) / p.sellingPrice * 100)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const tabs = [<OverviewTab />, <OrdersTab />, <InventoryTab />, <FinanceTab />, <StoreSetupTab />];


    return (
        <div>
            {tabs[activeTab] || <OverviewTab />}

            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
                    <div className="modal-sheet" style={{ position: "relative" }}>
                        <div className="modal-handle" />
                        <button className="modal-close" onClick={() => setModal(null)}>✕</button>
                        <h3 style={{ fontWeight: 700, fontSize: 17, marginBottom: 20 }}>
                            {modal.mode === "edit" ? `Edit: ${modal.product.name}` : "Add New Product"}
                        </h3>
                        <div className="col gap12">
                            {/* Image preview + picker button in modal */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: P.surface, borderRadius: 12, border: `1px solid ${P.border}` }}>
                                <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: P.bg, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {(modal.mode === "edit" && modal.product.imageUrl)
                                        ? <CloudImage src={modal.product.imageUrl} width={100} height={100} alt="product" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <span style={{ fontSize: 26 }}>{modal.mode === "edit" ? modal.product.emoji : form.emoji || "🛒"}</span>
                                    }
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>Product Image</div>
                                    <div style={{ fontSize: 11, color: P.textMuted }}>Upload, URL or search Unsplash</div>
                                </div>
                                <button className="p-btn p-btn-ghost p-btn-sm"
                                    onClick={() => setImgPickerTarget({ id: modal.product?.id, name: modal.product?.name || form.name || "product", currentUrl: modal.product?.imageUrl })}>
                                    📷 Set Image
                                </button>
                            </div>

                            {modal.mode === "add" && (
                                <>
                                    <div className="p-field"><label htmlFor="m-name">Product Name</label><input id="m-name" className="p-input" type="text" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                                    <div className="plat-grid-2">
                                        <div className="p-field"><label htmlFor="m-emoji">Emoji</label><input id="m-emoji" className="p-input" maxLength={2} value={form.emoji || "🛒"} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} /></div>
                                        <div className="p-field"><label htmlFor="m-stock">Initial Stock</label><input id="m-stock" className="p-input" type="number" value={form.stock || ""} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} /></div>
                                    </div>
                                </>
                            )}
                            <div className="plat-grid-2">
                                <div className="p-field"><label htmlFor="m-sell">Selling Price (₹)</label><input id="m-sell" className="p-input" type="number" value={form.sellingPrice || ""} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} /></div>
                                <div className="p-field"><label htmlFor="m-cost">Cost Price (₹)</label><input id="m-cost" className="p-input" type="number" value={form.costPrice || ""} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} /></div>
                            </div>
                            <div className="plat-grid-2">
                                <div className="p-field"><label htmlFor="m-mrp">MRP (₹)</label><input id="m-mrp" className="p-input" type="number" placeholder="e.g. 90" value={form.mrp || ""} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} /></div>
                                <div className="p-field"><label htmlFor="m-weight">Weight / Unit</label><input id="m-weight" className="p-input" type="text" placeholder="e.g. 500g, 1L" value={form.weight || ""} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} /></div>
                            </div>
                            <div className="p-field"><label htmlFor="m-desc">Description</label><textarea id="m-desc" className="p-input" rows={2} placeholder="What makes this product great?" value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: "none", fontFamily: "inherit", fontSize: 13 }} /></div>
                            <div className="p-field"><label htmlFor="m-tags">Tags (comma-separated)</label><input id="m-tags" className="p-input" type="text" placeholder="Organic, Fresh, Best Seller" value={form.tags || ""} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} /></div>
                            {modal.mode === "edit" && (
                                <div className="p-field"><label htmlFor="m-stock-e">Stock Qty</label><input id="m-stock-e" className="p-input" type="number" value={form.stock ?? ""} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} /></div>
                            )}
                            <button className="p-btn p-btn-primary w-100 mt8" onClick={handleSaveProduct} disabled={!form.sellingPrice || (modal.mode === "add" && !form.name)}>
                                {modal.mode === "edit" ? "Save Changes" : "Add to Catalog"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {imgPickerTarget && (
                <ImagePicker
                    productName={imgPickerTarget.name}
                    currentUrl={imgPickerTarget.currentUrl}
                    onSelect={(url) => {
                        if (imgPickerTarget.id) {
                            updateProductImage(imgPickerTarget.id, url);
                            showToast(`Image ${url ? "saved" : "removed"} for ${imgPickerTarget.name}`, "success");
                        } else {
                            setForm(f => ({ ...f, imageUrl: url }));
                        }
                        setImgPickerTarget(null);
                    }}
                    onClose={() => setImgPickerTarget(null)}
                />
            )}

            {toast && <Toast msg={toast.msg} icon={toast.icon} onDone={() => setToast(null)} />}
        </div>
    );
}
