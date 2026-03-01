import React, { memo } from "react";
import { fmtFull } from "../../utils/helpers";
import { StatusBadge } from "../../components/ScmComponents";
import { useNearMart } from "../../context/NearMartContext";

export const AccountingFinance = memo(() => {
    const { purchaseOrders } = useNearMart();
    const unpaidTotal = purchaseOrders.filter(po => po.paymentStatus === "pending").reduce((a, b) => a + b.total, 0);
    const gstTotal = purchaseOrders.reduce((a, b) => a + b.gst, 0);

    return (
        <div className="page-enter col gap16">
            <h2 className="sec-title" style={{ marginBottom: 0 }}>Ledger & Accounts Payable</h2>
            <div className="g3">
                <div className="card">
                    <div className="kpi-label">Total Payables (Unpaid)</div>
                    <div className="kpi-value font-mono text-coral">{fmtFull(unpaidTotal)}</div>
                </div>
                <div className="card">
                    <div className="kpi-label">Total Paid (MTD)</div>
                    <div className="kpi-value font-mono">{fmtFull(1284000)}</div>
                </div>
                <div className="card">
                    <div className="kpi-label">GST Input Credit Available</div>
                    <div className="kpi-value font-mono text-emerald">{fmtFull(gstTotal)}</div>
                </div>
            </div>
            <div className="card">
                <div className="scm-table-wrap">
                    <table className="scm-table">
                        <thead><tr><th>Invoice</th><th>PO Ref</th><th>Amount</th><th>Tax (GST)</th><th>Status</th><th>Clearance</th></tr></thead>
                        <tbody>
                            {purchaseOrders.map(po => (
                                <tr key={po.id}>
                                    <td className="font-mono font-bold">{po.invoiceNo || "Awaiting"}</td>
                                    <td className="text-xs text-dim">{po.id}</td>
                                    <td className="font-mono font-bold" style={{ fontSize: 15 }}>{fmtFull(po.total)}</td>
                                    <td className="font-mono text-emerald">{fmtFull(po.gst)}</td>
                                    <td><StatusBadge status={po.paymentStatus === "paid" ? "paid" : "pending"} /></td>
                                    <td>
                                        {po.paymentStatus === "paid"
                                            ? <span className="text-xs text-dim">Settled via {po.paymentMethod}</span>
                                            : <button className="btn btn-sapphire btn-xs">Pay Now</button>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
});
