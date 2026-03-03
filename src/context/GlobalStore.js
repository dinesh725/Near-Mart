import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    PURCHASE_ORDERS as INIT_POS,
    PRODUCTS as INIT_PRODUCTS,
    INIT_ORDERS,
    INIT_TICKETS,
    INIT_NOTIFICATIONS,
    VENDOR_INVENTORY as INIT_VENDOR_INV,
    INIT_PROCUREMENT,
} from "../data/mockData";

// ── Order Status Machine ──────────────────────────────────────────────────────
export const ORDER_STATUS = {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    PREPARING: "PREPARING",
    ACCEPTED: "ACCEPTED", // legacy alias for CONFIRMED
    READY_FOR_PICKUP: "READY_FOR_PICKUP",
    OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    CANCELLED: "CANCELLED",
};

const VALID_TRANSITIONS = {
    PENDING: ["CONFIRMED", "ACCEPTED", "CANCELLED"],
    CONFIRMED: ["PREPARING", "CANCELLED"],
    PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
    ACCEPTED: ["READY_FOR_PICKUP", "PREPARING", "CANCELLED"], // legacy compat
    READY_FOR_PICKUP: ["OUT_FOR_DELIVERY"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
};

export function canTransition(from, to) {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function load(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    catch { return fallback; }
}
function persist(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

// ── Context ───────────────────────────────────────────────────────────────────
const GlobalStoreContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function GlobalStoreProvider({ children }) {

    // ── SCM (Supply Chain) ───────────────────────────────────────────────────
    const [products, setProducts] = useState(() => load("nm_products", INIT_PRODUCTS));
    const [purchaseOrders, setPurchaseOrders] = useState(() => load("nm_pos", INIT_POS));

    // ── Platform Collections ─────────────────────────────────────────────────
    const [orders, setOrders] = useState(() => load("nm_orders", INIT_ORDERS));
    const [cart, setCart] = useState(() => load("nm_cart", {}));           // { [productId]: qty }

    const [tickets, setTickets] = useState(() => load("nm_tickets", INIT_TICKETS));
    const [notifications, setNotifications] = useState(() => load("nm_notifs", INIT_NOTIFICATIONS));
    const [vendorInventory, setVendorInventory] = useState([]);
    const [procurement, setProcurement] = useState([]);
    const [shareViewEnabled, setShareViewEnabled] = useState(false);

    // ── Global Toast Stack (GlobalNotifStack reads this) ─────────────────────
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((msg, type = "info", icon = null, forRole = null, duration = 4500) => {
        const id = `T${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        setToasts(prev => [...prev, { id, msg, type, icon, forRole, duration }].slice(-8));
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // ── Persistence (debounced — batches writes to avoid thrashing localStorage)
    const persistTimerRef = useRef(null);
    useEffect(() => {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            persist("nm_products", products);
            persist("nm_pos", purchaseOrders);
            persist("nm_orders", orders);
            persist("nm_tickets", tickets);
            persist("nm_notifs", notifications);
            persist("nm_vendinv", vendorInventory);
            persist("nm_proc", procurement);
            persist("nm_cart", cart);
        }, 500);
        return () => clearTimeout(persistTimerRef.current);
    }, [products, purchaseOrders, orders, tickets, notifications, vendorInventory, procurement, cart]);

    // ── Notification Engine ───────────────────────────────────────────────────
    const notifyRole = useCallback((forRole, msg, type = "info") => {
        const notif = {
            id: `N${Date.now()}`,
            forRole, type, msg, read: false, time: Date.now(),
        };
        setNotifications(prev => [notif, ...prev].slice(0, 50));
        // Also fire a floating toast visible to that role
        showToast(msg, type, null, forRole);
    }, [showToast]);

    const markNotifRead = useCallback((id) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }, []);

    const clearNotifs = useCallback((role) => {
        setNotifications(prev => prev.map(n => n.forRole === role ? { ...n, read: true } : n));
    }, []);

    // ── Product Actions ───────────────────────────────────────────────────────
    const updatePrice = useCallback((id, newPrice) => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, sellingPrice: +newPrice } : p));
    }, []);

    const updateStock = useCallback((id, delta) => {
        setProducts(prev => prev.map(p =>
            p.id === id ? { ...p, stock: Math.max(0, p.stock + +delta) } : p
        ));
    }, []);

    const updateProductImage = useCallback((id, imageUrl) => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, imageUrl } : p));
    }, []);

    const addProduct = useCallback((prod) => {
        const newProd = {
            ...prod,
            id: `P${String(Date.now()).slice(-4)}`,
            weekSales: [0, 0, 0, 0, 0, 0, 0],
            monthlySales: 0, monthlyRevenue: 0, monthlyProfit: 0,
            stock: +prod.stock || 0, sellingPrice: +prod.sellingPrice || 0,
            costPrice: +prod.costPrice || 0, mrp: +prod.mrp || +prod.sellingPrice || 0,
            marketAvgPrice: +prod.sellingPrice || 0,
            competitorLow: +prod.sellingPrice - 5, competitorHigh: +prod.sellingPrice + 10,
            gstRate: 0, deliveryAlloc: 3, platformComm: +prod.sellingPrice * 0.1,
            demandTrend: "stable", transparencyMode: "partial",
        };
        setProducts(prev => [...prev, newProd]);
        notifyRole("vendor", `New product listed: ${prod.name}`, "info");
    }, [notifyRole]);

    // ── Cart Actions ──────────────────────────────────────────────────────────
    const addToCart = useCallback((productId) => {
        setCart(prev => {
            const product = products.find(p => p.id === productId);
            if (!product || product.stock === 0) return prev;
            const currentQty = prev[productId] || 0;
            // D4: Prevent adding more than available stock
            if (currentQty >= product.stock) return prev;
            return { ...prev, [productId]: currentQty + 1 };
        });
    }, [products]);

    const removeFromCart = useCallback((productId) => {
        setCart(prev => {
            const next = { ...prev };
            if (!next[productId] || next[productId] <= 1) delete next[productId];
            else next[productId]--;
            return next;
        });
    }, []);

    const clearCart = useCallback(() => setCart({}), []);

    // P1: Memoize cart computations to prevent recalculation every render
    const cartCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);
    const cartTotal = useMemo(() => Object.entries(cart).reduce((sum, [id, qty]) => {
        const p = products.find(x => x.id === id);
        return sum + (p ? p.sellingPrice * qty : 0);
    }, 0), [cart, products]);

    // ── Order Pipeline ────────────────────────────────────────────────────────
    const placeOrder = useCallback((customerId, customerName, address, paymentMethod = "Wallet") => {
        const cartItems = Object.entries(cart)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => {
                const p = products.find(x => x.id === id);
                // E1: Guard against deleted products
                if (!p) return null;
                return { productId: id, name: p.name, emoji: p.emoji, qty, price: p.sellingPrice };
            })
            .filter(Boolean);

        if (cartItems.length === 0) return null;

        // Check stock availability
        let valid = true;
        cartItems.forEach(item => {
            const p = products.find(x => x.id === item.productId);
            if (!p || p.stock < item.qty) valid = false;
        });
        if (!valid) { showToast("Some items are out of stock!", "alert"); return null; }

        // D5: Use Date.now + random to guarantee unique IDs
        const ordId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
        const newOrder = {
            id: ordId,
            customerId, customerName,
            storeId: null, storeName: null,
            // pickupLocation and dropLocation are null for locally-created orders.
            // Real GPS coordinates are assigned by the backend when the order is
            // submitted via POST /api/orders. TrackOrderModal checks for these before
            // rendering the map — if null it shows "Map routing in progress..." safely.
            pickupLocation: null,
            dropLocation: null,
            items: cartItems, total,
            status: ORDER_STATUS.PENDING,
            riderId: null, riderName: null,
            createdAt: Date.now(), updatedAt: Date.now(),
            address, paymentMethod, flagged: false,
        };


        // Dedup guard — prevent inserting if same id already exists
        setOrders(prev => {
            if (prev.some(o => o.id === ordId || o._id === ordId)) return prev;
            return [newOrder, ...prev];
        });

        // Deduct stock
        cartItems.forEach(item => updateStock(item.productId, -item.qty));
        clearCart();

        // Notify pipeline
        notifyRole("seller", `New order ${newOrder.id} — ₹${total}`, "order");
        notifyRole("customer", `Order ${newOrder.id} placed! ₹${total} via ${paymentMethod}`, "update");
        notifyRole("admin", `New order ${newOrder.id} from ${customerName}`, "info");

        // Auto check for low stock
        cartItems.forEach(item => {
            const p = products.find(x => x.id === item.productId);
            if (p && p.stock - item.qty < 10) {
                notifyRole("seller", `⚠ Low stock: ${p.name} (${p.stock - item.qty} left)`, "alert");
                notifyRole("vendor", `Demand spike for ${p.name} — restock needed`, "demand");
            }
        });

        return newOrder;
    }, [cart, products, clearCart, updateStock, notifyRole, showToast]);

    const acceptOrder = useCallback((orderId, sellerId) => {
        setOrders(prev => prev.map(o => {
            if ((o.id !== orderId) && (o._id !== orderId)) return o;
            if (!canTransition(o.status, ORDER_STATUS.CONFIRMED)) return o;
            return { ...o, status: ORDER_STATUS.CONFIRMED, updatedAt: Date.now() };
        }));
        notifyRole("delivery", `Order ${orderId} confirmed — stay ready!`, "info");
        notifyRole("customer", `Your order was confirmed by the store!`, "update");
    }, [notifyRole]);

    const prepareOrder = useCallback((orderId, prepTime = 15) => {
        setOrders(prev => prev.map(o => {
            if ((o.id !== orderId) && (o._id !== orderId)) return o;
            if (!canTransition(o.status, ORDER_STATUS.PREPARING)) return o;
            return { ...o, status: ORDER_STATUS.PREPARING, prepTime, prepStartedAt: Date.now(), updatedAt: Date.now() };
        }));
        notifyRole("customer", `Your order is being prepared! ~${prepTime} min 👨‍🍳`, "update");
    }, [notifyRole]);

    const markReadyForPickup = useCallback((orderId) => {
        setOrders(prev => prev.map(o => {
            if ((o.id !== orderId) && (o._id !== orderId)) return o;
            if (!canTransition(o.status, ORDER_STATUS.READY_FOR_PICKUP)) return o;
            return { ...o, status: ORDER_STATUS.READY_FOR_PICKUP, updatedAt: Date.now() };
        }));
        notifyRole("delivery", `🚀 Order ${orderId} ready for pickup!`, "order");
        notifyRole("customer", `Order ${orderId} is packed and ready!`, "update");
    }, [notifyRole]);

    const startDelivery = useCallback((orderId, riderId, riderName) => {
        setOrders(prev => prev.map(o => {
            if ((o.id !== orderId) && (o._id !== orderId)) return o;
            if (!canTransition(o.status, ORDER_STATUS.OUT_FOR_DELIVERY)) return o;
            return { ...o, status: ORDER_STATUS.OUT_FOR_DELIVERY, riderId, riderName, updatedAt: Date.now() };
        }));
        notifyRole("customer", `🛵 ${riderName} is on the way with your order ${orderId}!`, "update");
        notifyRole("admin", `Delivery started: ${orderId} by ${riderName}`, "info");
    }, [notifyRole]);

    const markDelivered = useCallback((orderId) => {
        setOrders(prev => prev.map(o => {
            if (o.id !== orderId) return o;
            if (!canTransition(o.status, ORDER_STATUS.DELIVERED)) return o;
            // Update seller profit
            const revenue = o.items.reduce((s, i) => s + i.price * i.qty, 0);
            setProducts(ps => ps.map(p => {
                const item = o.items.find(i => i.productId === p.id);
                if (!item) return p;
                return { ...p, monthlyRevenue: p.monthlyRevenue + item.price * item.qty, monthlyProfit: p.monthlyProfit + (item.price - p.costPrice) * item.qty };
            }));
            notifyRole("customer", `✅ Order ${orderId} delivered! Enjoy your items 🎉`, "success");
            notifyRole("seller", `💰 Order ${orderId} delivered — ₹${revenue} revenue`, "success");
            notifyRole("admin", `Order ${orderId} completed — GMV +₹${revenue}`, "info");
            return { ...o, status: ORDER_STATUS.DELIVERED, updatedAt: Date.now() };
        }));
    }, [notifyRole]);

    const cancelOrder = useCallback((orderId, reason) => {
        // D1: Extract stock restoration outside .map() to avoid state mutation during render
        setOrders(prev => {
            const order = prev.find(o => o.id === orderId);
            if (!order || !canTransition(order.status, ORDER_STATUS.CANCELLED)) return prev;
            // Restore stock after state update
            setTimeout(() => {
                order.items.forEach(item => updateStock(item.productId, item.qty));
            }, 0);
            notifyRole("customer", `Order ${orderId} cancelled. Reason: ${reason}`, "alert");
            notifyRole("seller", `Order ${orderId} was cancelled`, "alert");
            return prev.map(o =>
                o.id === orderId
                    ? { ...o, status: ORDER_STATUS.CANCELLED, cancelReason: reason, updatedAt: Date.now() }
                    : o
            );
        });
    }, [updateStock, notifyRole]);

    const flagOrder = useCallback((orderId, issue) => {
        // D2: Use functional update to avoid stale `orders` closure
        setOrders(prev => {
            const order = prev.find(o => o.id === orderId);
            if (!order) return prev;
            // Create support ticket
            const ticket = {
                id: `TCK-${Date.now()}`,
                orderId, issue,
                customerId: order.customerId,
                customerName: order.customerName,
                status: "open",
                priority: "high",
                time: Date.now(),
            };
            setTickets(prevTickets => [ticket, ...prevTickets]);
            notifyRole("support", `🚩 Flagged order: ${orderId} — "${issue}"`, "ticket");
            return prev.map(o => o.id === orderId ? { ...o, flagged: true } : o);
        });
    }, [notifyRole]);

    // ── Real Backend Sync ─────────────────────────────────────────────────────
    const fetchOrders = useCallback(async () => {
        try {
            const token = localStorage.getItem("nm_access_token");
            if (!token) return;
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
            const res = await fetch(`${API_BASE}/orders`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok && data.orders) {
                // Merge with local orders, preferring backend ones
                setOrders(prev => {
                    const localOnly = prev.filter(p => !p._id && !data.orders.find(b => b.id === p.id));
                    return [...data.orders, ...localOnly];
                });
            }
        } catch (err) {
            console.error("Failed to fetch orders:", err);
        }
    }, []);

    const fetchProducts = useCallback(async () => {
        try {
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
            // Fetch all products with limit 100 to seed the store
            const res = await fetch(`${API_BASE}/products?limit=100`);
            const data = await res.json();
            if (data.ok && data.products && data.products.length > 0) {
                // Map _id to id for frontend compatibility
                const mapped = data.products.map(p => ({ ...p, id: p._id }));
                setProducts(mapped);
                persist("nm_products", mapped);
            }
        } catch (err) {
            console.error("Failed to fetch products:", err);
        }
    }, []);

    const fetchVendorInventory = useCallback(async () => {
        try {
            const token = localStorage.getItem("nm_access_token");
            if (!token) return;
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
            const res = await fetch(`${API_BASE}/vendor-inventory`, { headers: { "Authorization": `Bearer ${token}` } });
            const data = await res.json();
            if (data.ok && data.inventory) setVendorInventory(data.inventory.map(m => ({ ...m, id: m._id })));
        } catch (err) { console.error("Failed to fetch vendor inventory:", err); }
    }, []);

    const fetchProcurement = useCallback(async () => {
        try {
            const token = localStorage.getItem("nm_access_token");
            if (!token) return;
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
            const res = await fetch(`${API_BASE}/procurement`, { headers: { "Authorization": `Bearer ${token}` } });
            const data = await res.json();
            if (data.ok && data.procurement) setProcurement(data.procurement.map(m => ({ ...m, id: m._id })));
        } catch (err) { console.error("Failed to fetch proc:", err); }
    }, []);

    // Initial data load
    useEffect(() => {
        fetchProducts();
        fetchOrders();
        fetchVendorInventory();
        fetchProcurement();
    }, [fetchProducts, fetchOrders, fetchVendorInventory, fetchProcurement]);

    const setBackendOrder = useCallback((order) => {
        setOrders(prev => {
            const matchId = order._id || order.id;
            if (!matchId) return prev;
            const exists = prev.some(o => (o._id || o.id) === matchId);
            if (exists) return prev.map(o => (o._id || o.id) === matchId ? { ...o, ...order } : o);
            return [order, ...prev];
        });
    }, []);

    // ── Support Actions ───────────────────────────────────────────────────────
    const [chats, setChats] = useState({});

    const sendSupportMessage = useCallback((ticketId, text, from = "agent") => {
        if (!text.trim()) return;
        const msg = { id: Date.now(), from, text: text.trim(), time: Date.now() };
        setChats(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] || []), msg] }));
    }, []);

    const resolveTicket = useCallback((ticketId) => {
        // D3: Use functional update to avoid stale `tickets` closure
        setTickets(prev => {
            const ticket = prev.find(t => t.id === ticketId);
            if (ticket) notifyRole("customer", `Your ticket ${ticketId} has been resolved ✅`, "success");
            return prev.map(t => t.id === ticketId ? { ...t, status: "resolved" } : t);
        });
    }, [notifyRole]);

    // ── SCM / Purchase Order Actions ──────────────────────────────────────────
    const createPO = useCallback(async (details) => {
        try {
            const token = localStorage.getItem("nm_access_token");
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

            // Fire a single bundled procurement request for the vendor behind the scenes
            if (token) {
                const res = await fetch(`${API_BASE}/procurement`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({
                        items: details.items.map(item => ({
                            productName: item.name,
                            qty: Number(item.qty),
                            costPrice: Number(item.costPrice)
                        })),
                        vendorId: details.supplierId,
                        vendorName: details.supplierName
                    })
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || `Server declined with status ${res.status}`);
                }
            }
        } catch (err) {
            console.error("Failed to create PO:", err);
            throw err; // Forward error to UI!
        }

        const newPO = {
            id: `PO-${Date.now()}`,
            date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
            expectedDelivery: new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
            deliveredDate: null, status: "pending", paymentStatus: "pending",
            paymentMethod: "NEFT", hasInvoice: false, invoiceNo: null,
            gst: 0, discount: 0, ...details,
            supplier: details.supplierName || details.supplier || "Unknown",
            total: (details.subtotal || 0) + (details.gst || 0) - (details.discount || 0),
        };
        setPurchaseOrders(prev => [newPO, ...prev]);
        fetchProcurement(); // refresh local records
        return newPO;
    }, [fetchProcurement]);

    const updatePOStatus = useCallback((id, status) => {
        setPurchaseOrders(prev => prev.map(po =>
            po.id === id ? { ...po, status, deliveredDate: status === "delivered" ? "Today" : po.deliveredDate } : po
        ));
    }, []);

    // ── Vendor Actions ────────────────────────────────────────────────────────
    const vendorFulfillOrder = useCallback(async (procurementId, qty) => {
        try {
            const token = localStorage.getItem("nm_access_token");
            const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

            if (token) {
                const res = await fetch(`${API_BASE}/procurement/${procurementId}/accept`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
                });
                const data = await res.json();
                if (!data.ok) {
                    notifyRole("vendor", `Error: ${data.error}`, "alert");
                    return false;
                }
            }
        } catch (err) {
            console.error(err);
        }

        setProcurement(prev => prev.map(p =>
            p.id === procurementId ? { ...p, status: "accepted" } : p
        ));

        // Note: Stock is no longer instantly injected here. 
        // It's deferred until the Delivery Rider successfully validates the OTP at drop-off.
        return true;
    }, [notifyRole]);

    const createProcurementRequest = useCallback((details) => {
        const rec = {
            id: `PR-${Date.now()}`,
            date: Date.now(),
            status: "pending",
            ...details,
        };
        setProcurement(prev => [rec, ...prev]);
        notifyRole("vendor", `New procurement request: ${details.productName} × ${details.qty}`, "order");
    }, [notifyRole]);

    const resetData = useCallback(() => {
        setProducts(INIT_PRODUCTS);
        setPurchaseOrders(INIT_POS);
        setOrders(INIT_ORDERS);
        setTickets(INIT_TICKETS);
        setNotifications(INIT_NOTIFICATIONS);
        setVendorInventory(INIT_VENDOR_INV);
        setProcurement(INIT_PROCUREMENT);
        setCart({});
        ["nm_products", "nm_pos", "nm_orders", "nm_tickets", "nm_notifs", "nm_vendinv", "nm_proc", "nm_cart"].forEach(k => localStorage.removeItem(k));
    }, []);

    return (
        <GlobalStoreContext.Provider value={{
            // SCM
            products, purchaseOrders,
            updatePrice, updateStock, addProduct, updateProductImage, createPO, updatePOStatus,
            // Cart
            cart, cartCount, cartTotal, addToCart, removeFromCart, clearCart,
            // Orders
            orders, placeOrder, acceptOrder, prepareOrder, markReadyForPickup,
            startDelivery, markDelivered, cancelOrder, flagOrder,
            fetchOrders, fetchProducts, setBackendOrder,
            ORDER_STATUS, canTransition,
            // Support
            tickets, chats, sendSupportMessage, resolveTicket,
            // Notifications
            notifications, notifyRole, markNotifRead, clearNotifs,
            toasts, showToast, dismissToast,
            // Vendor
            vendorInventory, procurement,
            vendorFulfillOrder, createProcurementRequest,
            shareViewEnabled, setShareViewEnabled,
            // Misc
            resetData,
        }}>
            {children}
        </GlobalStoreContext.Provider>
    );
}

export function useStore() {
    const ctx = useContext(GlobalStoreContext);
    if (!ctx) throw new Error("useStore must be inside <GlobalStoreProvider>");
    return ctx;
}

// Legacy alias — keeps old imports working
export function useNearMart() { return useStore(); }
