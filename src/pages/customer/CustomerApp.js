import React, { useState, useCallback, useEffect, useRef } from "react";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import { ProductDetailSheet } from "../../components/ProductDetailSheet";
import { CheckoutFlow } from "./CheckoutFlow";
import { WalletPage } from "./WalletPage";
import { TrackOrderModal } from "../../components/Map/TrackOrderModal";
import { MultiSellerSheet } from "../../components/MultiSellerSheet";
import { OrdersPage } from "./OrdersPage";

// ── SKELETON LOADING ──────────────────────────────────────────────────────────
function SkeletonGrid() {
    return (
        <div className="product-grid-v2">
            {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton skeleton-card" />
            ))}
        </div>
    );
}

// ── PRODUCT CARD V2 ───────────────────────────────────────────────────────────
function ProductCard({ p, qty, onAdd, onRemove, onOpen }) {
    const [justAdded, setJustAdded] = useState(false);
    const discountPct = p.mrp > p.sellingPrice ? Math.round((1 - p.sellingPrice / p.mrp) * 100) : 0;
    const stockStatus = p.stock === 0 ? "out" : p.stock < 10 ? "low" : "in";

    const handleQuickAdd = (e) => {
        e.stopPropagation();
        if (p.stock === 0) return;
        onAdd(p.id);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 400);
    };

    return (
        <div className="product-card-v2" onClick={() => onOpen(p)}>
            {/* Image area */}
            <div className="pc2-img">
                {discountPct > 0 && <span className="badge-discount">{discountPct}% OFF</span>}
                {p.stock === 0 && (
                    <div className="badge-out-overlay"><span>Out of Stock</span></div>
                )}
                {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} loading="lazy" onError={e => { e.target.style.display = "none"; e.target.parentNode.innerHTML = `<span style="font-size:60px;opacity:.85">${p.emoji}</span>`; }} />
                    : <span style={{ fontSize: 60, opacity: 0.85 }}>{p.emoji}</span>
                }
            </div>

            {/* Body */}
            <div className="pc2-body">
                <div className="pc2-name">{p.name}</div>
                <div className="pc2-cat">{p.category} · {p.unit}</div>

                {/* Price row */}
                <div className="pc2-price-row">
                    <span className="pc2-price">₹{p.sellingPrice}</span>
                    {p.mrp > p.sellingPrice && <span className="pc2-mrp">₹{p.mrp}</span>}
                    {discountPct > 0 && <span className="pc2-off">{discountPct}%</span>}
                </div>

                {/* Meta: rating + ETA */}
                <div className="pc2-meta">
                    <span className="badge-rating">⭐ {p.rating || 4.0}</span>
                    <span className="badge-eta">🚀 {p.deliveryMinutes || 20}m {p.distanceKm && `(${p.distanceKm.toFixed(1)}km)`}</span>
                    <span className={`badge-stock ${stockStatus}`}>{p.stock === 0 ? "Out" : p.stock < 10 ? `${p.stock} left` : "In Stock"}</span>
                </div>
            </div>

            {/* Quick-add / Qty stepper */}
            <div className="pc2-add-wrap" onClick={e => e.stopPropagation()}>
                {p.stock === 0 ? null : qty > 0 ? (
                    <div className="qty-stepper" style={{ transform: "scale(0.88)", transformOrigin: "bottom right" }}>
                        <button onClick={(e) => { e.stopPropagation(); onRemove(p.id); }} aria-label="Remove">−</button>
                        <span className="qty-val">{qty}</span>
                        <button onClick={handleQuickAdd} aria-label="Add">+</button>
                    </div>
                ) : (
                    <button className={`quick-add-btn ${justAdded ? "added" : ""}`} onClick={handleQuickAdd} aria-label={`Add ${p.name}`}>+</button>
                )}
            </div>
        </div>
    );
}

// ── FLOATING CART FAB ─────────────────────────────────────────────────────────
function CartFAB({ count, total, onClick }) {
    const [pulse, setPulse] = useState(false);
    const prevCountRef = useRef(count);

    useEffect(() => {
        if (count > prevCountRef.current) {
            setPulse(true);
            const t = setTimeout(() => setPulse(false), 500);
            prevCountRef.current = count;
            return () => clearTimeout(t);
        }
        prevCountRef.current = count;
    }, [count]);

    if (count === 0) return null;

    return (
        <button className={`cart-fab ${pulse ? "pulse" : ""}`} onClick={onClick}>
            <span style={{ fontSize: 20 }}>🛒</span>
            <span className="fab-badge">{count}</span>
            <span>₹{total + 35}</span>
            <span style={{ fontSize: 11, opacity: 0.8, marginLeft: -4 }}>→</span>
        </button>
    );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export function CustomerApp({ activeTab, setActiveTab }) {
    const { user } = useAuth();
    const { products, cart, cartCount, cartTotal, addToCart, removeFromCart, clearCart, orders, fetchOrders, setBackendOrder, showToast } = useStore();
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [showCheckout, setShowCheckout] = useState(false);
    const [loading, setLoading] = useState(true);
    const [detailProduct, setDetailProduct] = useState(null);
    const [trackingOrder, setTrackingOrder] = useState(null);
    const [multiSellerData, setMultiSellerData] = useState(null); // { productName, variants }
    const [customerGps, setCustomerGps] = useState(null);

    // Filter orders belonging to this customer — backend orders use customerId field or _id in items
    const myOrders = orders.filter(o => o.customerId === user?.id || o.customerId === user?._id);
    const categories = ["All", ...new Set(products.map(p => p.category))];
    const filtered = products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
        const matchCat = category === "All" || p.category === category;
        return matchSearch && matchCat;
    });

    // Simulated loading state on mount
    useEffect(() => {
        const t = setTimeout(() => {
            if (!customerGps) setLoading(false);
        }, 800);
        return () => clearTimeout(t);
    }, [customerGps]);

    // Auto-detect customer GPS on mount (once)
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => setCustomerGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => { }, // silently fail
                { enableHighAccuracy: false, timeout: 8000 }
            );
        }
    }, []);

    // Fetch dynamic distances/etas when GPS changes
    const [liveProducts, setLiveProducts] = useState([]);
    const [noLocalSellers, setNoLocalSellers] = useState(false);

    useEffect(() => {
        if (!customerGps) {
            setLiveProducts(filtered);
            return;
        }

        const fetchLocalCatalog = async () => {
            setLoading(true);
            try {
                // Hit products/search with user filters
                const params = new URLSearchParams({
                    lat: customerGps.lat, lng: customerGps.lng, sort: "distance"
                });
                if (search) params.append("q", search);
                if (category !== "All") params.append("category", category);
                
                const res = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/products/search?${params}`);
                const data = await res.json();

                if (data.ok && data.grouped && data.grouped.length > 0) {
                    setNoLocalSellers(false);
                    // Build live products directly from backend data
                    const merged = data.grouped.map(bg => {
                        const best = bg.variants[0];
                        return {
                            id: best._id,
                            name: best.name,
                            category: best.category || "General",
                            unit: best.unit || "1 unit",
                            sellingPrice: best.sellingPrice,
                            mrp: best.mrp || best.sellingPrice,
                            stock: best.stock,
                            imageUrl: best.imageUrl || (best.images && best.images[0]) || "",
                            emoji: best.emoji || "🛍️",
                            rating: best.seller?.rating || 4.5,
                            distanceKm: best.distanceKm,
                            deliveryMinutes: best.estimatedDeliveryMin || (best.distanceKm ? Math.round(15 + (best.distanceKm * 5)) : 30)
                        };
                    });
                    setLiveProducts(merged);
                } else if (data.ok && data.grouped && data.grouped.length === 0) {
                    setNoLocalSellers(true);
                }
            } catch (err) {
                setLiveProducts(filtered); // Fallback
            } finally {
                setLoading(false);
            }
        };

        fetchLocalCatalog();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerGps, search, category, products.length]);

    // Actually, to prevent infinite loops, we separate the derived state:
    const displayProducts = customerGps && liveProducts.length > 0 ? liveProducts : filtered;

    const handleCheckout = useCallback(() => {
        if (cartCount === 0) return;
        setShowCheckout(true);
    }, [cartCount]);

    // Called when checkout succeeds — sync real backend order, then open Orders tab
    const handleCheckoutSuccess = useCallback((backendOrders) => {
        setShowCheckout(false);
        const singleOrder = backendOrders?.[0] || null;
        if (singleOrder) setBackendOrder(singleOrder);
        // Pull all orders from backend to ensure consistency
        fetchOrders();
        setActiveTab(2); // Navigate to Orders

        // Auto-open tracking only if it's a single order. If multi-seller, let them open manually.
        if (backendOrders?.length === 1) {
            setTrackingOrder(singleOrder);
        } else {
            setTrackingOrder(null);
        }
    }, [setBackendOrder, fetchOrders, setActiveTab]);


    const handleProductTap = useCallback(async (product) => {
        // Check if multiple sellers offer this product
        if (customerGps) {
            try {
                const params = new URLSearchParams({
                    q: product.name, lat: customerGps.lat, lng: customerGps.lng, sort: "distance"
                });
                const res = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/products/search?${params}`);
                const data = await res.json();
                if (data.ok && data.grouped) {
                    const key = product.name.toLowerCase().trim();
                    const group = data.grouped.find(g => g.name.toLowerCase().trim() === key);
                    if (group && group.variants.length > 1) {
                        setMultiSellerData({ productName: product.name, variants: group.variants });
                        return;
                    }
                }
            } catch (e) { /* fallback to detail sheet */ }
        }
        // Single seller or no GPS - open detail sheet
        setDetailProduct(product);
    }, [customerGps]);

    const handleAddToCart = useCallback((id) => {
        const p = products.find(x => x.id === id);
        addToCart(id);
        if (!cart[id]) showToast(`${p?.name || "Item"} added to cart!`, "success", "🛒");
    }, [addToCart, cart, products, showToast]);

    // ── HOME TAB ──────────────────────────────────────────────────────────────
    const HomeTab = () => (
        <div className="col gap16">
            {/* Hero / Welcome */}
            <div className="welcome-hero" style={{ background: `linear-gradient(135deg,${P.primary},#6366F1)`, borderRadius: 20, padding: "22px 22px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -20, top: -20, fontSize: 80, opacity: 0.12 }}>🛍</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Welcome back,</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "white" }}>{user?.name} 👋</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
                    📍 {user?.address || (customerGps ? `${customerGps.lat.toFixed(4)}°N, ${customerGps.lng.toFixed(4)}°E` : "Detecting location...")} &nbsp;·&nbsp; 💰 Wallet: ₹{user?.walletBalance?.toLocaleString("en-IN") || "0"}
                </div>

            </div>



            {/* Search */}
            <div style={{ position: "relative" }}>
                <label htmlFor="cust-search" style={{ display: "none" }}>Search products</label>
                <input id="cust-search" type="text" className="p-input" placeholder="🔍 Search groceries, dairy, bakery..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ paddingRight: search ? 36 : undefined }} />
                {search && (
                    <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: P.textMuted, cursor: "pointer", fontSize: 18 }} aria-label="Clear search">✕</button>
                )}
            </div>

            {/* Category Pills */}
            <div className="cat-pills">
                {categories.map(c => (
                    <button key={c} className={`cat-pill ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                        {c === "All" ? "🏠 All" : c === "Fresh Produce" ? "🥬 " + c : c === "Dairy" ? "🥛 " + c : c === "Grains" ? "🌾 " + c : c === "Bakery" ? "🍞 " + c : c}
                    </button>
                ))}
            </div>

            {/* Product Grid */}
            {loading ? (
                <SkeletonGrid />
            ) : noLocalSellers ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🌍</div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No Sellers Nearby</div>
                    <div style={{ fontSize: 13, maxWidth: 260, margin: "0 auto" }}>We are not currently serving your exact geographic area. Sellers are required to be within 5km.</div>
                    <button className="p-btn p-btn-ghost" style={{ marginTop: 16 }} onClick={() => setNoLocalSellers(false)}>View Global Catalog</button>
                </div>
            ) : displayProducts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🔍</div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No products found</div>
                    <div style={{ fontSize: 13 }}>Try a different search or category</div>
                    <button className="p-btn p-btn-ghost" style={{ marginTop: 16 }} onClick={() => { setSearch(""); setCategory("All"); }}>Clear Filters</button>
                </div>
            ) : (
                <div className="product-grid-v2">
                    {displayProducts.map(p => (
                        <ProductCard
                            key={p.id}
                            p={p}
                            qty={cart[p.id] || 0}
                            onAdd={handleAddToCart}
                            onRemove={removeFromCart}
                            onOpen={handleProductTap}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    // ── CART TAB ──────────────────────────────────────────────────────────────
    const CartTab = () => {
        const cartItems = Object.entries(cart).map(([id, qty]) => {
            const p = products.find(x => x.id === id);
            return p ? { ...p, qty } : null;
        }).filter(Boolean);

        return (
            <div className="col gap16">
                <div className="row-between">
                    <h2 style={{ fontWeight: 800, fontSize: 20 }}>🛒 Cart {cartCount > 0 ? `(${cartCount})` : ""}</h2>
                    {cartItems.length > 0 && (
                        <button className="p-btn p-btn-ghost p-btn-sm" onClick={clearCart} style={{ fontSize: 12, color: P.danger }}>Clear All</button>
                    )}
                </div>

                {cartItems.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: P.textMuted }}>
                        <div style={{ fontSize: 70, marginBottom: 16 }}>🛒</div>
                        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Your cart is empty</div>
                        <div style={{ fontSize: 13, marginBottom: 20 }}>Start adding some delicious items!</div>
                        <button className="p-btn p-btn-primary" onClick={() => setActiveTab(0)}>Start Shopping</button>
                    </div>
                ) : (
                    <>
                        <div className="col gap10">
                            {cartItems.map(item => (
                                <div key={item.id} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                                    {/* Image */}
                                    <div style={{ width: 52, height: 52, borderRadius: 10, background: P.surface, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                                        {item.imageUrl
                                            ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            : <span style={{ fontSize: 28 }}>{item.emoji}</span>
                                        }
                                    </div>
                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                                        <div style={{ fontSize: 12, color: P.textMuted }}>₹{item.sellingPrice} per {item.unit}</div>
                                    </div>
                                    {/* Qty stepper */}
                                    <div className="qty-stepper" style={{ flexShrink: 0 }}>
                                        <button onClick={() => removeFromCart(item.id)}>−</button>
                                        <span className="qty-val">{item.qty}</span>
                                        <button onClick={() => addToCart(item.id)}>+</button>
                                    </div>
                                    {/* Row total */}
                                    <div style={{ fontWeight: 800, fontSize: 14, minWidth: 50, textAlign: "right", flexShrink: 0 }}>₹{item.sellingPrice * item.qty}</div>
                                </div>
                            ))}
                        </div>

                        {/* Bill summary */}
                        <div style={{ background: P.card, border: `1px solid ${P.primary}44`, borderRadius: 16, padding: "16px 18px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Bill Details</div>
                            <div className="row-between mb8"><span style={{ fontSize: 13 }}>Item Total</span><span style={{ fontSize: 13 }}>₹{cartTotal}</span></div>
                            <div className="row-between mb8" style={{ color: P.textMuted, fontSize: 13 }}><span>Delivery Fee</span><span>₹30</span></div>
                            <div className="row-between mb8" style={{ color: P.textMuted, fontSize: 13 }}><span>Platform Fee</span><span>₹5</span></div>
                            {cartTotal > 200 && (
                                <div className="row-between mb8" style={{ color: P.success, fontSize: 13 }}><span>💰 Extra Savings</span><span>−₹{Math.round(cartTotal * 0.02)}</span></div>
                            )}
                            <div style={{ height: 1, background: P.border, margin: "10px 0" }} />
                            <div className="row-between" style={{ fontWeight: 800, fontSize: 18 }}>
                                <span>To Pay</span>
                                <span>₹{cartTotal + 35 - (cartTotal > 200 ? Math.round(cartTotal * 0.02) : 0)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: P.textMuted, marginTop: 6 }}>🚀 Estimated delivery in 15-25 min</div>

                            <button className="p-btn p-btn-primary w-100" style={{ marginTop: 16, fontSize: 16, minHeight: 50 }} onClick={handleCheckout}>
                                {`Checkout — ₹${cartTotal + 35 - (cartTotal > 200 ? Math.round(cartTotal * 0.02) : 0)}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ── ORDERS TAB (Production-grade) ─────────────────────────────────────────
    const OrdersTab = () => (
        <OrdersPage
            onTrackOrder={setTrackingOrder}
            setActiveTab={setActiveTab}
        />
    );

    // ── SUPPORT TAB ───────────────────────────────────────────────────────────
    const SupportTab = () => {
        const { flagOrder } = useStore();
        const [issue, setIssue] = useState("");
        const [selectedOrder, setSelectedOrder] = useState(myOrders[0]?.id || "");
        const [sent, setSent] = useState(false);

        const submit = () => {
            if (!issue || !selectedOrder) return;
            flagOrder(selectedOrder, issue);
            setSent(true);
            setIssue("");
            showToast("Support ticket submitted! We'll respond within 30 min.", "success", "🎧");
        };

        return (
            <div className="col gap16">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>💬 Raise a Support Ticket</h2>
                {sent ? (
                    <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
                        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Ticket submitted!</div>
                        <div style={{ color: P.textMuted, fontSize: 14, marginBottom: 20 }}>Our support team will respond within 30 minutes</div>
                        <button className="p-btn p-btn-ghost" onClick={() => setSent(false)}>Raise another ticket</button>
                    </div>
                ) : (
                    <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 16, padding: "20px" }} className="col gap14">
                        <div className="p-field">
                            <label htmlFor="sup-order">Select Order</label>
                            <select id="sup-order" className="p-input" value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)}>
                                {myOrders.map(o => <option key={o.id} value={o.id}>{o.id} — ₹{o.total}</option>)}
                            </select>
                        </div>
                        <div className="p-field">
                            <label htmlFor="sup-issue">Describe your issue</label>
                            <input id="sup-issue" type="text" className="p-input" placeholder="e.g. Missing item, Wrong product, Delay..." value={issue} onChange={e => setIssue(e.target.value)} />
                        </div>
                        <button className="p-btn p-btn-primary" onClick={submit} disabled={!issue || !selectedOrder}>
                            Submit Ticket 🎧
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const WalletTab = () => <WalletPage />;

    const tabs = [<HomeTab />, <CartTab />, <OrdersTab />, <SupportTab />, <WalletTab />];

    return (
        <div>
            {tabs[activeTab] || <HomeTab />}

            {/* Floating cart FAB — visible on Home tab only */}
            {activeTab === 0 && (
                <CartFAB count={cartCount} total={cartTotal} onClick={() => setActiveTab(1)} />
            )}

            {/* Product detail bottom sheet */}
            {detailProduct && (
                <ProductDetailSheet product={detailProduct} onClose={() => setDetailProduct(null)} />
            )}

            {/* Multi-step Checkout Modal */}
            {showCheckout && (
                <CheckoutFlow
                    onClose={() => setShowCheckout(false)}
                    onSuccess={handleCheckoutSuccess}
                />
            )}

            {/* Live Tracking Modal */}
            {trackingOrder && (
                <TrackOrderModal order={trackingOrder} onClose={() => setTrackingOrder(null)} />
            )}

            {/* Multi-Seller Comparison Sheet */}
            {multiSellerData && (
                <MultiSellerSheet
                    productName={multiSellerData.productName}
                    variants={multiSellerData.variants}
                    onClose={() => setMultiSellerData(null)}
                />
            )}

        </div>
    );
}
