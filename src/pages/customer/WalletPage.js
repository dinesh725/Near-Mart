import React, { useState, useMemo, useCallback, useEffect } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../../auth/AuthContext";
import { P } from "../../theme/theme";
import { PullToRefreshWrapper } from "../../components/ui/PullToRefreshWrapper";
import { InfiniteScrollTrigger } from "../../components/ui/InfiniteScrollTrigger";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

// ── Load Razorpay Script ──────────────────────────────────────────────────────
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

/**
 * Wallet Page — Balance, Add Money via Razorpay, Transaction History
 */
export function WalletPage() {
    const { user, refreshUser } = useAuth(); // Import refreshUser to update wallet balance
    const [showAddMoney, setShowAddMoney] = useState(false);
    const [addAmount, setAddAmount] = useState("");
    const [addingMoney, setAddingMoney] = useState(false);
    const [addResult, setAddResult] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);
    
    // Pagination & Infinite Scroll State
    const [page, setPage] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const balance = user?.walletBalance ?? 2500;

    // Pre-load Razorpay script
    useEffect(() => { loadRazorpayScript(); }, []);

    const fetchTxns = useCallback(async (pageNum = 1, isRefresh = false) => {
        if (isRefresh) {
            setLoadingTxns(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const token = localStorage.getItem("nm_access_token");
            if (!token) throw new Error("Local session — skipping backend wallet txns");
            
            const limit = 15;
            const res = await fetch(`${API_BASE}/wallet/transactions?page=${pageNum}&limit=${limit}`, {
                headers: { "Authorization": `Bearer ${token}` },
            });
            const data = await res.json();
            
            if (data.ok) {
                const newItems = data.transactions || [];
                
                if (isRefresh) {
                    setTransactions(newItems);
                    setHasMore(newItems.length === limit);
                    setPage(1);
                } else {
                    setTransactions(prev => {
                        const existingIds = new Set(prev.map(i => i._id));
                        const deduped = newItems.filter(i => !existingIds.has(i._id));
                        return [...prev, ...deduped];
                    });
                    setHasMore(newItems.length === limit);
                    setPage(pageNum);
                }

                if (isRefresh && refreshUser) {
                    await refreshUser(); // Grab newest main user object balances over REST
                }
            }
        } catch {
            if (isRefresh) {
                setTransactions([
                    { _id: "1", type: "credit", category: "welcome_bonus", amount: 500, note: "Welcome bonus", createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), balanceAfter: 500 },
                    { _id: "2", type: "credit", category: "add_money", amount: 2000, note: "Added via Razorpay", createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), balanceAfter: 2500 },
                ]);
                setHasMore(false);
            }
        } finally {
            setLoadingTxns(false);
            setLoadingMore(false);
        }
    }, [refreshUser]);

    // Initial Load & subsequent refreshed
    useEffect(() => {
        fetchTxns(1, true);
    }, [fetchTxns, addResult]);

    const reloadWalletData = useCallback(async () => {
        await fetchTxns(1, true);
    }, [fetchTxns]);

    const fetchNextPage = useCallback(() => {
        if (!loadingMore && hasMore) {
            fetchTxns(page + 1, false);
        }
    }, [fetchTxns, loadingMore, hasMore, page]);

    const presetAmounts = [100, 250, 500, 1000, 2000, 5000];

    // ── Add Money via Razorpay ────────────────────────────────────────────
    const handleAddMoney = useCallback(async () => {
        const amount = parseFloat(addAmount);
        if (!amount || amount < 10) return;
        setAddingMoney(true);
        setAddResult(null);

        try {
            const token = localStorage.getItem("nm_access_token");
            if (!token) throw new Error("Local session — skipping Razorpay backend");

            // Step 1: Create Razorpay order via backend
            const createRes = await fetch(`${API_BASE}/wallet/add-money`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({ amount }),
            });
            const createData = await createRes.json();
            if (!createData.ok) throw new Error(createData.error || "Failed to create payment");

            // Step 2: Load & open Razorpay checkout
            const loaded = await loadRazorpayScript();
            if (!loaded || !window.Razorpay) throw new Error("Payment gateway could not load");

            const razorpayResponse = await new Promise((resolve, reject) => {
                const rzp = new window.Razorpay({
                    key: createData.razorpayKeyId || process.env.REACT_APP_RAZORPAY_KEY_ID,
                    amount: createData.amount,
                    currency: createData.currency || "INR",
                    name: "NearMart",
                    description: `Add ₹${amount} to Wallet`,
                    order_id: createData.razorpayOrderId,
                    prefill: {
                        name: user?.name || "",
                        email: user?.email || "",
                        contact: user?.phone || "",
                    },
                    theme: { color: "#6366F1" },
                    handler: (response) => resolve(response),
                    modal: {
                        ondismiss: () => reject(new Error("Payment cancelled")),
                        confirm_close: true,
                    },
                });
                rzp.on("payment.failed", (resp) => {
                    reject(new Error(resp.error?.description || "Payment failed"));
                });
                rzp.open();
            });

            // Step 3: Verify with backend
            const verifyRes = await fetch(`${API_BASE}/wallet/verify-topup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("nm_access_token")}`,
                },
                body: JSON.stringify(razorpayResponse),
            });
            const verifyData = await verifyRes.json();

            if (verifyData.ok) {
                setAddResult({ ok: true, amount, newBalance: verifyData.balance });
                setShowAddMoney(false);
                setAddAmount("");
            } else {
                throw new Error(verifyData.error || "Verification failed");
            }
        } catch (err) {
            if (err.message !== "Payment cancelled") {
                setAddResult({ ok: false, message: err.message });
            }
        } finally {
            setAddingMoney(false);
        }
    }, [addAmount, user]);

    const categoryIcon = { add_money: "💳", order_payment: "🛒", refund: "↩️", cashback: "🎁", welcome_bonus: "🎉" };
    const categoryLabel = { add_money: "Added Money", order_payment: "Order Payment", refund: "Refund", cashback: "Cashback", welcome_bonus: "Welcome Bonus" };

    const totalCredits = useMemo(() => transactions.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0), [transactions]);
    const totalDebits = useMemo(() => transactions.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0), [transactions]);

    return (
        <PullToRefreshWrapper onRefresh={reloadWalletData}>
        <div className="col gap16">
            {/* Balance Card */}
            <div style={{
                background: `linear-gradient(135deg, ${P.primary}, #6366F1, #8B5CF6)`,
                borderRadius: 22, padding: "28px 24px", position: "relative", overflow: "hidden",
            }}>
                <div style={{ position: "absolute", right: -30, top: -30, fontSize: 100, opacity: 0.08 }}>👛</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Wallet Balance</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: "white", letterSpacing: -1 }}>
                    ₹{balance.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{user?.name} · NearMart Wallet</div>
                <button
                    className="p-btn"
                    onClick={() => setShowAddMoney(true)}
                    style={{
                        marginTop: 16, background: "rgba(255,255,255,0.2)", color: "white",
                        backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.3)",
                        fontSize: 14, padding: "10px 24px",
                    }}
                >
                    ➕ Add Money via Razorpay
                </button>
            </div>

            {/* Quick Stats */}
            <div style={{ display: "flex", gap: 10 }}>
                {[
                    { emoji: "📊", label: "Summary", value: `${transactions.length} txns` },
                    { emoji: "💰", label: "Credits", value: `₹${totalCredits.toLocaleString("en-IN")}` },
                    { emoji: "🛒", label: "Spent", value: `₹${totalDebits.toLocaleString("en-IN")}` },
                ].map(s => (
                    <div key={s.label} style={{
                        flex: 1, background: P.card, border: `1px solid ${P.border}`,
                        borderRadius: 14, padding: "14px 12px", textAlign: "center",
                    }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>{s.emoji}</div>
                        <div style={{ fontSize: 11, color: P.textMuted, marginBottom: 2 }}>{s.label}</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Transaction History */}
            <div>
                <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>📜 Transaction History</h3>
                {loadingTxns ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: P.textMuted }}>
                        <span className="spinner" style={{ marginRight: 8 }} /> Loading...
                    </div>
                ) : (
                    <div className="col gap8">
                        {transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(txn => (
                            <div key={txn._id} style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "14px 16px", background: P.card,
                                border: `1px solid ${P.border}`, borderRadius: 14,
                            }}>
                                <div style={{
                                    width: 42, height: 42, borderRadius: 12,
                                    background: txn.type === "credit" ? `${P.success}15` : `${P.danger}15`,
                                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                                }}>
                                    {categoryIcon[txn.category] || "💰"}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{categoryLabel[txn.category] || txn.category}</div>
                                    <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>{txn.note}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: txn.type === "credit" ? P.success : P.danger }}>
                                        {txn.type === "credit" ? "+" : "−"}₹{txn.amount}
                                    </div>
                                    <div style={{ fontSize: 10, color: P.textMuted, marginTop: 2 }}>
                                        {new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {transactions.length === 0 && (
                            <div style={{ textAlign: "center", padding: "40px 0", color: P.textMuted }}>
                                No transactions yet
                            </div>
                        )}
                        {!loadingTxns && transactions.length > 0 && (
                            <InfiniteScrollTrigger onLoadMore={fetchNextPage} loadingMore={loadingMore} hasMore={hasMore} />
                        )}
                    </div>
                )}
            </div>

            {/* Add Money Modal */}
            {showAddMoney && typeof document !== "undefined" && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", inset: 0, zIndex: 9999,
                    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
                    display: "flex", alignItems: "flex-end", justifyContent: "center",
                    animation: "fadeIn .2s ease",
                }} onClick={() => !addingMoney && setShowAddMoney(false)}>
                    <div style={{
                        background: P.bg, borderRadius: "22px 22px 0 0", padding: "24px 22px 32px",
                        maxWidth: 440, width: "100%", border: `1px solid ${P.border}`,
                        animation: "slideUp .3s ease",
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>➕ Add Money</h3>
                            <button onClick={() => !addingMoney && setShowAddMoney(false)} style={{ background: "none", border: "none", color: P.textMuted, fontSize: 20, cursor: "pointer" }}>✕</button>
                        </div>

                        <input
                            type="number" className="p-input" placeholder="Enter amount (₹10 minimum)"
                            value={addAmount} onChange={e => setAddAmount(e.target.value)}
                            style={{ fontSize: 20, fontWeight: 700, textAlign: "center", padding: "14px 16px" }}
                            min={10} max={50000} disabled={addingMoney}
                        />

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                            {presetAmounts.map(amt => (
                                <button key={amt} onClick={() => !addingMoney && setAddAmount(String(amt))}
                                    className="p-btn p-btn-ghost"
                                    style={{
                                        flex: "1 0 28%", fontSize: 14, fontWeight: 700,
                                        background: addAmount === String(amt) ? `${P.primary}20` : P.surface,
                                        border: `1px solid ${addAmount === String(amt) ? P.primary : P.border}`,
                                    }}>
                                    ₹{amt.toLocaleString("en-IN")}
                                </button>
                            ))}
                        </div>

                        <div style={{ fontSize: 11, color: P.textMuted, textAlign: "center", marginTop: 12 }}>
                            🔐 Secured by Razorpay · UPI · Cards · Net Banking
                        </div>

                        <button
                            className="p-btn p-btn-primary w-100"
                            style={{ marginTop: 12, minHeight: 50, fontSize: 16 }}
                            onClick={handleAddMoney}
                            disabled={!addAmount || parseFloat(addAmount) < 10 || addingMoney}
                        >
                            {addingMoney ? (
                                <><span className="spinner" style={{ marginRight: 8 }} />Processing...</>
                            ) : (
                                `Add ₹${addAmount || "0"} to Wallet`
                            )}
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* Result Toast */}
            {addResult && typeof document !== "undefined" && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
                    background: addResult.ok ? P.success : P.danger,
                    color: "white", padding: "12px 24px",
                    borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 10000,
                    animation: "fadeIn .3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                    maxWidth: 340, textAlign: "center",
                }}>
                    {addResult.ok
                        ? `✅ ₹${addResult.amount} added to wallet!`
                        : `❌ ${addResult.message}`}
                </div>,
                document.body
            )}
        </div>
        </PullToRefreshWrapper>
    );
}

export default WalletPage;
