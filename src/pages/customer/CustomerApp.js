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
import { PullToRefresh } from "../../components/PullToRefresh";
import api from "../../api/client";

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
    const { products, cart, cartCount, cartTotal, addToCart, removeFromCart, clearCart, setCartDirect, fetchOrders, setBackendOrder, showToast } = useStore();
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("All");
    const [showCheckout, setShowCheckout] = useState(false);
    const [loading, setLoading] = useState(true);
    const [detailProduct, setDetailProduct] = useState(null);
    const [trackingOrder, setTrackingOrder] = useState(null);
    const [multiSellerData, setMultiSellerData] = useState(null); // { productName, variants }
    const [customerGps, setCustomerGps] = useState(null);

    const categories = ["All", ...new Set(products.map(p => p.category))];


    const [gpsStatus, setGpsStatus] = useState("fetching"); // "fetching", "located", or "failed"

    const retryLocation = useCallback(() => {
        setGpsStatus("fetching");
        setLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    setCustomerGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setGpsStatus("located");
                },
                (err) => {
                    console.warn("Geolocation failed or denied:", err);
                    setGpsStatus("failed");
                    setLoading(false);
                },
                { enableHighAccuracy: false, timeout: 8000 }
            );
        } else {
            setGpsStatus("failed");
            setLoading(false);
        }
    }, []);

    // Auto-detect customer GPS on mount (once)
    useEffect(() => {
        retryLocation();
    }, [retryLocation]);

    // ── Infinite-scroll product fetching ─────────────────────────────────────
    const [liveProducts, setLiveProducts] = useState([]);
    const [noLocalSellers, setNoLocalSellers] = useState(false);
    const [productPage, setProductPage] = useState(1);
    const [hasMoreProducts, setHasMoreProducts] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const sentinelRef = useRef(null);

    // Helper: transform grouped backend data to display items
    const mapGroupedToProducts = useCallback((grouped) => {
        return grouped.map(bg => {
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
    }, []);

    // Fetch products page (page 1 = fresh load, page > 1 = append for infinite scroll)
    const fetchProductsPage = useCallback(async (page = 1) => {
        if (!customerGps) return;
        if (page === 1) setLoading(true);
        else setLoadingMore(true);

        try {
            const params = new URLSearchParams({
                lat: customerGps.lat, lng: customerGps.lng, sort: "distance",
                page: String(page), limit: "20"
            });
            if (search) params.append("q", search);
            if (category !== "All") params.append("category", category);

            const res = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/products/search?${params}`);
            const data = await res.json();

            if (data.ok && data.grouped) {
                const newItems = mapGroupedToProducts(data.grouped);
                if (page === 1) {
                    setLiveProducts(newItems);
                    setNoLocalSellers(newItems.length === 0 && data.totalGroups === 0);
                } else {
                    setLiveProducts(prev => [...prev, ...newItems]);
                }
                setHasMoreProducts(data.hasMore === true);
                setProductPage(page);
            }
        } catch (err) {
            if (page === 1) setLiveProducts([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [customerGps, search, category, mapGroupedToProducts]);

    // Initial load & when filters change → reset to page 1
    useEffect(() => {
        if (gpsStatus !== "located" || !customerGps) return;
        setProductPage(1);
        setHasMoreProducts(false);
        fetchProductsPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerGps, search, category, gpsStatus]);

    // IntersectionObserver for infinite scroll – triggers when sentinel div is visible
    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && hasMoreProducts && !loadingMore && !loading) {
                    fetchProductsPage(productPage + 1);
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMoreProducts, loadingMore, loading, productPage, fetchProductsPage]);

    // Derived state for the UI
    const displayProducts = liveProducts;

    const handleCheckout = useCallback(() => {
        if (cartCount === 0) return;
        setShowCheckout(true);
    }, [cartCount]);

    // Called when checkout succeeds — sync real backend order, then open Orders tab
    const handleCheckoutSuccess = useCallback((backendOrders) => {
        setShowCheckout(false);
        const singleOrder = backendOrders?.[0] || null;
        if (singleOrder) setBackendOrder(singleOrder);
        fetchOrders();
        setActiveTab(2); // Navigate to Orders

        if (backendOrders?.length === 1) {
            setTrackingOrder(singleOrder);
        } else {
            setTrackingOrder(null);
        }
    }, [setBackendOrder, fetchOrders, setActiveTab]);


    const handleProductTap = useCallback(async (product) => {
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
        setDetailProduct(product);
    }, [customerGps]);

    const handleAddToCart = useCallback((id) => {
        const p = products.find(x => x.id === id);
        addToCart(id);
        if (!cart[id]) showToast(`${p?.name || "Item"} added to cart!`, "success", "🛒");
    }, [addToCart, cart, products, showToast]);

    // ── HOME TAB ──────────────────────────────────────────────────────────────
    const HomeTab = () => (
        <PullToRefresh onRefresh={() => fetchProductsPage(1)}>
            <div className="col gap16">
            {/* Hero / Welcome */}
            <div className="welcome-hero" style={{ background: `linear-gradient(135deg,${P.primary},#6366F1)`, borderRadius: 20, padding: "22px 22px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -20, top: -20, fontSize: 80, opacity: 0.12 }}>🛍</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Welcome back,</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "white" }}>{user?.name} 👋</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
                    📍 {user?.address || (customerGps ? `${customerGps.lat.toFixed(4)}°N, ${customerGps.lng.toFixed(4)}°E` : "Location Required")} &nbsp;·&nbsp; 💰 Wallet: ₹{user?.walletBalance?.toLocaleString("en-IN") || "0"}
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
            ) : gpsStatus === "failed" ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: P.textMuted }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>📍</div>
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: P.text }}>Location Required</div>
                    <div style={{ fontSize: 14, maxWidth: 280, margin: "0 auto", lineHeight: 1.5, marginBottom: 20 }}>
                        We need your location to show products available for delivery in your area. Please enable location services.
                    </div>
                    <button className="p-btn p-btn-primary" style={{ padding: "10px 24px" }} onClick={retryLocation}>
                        Enable Location & Retry
                    </button>
                </div>
            ) : noLocalSellers ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🌍</div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No Sellers Nearby</div>
                    <div style={{ fontSize: 13, maxWidth: 260, margin: "0 auto" }}>We are not currently serving your exact geographic area. Sellers are required to be within 5km.</div>
                </div>
            ) : displayProducts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: P.textMuted }}>
                    <div style={{ fontSize: 60, marginBottom: 16 }}>🔍</div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No products found</div>
                    <div style={{ fontSize: 13 }}>Try a different search or category</div>
                    <button className="p-btn p-btn-ghost" style={{ marginTop: 16 }} onClick={() => { setSearch(""); setCategory("All"); }}>Clear Filters</button>
                </div>
            ) : (
                <>
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
                    {/* Infinite scroll sentinel */}
                    {hasMoreProducts && (
                        <div ref={sentinelRef} style={{ textAlign: "center", padding: "20px 0" }}>
                            <div style={{
                                display: "inline-flex", alignItems: "center", gap: 8,
                                fontSize: 13, color: P.textMuted, padding: "8px 16px",
                                background: P.surface, borderRadius: 20, border: `1px solid ${P.border}`
                            }}>
                                <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: P.primary, animation: "pulse 1.2s infinite" }} />
                                Loading more products...
                            </div>
                        </div>
                    )}
                    {!hasMoreProducts && displayProducts.length > 0 && (
                        <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12, color: P.textDim }}>
                            ✅ You've seen all {displayProducts.length} products available near you
                        </div>
                    )}
                </>
            )}
        </div>
        </PullToRefresh>
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

    // ── Handle reorder: populate cart + navigate to cart tab ───────────────────
    const handleReorderToCart = useCallback((cartItems, unavailable) => {
        // Build a cart object: { productId: qty }
        const newCart = {};
        cartItems.forEach(item => {
            newCart[item.productId] = item.qty;
        });
        clearCart();
        // Small delay to ensure clearCart processes first
        setTimeout(() => {
            setCartDirect(newCart);
            // Show unavailable items warning
            if (unavailable && unavailable.length > 0) {
                showToast(`${unavailable.length} item(s) unavailable: ${unavailable.join(", ")}. Removed from cart.`, "alert", "⚠️");
            } else {
                showToast(`${cartItems.length} item(s) added to cart! Review and checkout.`, "success", "🛒");
            }
            setActiveTab(1); // Navigate to Cart tab
        }, 100);
    }, [clearCart, setCartDirect, showToast, setActiveTab]);

    // ── ORDERS TAB (Production-grade) ─────────────────────────────────────────
    const OrdersTab = () => (
        <OrdersPage
            onTrackOrder={setTrackingOrder}
            setActiveTab={setActiveTab}
            onReorderToCart={handleReorderToCart}
            customerGps={customerGps}
        />
    );

    // ── SUPPORT TAB (Unified Inbox) ───────────────────────────────────────────
    const SupportTab = () => {
        const [tickets, setTickets] = useState([]);
        const [loading, setLoading] = useState(true);
        const [selectedTicket, setSelectedTicket] = useState(null);
        const [replyText, setReplyText] = useState("");
        const chatEndRef = useRef(null);

        useEffect(() => {
            fetchTickets();
        }, []);

        useEffect(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, [selectedTicket?.messages]);

        const fetchTickets = async () => {
            setLoading(true);
            try {
                const res = await api.get("/tickets");
                if (res.ok && res.tickets) setTickets(res.tickets);
            } catch (e) {
                console.error("Failed to load tickets", e);
            } finally {
                setLoading(false);
            }
        };

        const handleSendReply = async () => {
            if (!replyText.trim() || !selectedTicket) return;
            const text = replyText;
            setReplyText("");
            try {
                // Optimistic UI update
                const newMsg = { from: "customer", text, createdAt: new Date().toISOString() };
                setSelectedTicket(prev => ({ ...prev, messages: [...prev.messages, newMsg] }));

                const res = await api.post(`/tickets/${selectedTicket._id}/message`, { text, from: "customer" });
                if (res.ok) setSelectedTicket(res.ticket);
            } catch (e) {
                console.error("Failed to send message", e);
            }
        };

        if (loading && !tickets.length) {
            return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
                    <div className="spinner" style={{ width: 44, height: 44, borderWidth: 3, marginBottom: 20 }} />
                    <div style={{ fontWeight: 700, color: P.textMuted, fontSize: 15 }}>Loading Inbox...</div>
                </div>
            );
        }

        // ── Chat View ──
        if (selectedTicket) {
            return (
                <div className="col" style={{ 
                    // Make it take the full screen height available below the header
                    position: "fixed", inset: 0, top: 0, bottom: 65, zIndex: 99, 
                    background: P.bg, display: "flex", flexDirection: "column" 
                }}>
                    {/* Header */}
                    <div style={{ padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${P.border}`, background: P.card, boxShadow: `0 4px 20px rgba(0,0,0,0.1)` }}>
                        <button onClick={() => setSelectedTicket(null)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: P.text }}>←</button>
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Ticket #{selectedTicket._id?.slice(-6).toUpperCase()}</h2>
                            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2, fontWeight: 500 }}>
                                {selectedTicket.problemItems?.length > 0 ? `${selectedTicket.problemItems.length} items flagged` : "General Order Issue"}
                            </div>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ 
                            background: `${P.primary}10`, border: `1px solid ${P.primary}33`, borderRadius: 16, 
                            padding: 16, alignSelf: "center", maxWidth: "90%", textAlign: "center", marginBottom: 10
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: P.primary, textTransform: "uppercase", marginBottom: 6 }}>Original Issue</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: P.text }}>{selectedTicket.issue}</div>
                        </div>

                        {selectedTicket.messages?.map((msg, idx) => (
                            <div key={idx} style={{ alignSelf: msg.from === "customer" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                                <div style={{ 
                                    padding: "12px 16px", borderRadius: 20, 
                                    background: msg.from === "customer" ? P.primary : P.surface, 
                                    color: msg.from === "customer" ? "white" : P.text,
                                    border: msg.from === "customer" ? "none" : `1px solid ${P.border}`,
                                    borderBottomRightRadius: msg.from === "customer" ? 4 : 20,
                                    borderBottomLeftRadius: msg.from !== "customer" ? 4 : 20,
                                    fontSize: 14, lineHeight: 1.5, fontWeight: 500
                                }}>
                                    {msg.text}
                                </div>
                                <div style={{ fontSize: 10, color: P.textDim, marginTop: 6, fontWeight: 600, textAlign: msg.from === "customer" ? "right" : "left" }}>
                                    {new Date(msg.createdAt || msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Field */}
                    {selectedTicket.status !== "resolved" ? (
                        <div style={{ padding: "16px 20px", borderTop: `1px solid ${P.border}`, background: P.card, display: "flex", gap: 12 }}>
                            <input type="text" className="p-input" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type your reply here..." style={{ flex: 1, borderRadius: 24, paddingLeft: 20 }} onKeyDown={e => e.key === "Enter" && handleSendReply()} />
                            <button className="p-btn p-btn-primary" onClick={handleSendReply} disabled={!replyText.trim()} style={{ borderRadius: 24, padding: "0 24px" }}>Send ↑</button>
                        </div>
                    ) : (
                        <div style={{ padding: 20, borderTop: `1px solid ${P.border}`, background: P.surface, textAlign: "center", color: P.success, fontSize: 14, fontWeight: 700 }}>
                            ✅ This ticket was resolved.
                        </div>
                    )}
                </div>
            );
        }

        // ── Inbox List View ──
        return (
            <div className="col gap20" style={{ paddingBottom: 40 }}>
                <h2 style={{ fontWeight: 800, fontSize: 24, margin: "10px 0 0" }}>📬 Support Inbox</h2>
                
                {tickets.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 20px", background: P.card, borderRadius: 24, border: `1px dashed ${P.border}` }}>
                        <div style={{ fontSize: 64, marginBottom: 20 }}>🎧</div>
                        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 10 }}>No Active issues</div>
                        <div style={{ color: P.textMuted, fontSize: 14, maxWidth: 280, margin: "0 auto", lineHeight: 1.5 }}>
                            Need help with an order? Go to your Orders tab and tap "Help / Support" to contact us.
                        </div>
                        <button className="p-btn p-btn-primary" style={{ marginTop: 24, width: "100%", maxWidth: 220 }} onClick={() => setActiveTab(2)}>Go to Orders</button>
                    </div>
                ) : (
                    <div className="col gap14">
                        {tickets.map(t => {
                            const unread = t.status !== "resolved" && t.messages?.length > 0 && t.messages[t.messages.length - 1].from !== "customer";
                            return (
                                <div key={t._id} onClick={() => setSelectedTicket(t)} style={{ 
                                    background: P.card, borderRadius: 16, padding: "18px", cursor: "pointer",
                                    border: unread ? `1px solid ${P.primary}` : `1px solid ${P.border}`,
                                    position: "relative", overflow: "hidden"
                                }}>
                                    {unread && <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, background: P.primary }} />}
                                    
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 20 }}>
                                                {t.reasonCategory === "missing_item" ? "📦" : t.reasonCategory === "damaged_item" ? "💥" : t.reasonCategory === "delivery_delay" ? "⏳" : "ℹ️"}
                                            </span>
                                            <span style={{ fontWeight: 800, fontSize: 14 }}>
                                                {t.reasonCategory?.replace("_", " ").toUpperCase() || "SUPPORT ISSUE"}
                                            </span>
                                        </div>
                                        <span style={{ 
                                            fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 8, textTransform: "uppercase", letterSpacing: 0.5,
                                            background: t.status === "open" ? `${P.danger}15` : t.status === "in_progress" ? `${P.warning}15` : `${P.success}15`, 
                                            color: t.status === "open" ? P.danger : t.status === "in_progress" ? P.warning : P.success 
                                        }}>
                                            {t.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 14, color: P.text, marginBottom: 14, fontWeight: 600, lineHeight: 1.4 }}>{t.issue}</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: P.textMuted, borderTop: `1px solid ${P.border}`, paddingTop: 12, fontWeight: 600 }}>
                                        <span>Order #{t.orderId?.slice(-6).toUpperCase()}</span>
                                        <span>{new Date(t.createdAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                    </div>
                                </div>
                            );
                        })}
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
