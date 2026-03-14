import React, { useState, useRef, useEffect } from "react";
import { P } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { useStore } from "../../context/GlobalStore";
import api from "../../api/client";

function Toast({ msg, icon, onDone }) {
    React.useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
    return (
        <div className="plat-toast" style={{ borderLeft: `4px solid ${P.warning}` }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{msg}</span>
            <button onClick={onDone} style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
    );
}

export function SupportPanel({ activeTab }) {
    const { user } = useAuth();
    const { tickets, chats, sendSupportMessage, resolveTicket, orders } = useStore();
    const [selectedId, setSelectedId] = useState(tickets[0]?.id || null);
    const [input, setInput] = useState("");
    const [refunding, setRefunding] = useState(false);
    const [toast, setToast] = useState(null);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    const activeTicket = tickets.find(t => t.id === selectedId);
    const messages = chats[selectedId] || [];
    const relatedOrder = orders.find(o => o.id === activeTicket?.orderId);
    const messagesLen = messages.length;

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messagesLen]);

    const send = () => {
        if (!input.trim() || !selectedId) return;
        sendSupportMessage(selectedId, input, "agent");
        setInput("");
        inputRef.current?.focus();
    };

    const handleResolve = () => {
        resolveTicket(selectedId);
        setToast({ msg: "Ticket resolved & customer notified ✅", icon: "✅" });
    };

    const handleRefund = async () => {
        if (!relatedOrder) return;
        if (!window.confirm(`Issue refund of ₹${relatedOrder.total || 0} for order ${relatedOrder.id || relatedOrder._id}?`)) return;
        setRefunding(true);
        const orderId = relatedOrder._id || relatedOrder.id;
        const res = await api.post(`/payments/refund/${orderId}`, { reason: "Support agent refund" });
        setRefunding(false);
        if (res.ok) {
            if (selectedId) sendSupportMessage(selectedId, `Refund of ₹${relatedOrder.total || 0} has been processed (3–5 business days).`, "agent");
            setToast({ msg: `Refund ₹${relatedOrder.total || 0} issued ✅`, icon: "💰" });
        } else {
            setToast({ msg: `Refund failed: ${res.error || "Unknown error"}`, icon: "❌" });
        }
    };

    const statusColor = { open: "p-badge-danger", investigating: "p-badge-warning", resolved: "p-badge-success" };

    // ── TABS ──────────────────────────────────────────────────────────────────
    const InboxTab = () => (
        <div className="col gap16" style={{ height: "100%" }}>
            <div className="row-between">
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>🎧 Resolution Center</h2>
                <div style={{ display: "flex", gap: 8 }}>
                    <span className="p-badge p-badge-danger">{tickets.filter(t => t.status === "open").length} Open</span>
                    <span className="p-badge p-badge-warning">{tickets.filter(t => t.status === "investigating").length} Active</span>
                </div>
            </div>

            <div className="support-layout" style={{ flex: 1 }}>
                {/* Ticket List */}
                <div className="p-card col" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${P.border}` }}>
                        <label htmlFor="tck-srch" style={{ display: "none" }}>Search tickets</label>
                        <input id="tck-srch" type="text" className="p-input" placeholder="Search by ID or user..." style={{ fontSize: 16 }} />
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {tickets.map(t => (
                            <div key={t.id} onClick={() => setSelectedId(t.id)}
                                style={{ padding: "14px 16px", borderBottom: `1px solid ${P.border}`, background: selectedId === t.id ? P.surface : "transparent", cursor: "pointer", transition: "background .2s", borderLeft: selectedId === t.id ? `3px solid ${P.primary}` : "3px solid transparent" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{t.id}</span>
                                    <span style={{ fontSize: 11, color: P.textMuted }}>{Math.round((Date.now() - t.time) / 60000)}m ago</span>
                                </div>
                                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{t.customerName}</div>
                                <div style={{ fontSize: 12, color: P.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.issue}</div>
                                <div style={{ marginTop: 8 }}>
                                    <span className={`p-badge ${statusColor[t.status] || "p-badge-muted"}`} style={{ fontSize: 10 }}>{t.status?.toUpperCase()}</span>
                                    {t.priority === "high" && <span className="p-badge p-badge-danger" style={{ fontSize: 10, marginLeft: 4 }}>HIGH</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Pane */}
                <div className="p-card col" style={{ padding: 0, overflow: "hidden" }}>
                    {activeTicket ? <>
                        {/* Header */}
                        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${P.border}`, background: P.surface, flexShrink: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                <div className="p-avatar" style={{ background: P.primary, color: "white" }}>{activeTicket.customerName.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{activeTicket.customerName}</div>
                                    <div style={{ fontSize: 12, color: P.textMuted }}>{activeTicket.orderId} · {activeTicket.issue}</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button className="p-btn p-btn-ghost p-btn-sm" onClick={handleRefund} disabled={refunding} style={{ fontSize: 12 }}>
                                    {refunding ? <><span className="spinner spinner-dark" style={{ width: 12, height: 12, marginRight: 6 }} />Processing</> : "💰 Refund"}
                                </button>
                                {activeTicket.status !== "resolved" && (
                                    <button className="p-btn p-btn-sm" style={{ background: `${P.success}22`, color: P.success, border: `1px solid ${P.success}44`, fontSize: 12 }} onClick={handleResolve}>✅ Resolve</button>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: `linear-gradient(180deg,${P.bg},${P.surface})` }}>
                            <div style={{ textAlign: "center", fontSize: 11, color: P.textMuted, fontWeight: 600 }}>{activeTicket.issue}</div>
                            {messages.length === 0 && <div style={{ textAlign: "center", color: P.textMuted, fontSize: 13, padding: "20px 0" }}>No messages yet. Start the conversation.</div>}
                            {messages.map(msg => (
                                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.from === "agent" ? "flex-end" : "flex-start" }}>
                                    <div className={`chat-bubble ${msg.from === "agent" ? "chat-out" : "chat-in"}`}>{msg.text}</div>
                                    <div style={{ fontSize: 10, color: P.textMuted, marginTop: 4 }}>{Math.round((Date.now() - msg.time) / 60000)}m ago</div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Quick Macros */}
                        <div style={{ padding: "8px 14px", borderTop: `1px solid ${P.border}`, display: "flex", gap: 6, overflowX: "auto" }}>
                            {["Checking on this now", "Refund processed", "Escalating to team"].map(m => (
                                <button key={m} onClick={() => setInput(m)}
                                    style={{ flexShrink: 0, background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: "5px 12px", color: P.textMuted, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{m}</button>
                            ))}
                        </div>

                        {/* Input */}
                        <div style={{ padding: "12px 14px", borderTop: `1px solid ${P.border}`, display: "flex", gap: 10, alignItems: "flex-end", flexShrink: 0 }}>
                            <div style={{ flex: 1 }}>
                                <label htmlFor="chat-in" style={{ display: "none" }}>Message</label>
                                <input id="chat-in" ref={inputRef} type="text" className="p-input" placeholder="Type a message..." value={input}
                                    onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} style={{ fontSize: 16 }} />
                            </div>
                            <button className="p-btn p-btn-primary" onClick={send} disabled={!input.trim()} style={{ minHeight: 44, flexShrink: 0 }}>Send ↑</button>
                        </div>
                    </> : (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: P.textMuted, fontSize: 14, flexDirection: "column", gap: 12 }}>
                            <div style={{ fontSize: 40 }}>👈</div>
                            <div>Select a ticket to start</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const StatsTab = () => (
        <div className="col gap16">
            <h2 style={{ fontWeight: 800, fontSize: 20 }}>📈 Support Stats</h2>
            <div className="stat-grid">
                {[
                    { label: "Total Tickets", val: tickets.length, color: P.primary },
                    { label: "Open", val: tickets.filter(t => t.status === "open").length, color: P.danger },
                    { label: "Resolved Today", val: user?.resolvedToday || 14, color: P.success },
                    { label: "Avg Response", val: "2m 14s", color: P.accent },
                ].map(s => (
                    <div key={s.label} className="stat-card" style={{ "--ac": s.color }}>
                        <div className="p-label">{s.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 6 }}>{s.val}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const tabs = [<InboxTab />, <InboxTab />, <StatsTab />, <StatsTab />];
    return (
        <div>
            {tabs[activeTab] || <InboxTab />}
            {toast && <Toast msg={toast.msg} icon={toast.icon} onDone={() => setToast(null)} />}
        </div>
    );
}
