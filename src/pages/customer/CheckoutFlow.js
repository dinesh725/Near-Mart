import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import { P } from "../../theme/theme";
import { AddressPicker } from "../../components/AddressPicker";

/**
 * Multi-step Checkout Flow — Real backend order + Razorpay SDK
 * Steps: Review → Address → Payment → Processing → Result
 */

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const STEPS = ["Review", "Address", "Payment", "Processing", "Result"];



function loadRazorpayScript() {
    return new Promise((resolve) => {
        if (window.Razorpay) { resolve(true); return; }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export function CheckoutFlow({ onClose, onSuccess }) {
    const { user } = useAuth();
    const { products, cart, cartTotal, clearCart, setBackendOrder, showToast, placeOrder: placeOrderFn } = useStore();
    const [step, setStep] = useState(0);
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [showAddressPicker, setShowAddressPicker] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState("wallet");
    const [processingMsg, setProcessingMsg] = useState("Preparing your order...");
    const [result, setResult] = useState(null);

    // Generate a unique idempotency key per checkout session to prevent double-deductions
    const idempotencyKey = useMemo(() => {
        try { return crypto.randomUUID(); } catch { return `ik_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const walletBalance = user?.walletBalance || 0;

    useEffect(() => { loadRazorpayScript(); }, []);

    const cartItems = useMemo(() =>
        Object.entries(cart).map(([id, qty]) => {
            const p = products.find(x => x.id === id);
            return p ? { ...p, qty } : null;
        }).filter(Boolean),
        [cart, products]);

    const sellerIds = new Set(cartItems.map(item => item.sellerId || "DEFAULT_SELLER"));
    const sellerCount = sellerIds.size;

    const subtotal = cartTotal;
    const estDeliveryFee = 30 * sellerCount; // ₹30 per distinct seller store
    const platformFee = 5;
    const discount = subtotal > 200 ? Math.round(subtotal * 0.02) : 0;
    const estimatedTotal = subtotal + estDeliveryFee + platformFee - discount;

    const walletCovers = walletBalance >= estimatedTotal;
    const walletPortion = Math.min(walletBalance, estimatedTotal);
    const gatewayPortion = estimatedTotal - walletPortion;

    const openRazorpayCheckout = useCallback((options) => {
        return new Promise((resolve, reject) => {
            const rzp = new window.Razorpay({
                ...options,
                handler: (response) => resolve(response),
                modal: { ondismiss: () => reject(new Error("Payment cancelled by user")), escape: true, confirm_close: true },
                theme: { color: "#6366F1" },
            });
            rzp.on("payment.failed", (resp) => reject(new Error(resp.error?.description || "Payment failed")));
            rzp.open();
        });
    }, []);

    const verifyPayment = useCallback(async (razorpayResponse) => {
        const res = await fetch(`${API_BASE}/payments/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("nm_access_token")}` },
            body: JSON.stringify(razorpayResponse),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Verification failed");
        return data;
    }, []);

    const handlePay = useCallback(async () => {
        setStep(3);

        try {
            setProcessingMsg("Creating your order...");

            const checkoutItems = cartItems.map(item => ({ productId: item.id, qty: item.qty }));
            const token = localStorage.getItem("nm_access_token");
            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "Idempotency-Key": idempotencyKey,
            };

            let backendOrders = null;
            let activePaymentGroupId = null; // Track for cancellation

            // ── Path 1: Try full Razorpay checkout ────────────────────────────
            try {
                if (!token) throw new Error("Local session — skipping Razorpay backend");
                const checkoutRes = await fetch(`${API_BASE}/payments/checkout`, {
                    method: "POST", headers,
                    body: JSON.stringify({
                        items: checkoutItems,
                        address: selectedAddress?.address || "Delivery Address",
                        paymentMethod,
                        dropLocation: selectedAddress ? {
                            lat: selectedAddress.lat,
                            lng: selectedAddress.lng,
                            address: selectedAddress.address,
                        } : null,
                    }),
                });
                const checkoutData = await checkoutRes.json();

                if (checkoutData.ok) {
                    activePaymentGroupId = checkoutData.orders?.[0]?.paymentGroupId || null;

                    if (checkoutData.needsGatewayPayment) {
                        setProcessingMsg("Opening payment gateway...");
                        const loaded = await loadRazorpayScript();
                        if (loaded && window.Razorpay) {
                            const rzOptions = {
                                key: checkoutData.razorpayKeyId,
                                amount: checkoutData.gatewayAmount,
                                currency: "INR",
                                name: "NearMart",
                                description: "Order Payment",
                                order_id: checkoutData.razorpayOrderId,
                                prefill: { name: user?.name || "", email: user?.email || "", contact: user?.phone || "" },
                                notes: { paymentGroupId: activePaymentGroupId || "" },
                                theme: { color: "#6366F1" },
                            };
                            setProcessingMsg("Complete payment in the Razorpay window...");
                            try {
                                const rzResponse = await openRazorpayCheckout(rzOptions);
                                setProcessingMsg("Verifying payment...");
                                const verifyData = await verifyPayment(rzResponse);
                                backendOrders = verifyData.orders;

                                // Check if webhook delayed for hybrid/razorpay confirmation
                                if (backendOrders && backendOrders.length > 0 && backendOrders[0].status === "PENDING_PAYMENT") {
                                    setProcessingMsg("Waiting for payment confirmation...");
                                    let attempts = 0;
                                    while (attempts < 5) {
                                        await new Promise(r => setTimeout(r, 2000));
                                        const pollRes = await fetch(`${API_BASE}/orders/${backendOrders[0]._id}`, { headers });
                                        const pollData = await pollRes.json();
                                        if (pollData.ok && pollData.order.status !== "PENDING_PAYMENT") {
                                            backendOrders = [pollData.order];
                                            break;
                                        }
                                        attempts++;
                                    }
                                }
                            } catch (rzErr) {
                                // User closed the popup or payment failed — cancel the checkout to restore stock & wallet
                                if (activePaymentGroupId) {
                                    try {
                                        await fetch(`${API_BASE}/payments/cancel/${activePaymentGroupId}`, {
                                            method: "POST", headers,
                                        });
                                    } catch (cancelErr) {
                                        console.warn("Cancel cleanup failed:", cancelErr.message);
                                    }
                                }
                                throw rzErr; // Re-throw so ResultStep shows the error
                            }
                        }
                    } else {
                        // Fully paid by Wallet
                        backendOrders = checkoutData.orders;
                    }
                }
            } catch (payErr) {
                console.warn("Razorpay checkout unavailable, falling back to direct order:", payErr.message);
            }

            // ── Path 2: Create order directly via backend ────────────────────
            if (!backendOrders) {
                try {
                    if (!token) throw new Error("Local session — skipping backend order creation");
                    setProcessingMsg("Finalizing order...");
                    const orderRes = await fetch(`${API_BASE}/orders`, {
                        method: "POST", headers,
                        body: JSON.stringify({
                            items: checkoutItems,
                            address: selectedAddress?.address || "Delivery Address",
                            paymentMethod: paymentMethod === "razorpay" ? "online" : paymentMethod,
                            dropLocation: selectedAddress || null,
                        }),
                    });
                    const orderData = await orderRes.json();
                    if (orderData.ok) {
                        backendOrders = orderData.orders || [orderData.order];
                    }
                } catch (apiErr) {
                    console.warn("Backend order creation failed:", apiErr.message);
                }
            }

            // ── Path 3: Local-only fallback (GlobalStore) ────────────────────
            if (!backendOrders) {
                setProcessingMsg("Creating local order...");
                await import("../../context/GlobalStore"); // ensure module loaded
                // Use the placeOrder already available from useStore
                const localOrder = placeOrderFn(
                    user?.id || "GUEST", user?.name || "Customer",
                    selectedAddress?.address || "Delivery Address",
                    paymentMethod
                );
                if (localOrder) {
                    backendOrders = [localOrder];
                } else {
                    throw new Error("Order creation failed — cart may be empty or items out of stock");
                }
            }

            // ── Sync into frontend state ─────────────────────────────────────
            if (setBackendOrder && backendOrders[0]?._id) setBackendOrder(backendOrders[0]);
            clearCart();

            // Phase-9: Bypass legacy Result popup, jump directly to cinematic success
            onSuccess?.(backendOrders);

        } catch (err) {
            setResult({
                success: false,
                message: err.message || "Payment failed. Please try again.",
                canRetry: true,
            });
            setStep(4);
        }
    }, [user, selectedAddress, paymentMethod, cartItems, clearCart, setBackendOrder, openRazorpayCheckout, verifyPayment, placeOrderFn, idempotencyKey, onSuccess]);


    const handleDone = () => {
        if (result?.success) {
            showToast("Order placed! 🎉", "success", "✅");
            onSuccess?.(result.orders || [result.order]);
        } else if (result?.canRetry) {
            setStep(2); setResult(null); return;
        }
        onClose();
    };

    const StepBar = () => (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20, padding: "0 4px" }}>
            {STEPS.slice(0, 3).map((s, i) => (
                <React.Fragment key={s}>
                    <div style={{
                        width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                        background: i <= step ? P.primary : P.surface,
                        color: i <= step ? "white" : P.textMuted,
                        border: `2px solid ${i <= step ? P.primary : P.border}`,
                        transition: "all .3s",
                    }}>{i + 1}</div>
                    {i < 2 && <div style={{ flex: 1, height: 2, background: i < step ? P.primary : P.border, transition: "all .3s" }} />}
                </React.Fragment>
            ))}
        </div>
    );

    // ── STEP 0: Review ─────────────────────────────────────────────────────────
    const ReviewStep = () => (
        <div className="col gap12">
            <h3 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>📋 Order Review</h3>
            <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {cartItems.map(item => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: P.surface, borderRadius: 12, border: `1px solid ${P.border}` }}>
                        <span style={{ fontSize: 24, width: 36, textAlign: "center" }}>{item.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: P.textMuted }}>₹{item.sellingPrice} × {item.qty}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>₹{item.sellingPrice * item.qty}</div>
                    </div>
                ))}
            </div>
            <BillSummary />
            <button className="p-btn p-btn-primary w-100" style={{ marginTop: 8, minHeight: 46 }} onClick={() => setStep(1)}>
                Continue to Address →
            </button>
        </div>
    );

    // ── STEP 1: Address ────────────────────────────────────────────────────────
    const AddressStep = () => (
        <div className="col gap12">
            <h3 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>📍 Delivery Address</h3>

            {selectedAddress ? (
                <div style={{ background: P.success + "15", border: `1px solid ${P.success}33`, borderRadius: 14, padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: P.success }}>✓ Address Selected</div>
                    <div style={{ fontSize: 13, color: P.text, lineHeight: 1.5 }}>{selectedAddress.address}</div>
                    {selectedAddress.lat && (
                        <div style={{ fontSize: 11, color: P.textMuted, marginTop: 6, fontFamily: "monospace" }}>
                            {selectedAddress.lat.toFixed(4)}, {selectedAddress.lng.toFixed(4)}
                        </div>
                    )}
                    <button onClick={() => setShowAddressPicker(true)} style={{ marginTop: 12, background: "none", border: `1px solid ${P.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: P.textMuted }}>
                        Change Address
                    </button>
                </div>
            ) : (
                <button onClick={() => setShowAddressPicker(true)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: 16,
                    background: P.surface, border: `2px dashed ${P.border}`, borderRadius: 14,
                    cursor: "pointer", fontFamily: "inherit", width: "100%",
                }}>
                    <span style={{ fontSize: 28 }}>📍</span>
                    <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>Select Delivery Address</div>
                        <div style={{ fontSize: 12, color: P.textMuted }}>GPS · Search · Saved addresses</div>
                    </div>
                </button>
            )}

            <div style={{ fontSize: 12, color: P.textMuted, display: "flex", gap: 6, alignItems: "center" }}>
                <span>🛵</span> Estimated delivery: 15–30 min
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="p-btn p-btn-ghost" onClick={() => setStep(0)}>← Back</button>
                <button className="p-btn p-btn-primary" style={{ flex: 1, minHeight: 46 }} onClick={() => setStep(2)} disabled={!selectedAddress}>
                    Continue to Payment →
                </button>
            </div>

            {showAddressPicker && (
                <AddressPicker
                    value={selectedAddress}
                    onSelect={(addr) => setSelectedAddress(addr)}
                    onClose={() => setShowAddressPicker(false)}
                />
            )}
        </div>
    );

    // ── STEP 2: Payment ────────────────────────────────────────────────────────
    const PaymentStep = () => (
        <div className="col gap12">
            <h3 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>💳 Payment</h3>

            <PaymentOption
                id="wallet" selected={paymentMethod === "wallet"} onClick={() => setPaymentMethod("wallet")}
                icon="👛" title="Pay with Wallet"
                subtitle={walletCovers ? `Balance: ₹${walletBalance.toLocaleString("en-IN")} — covers full amount` : `Balance: ₹${walletBalance.toLocaleString("en-IN")} (insufficient)`}
                disabled={walletBalance <= 0 || !walletCovers}
                tag={walletCovers ? "✅ Instant" : null}
            />

            <PaymentOption
                id="razorpay" selected={paymentMethod === "razorpay"} onClick={() => setPaymentMethod("razorpay")}
                icon="💳" title="Razorpay"
                subtitle="UPI · Cards · Net Banking · Wallets"
                tag="🔒 Secure"
            />

            {walletBalance > 0 && walletBalance < estimatedTotal && (
                <PaymentOption
                    id="hybrid" selected={paymentMethod === "hybrid"} onClick={() => setPaymentMethod("hybrid")}
                    icon="🔀" title="Wallet + Razorpay"
                    subtitle={`₹${walletPortion} wallet + ₹${gatewayPortion} via gateway`}
                />
            )}

            <div style={{ height: 1, background: P.border, margin: "4px 0" }} />
            <BillSummary compact />

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="p-btn p-btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="p-btn p-btn-primary" style={{ flex: 1, minHeight: 50, fontSize: 16 }} onClick={handlePay}>
                    {paymentMethod === "wallet" ? `Pay ₹${estimatedTotal} from Wallet` :
                        paymentMethod === "hybrid" ? `Pay ₹${gatewayPortion} + Wallet` :
                            `Pay ₹${estimatedTotal} via Razorpay`}
                </button>
            </div>
        </div>
    );

    // ── STEP 3: Processing ─────────────────────────────────────────────────────
    const ProcessingStep = () => (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4, margin: "0 auto 20px" }} />
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Processing</div>
            <div style={{ fontSize: 13, color: P.textMuted }}>{processingMsg}</div>
            <div style={{ marginTop: 16 }}>
                <div style={{ width: "60%", margin: "0 auto", height: 4, background: P.border, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: "100%", height: "100%", background: P.primary, borderRadius: 4, animation: "shimmer 1.5s ease-in-out infinite" }} />
                </div>
            </div>
            <div style={{ fontSize: 11, color: P.textMuted, marginTop: 16 }}>Do not close this window</div>
        </div>
    );

    // ── STEP 4: Result ─────────────────────────────────────────────────────────
    const ResultStep = () => (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>{result?.success ? "✅" : "❌"}</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{result?.success ? "Order Confirmed!" : "Payment Failed"}</div>
            <div style={{ fontSize: 14, color: P.textMuted, marginBottom: 6 }}>{result?.message}</div>

            {result?.success && result?.orders && (
                <div style={{ background: P.surface, borderRadius: 14, padding: "16px 20px", border: `1px solid ${P.success}44`, marginTop: 16, textAlign: "left" }}>
                    <div style={{ fontSize: 12, color: P.textMuted, marginBottom: 6 }}>
                        {result.orders.length > 1 ? `Split into ${result.orders.length} Deliveries` : "Order ID"}
                    </div>
                    {result.orders.map((o, idx) => (
                        <div key={idx} style={{
                            fontWeight: 600, fontSize: 13, fontFamily: "monospace",
                            background: `${P.success}15`, padding: "4px 8px", borderRadius: 6, marginBottom: 4, display: "inline-block", marginRight: 8
                        }}>
                            {o._id || o.id}
                        </div>
                    ))}

                    <div style={{ fontSize: 12, color: P.textMuted, marginTop: 12, marginBottom: 4 }}>Grand Total Paid</div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: P.success }}>
                        ₹{result.orders.reduce((sum, o) => sum + (o.total || 0), 0) || estimatedTotal}
                    </div>

                    {result.orders[0]?.estimatedArrivalTime && (
                        <div style={{ fontSize: 12, color: P.textMuted, marginTop: 8 }}>
                            🕐 First ETA: {new Date(result.orders[0].estimatedArrivalTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    )}
                </div>
            )}

            <button className="p-btn p-btn-primary w-100" style={{ marginTop: 20, minHeight: 50, fontSize: 16 }} onClick={handleDone}>
                {result?.success ? "Track Order →" : "Try Again"}
            </button>
            {!result?.success && (
                <button className="p-btn p-btn-ghost w-100" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
            )}
        </div>
    );

    const BillSummary = ({ compact }) => (
        <div style={{ background: compact ? "transparent" : P.card, border: compact ? "none" : `1px solid ${P.primary}33`, borderRadius: 14, padding: compact ? "4px 0" : "14px 16px" }}>
            {!compact && <div style={{ fontSize: 12, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Bill Details</div>}
            <Row label="Item Total" value={`₹${subtotal}`} />
            <Row label={`Delivery Fee ${sellerCount > 1 ? `(${sellerCount} sellers)` : ""}`} value={`₹${estDeliveryFee}`} muted />
            <Row label="Platform Fee" value={`₹${platformFee}`} muted />
            {discount > 0 && <Row label="💰 Savings" value={`−₹${discount}`} color={P.success} />}
            <div style={{ height: 1, background: P.border, margin: "8px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: compact ? 16 : 18 }}>
                <span>To Pay</span><span>₹{estimatedTotal}</span>
            </div>
        </div>
    );

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={step < 3 ? onClose : undefined}>
            <div style={{ background: P.bg, borderRadius: 22, padding: "24px 22px", maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${P.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
                {step < 3 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 13, color: P.textMuted, fontWeight: 600 }}>{STEPS[step]} · Step {step + 1}/3</div>
                        <button onClick={onClose} style={{ background: "none", border: "none", color: P.textMuted, fontSize: 20, cursor: "pointer", padding: 4 }}>✕</button>
                    </div>
                )}
                {step < 3 && <StepBar />}
                {step === 0 && <ReviewStep />}
                {step === 1 && <AddressStep />}
                {step === 2 && <PaymentStep />}
                {step === 3 && <ProcessingStep />}
                {step === 4 && <ResultStep />}
            </div>
        </div>
    );
}

function PaymentOption({ id, selected, onClick, icon, title, subtitle, disabled, tag }) {
    return (
        <button onClick={onClick} disabled={disabled} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer", background: selected ? `${P.primary}15` : P.surface, border: `2px solid ${selected ? P.primary : P.border}`, textAlign: "left", width: "100%", opacity: disabled ? 0.4 : 1, transition: "all .2s", fontFamily: "inherit" }}>
            <span style={{ fontSize: 28, width: 40, textAlign: "center" }}>{icon}</span>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: P.text }}>{title}</div>
                <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{subtitle}</div>
            </div>
            {tag && <span style={{ fontSize: 10, fontWeight: 700, color: P.success, background: `${P.success}20`, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{tag}</span>}
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? P.primary : P.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: P.primary }} />}
            </div>
        </button>
    );
}

function Row({ label, value, muted, color }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, color: color || (muted ? P.textMuted : P.text) }}>
            <span>{label}</span><span>{value}</span>
        </div>
    );
}

export default CheckoutFlow;
