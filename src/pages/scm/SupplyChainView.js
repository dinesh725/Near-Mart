import React, { memo } from "react";
import { T } from "../../theme/theme";

export const SupplyChainView = memo(() => {
    return (
        <div className="page-enter col gap16">
            <h2 className="sec-title" style={{ marginBottom: 0 }}>Multi-Node Routing & Logistics</h2>
            <div className="card col gap16" style={{ height: 400, background: `linear-gradient(180deg, ${T.surface}, ${T.bg})` }}>
                <div className="row gap16" style={{ height: "100%", padding: 24 }}>
                    <div className="chain-node col gap8" style={{ alignItems: "center", justifyContent: "center" }}>
                        <div style={{ fontSize: 40 }}>🏭</div>
                        <div className="font-bold text-center">Manufacturers<br />& Farms</div>
                    </div>
                    <div className="chain-node active col gap8" style={{ alignItems: "center", justifyContent: "center" }}>
                        <div style={{ fontSize: 40 }}>🏢</div>
                        <div className="font-bold text-center text-bg">Regional<br />Warehouses</div>
                    </div>
                    <div className="chain-node col gap8" style={{ alignItems: "center", justifyContent: "center" }}>
                        <div style={{ fontSize: 40 }}>🏪</div>
                        <div className="font-bold text-center">Dark Stores<br />& Sellers</div>
                    </div>
                    <div className="chain-node col gap8" style={{ alignItems: "center", justifyContent: "center" }}>
                        <div style={{ fontSize: 40 }}>🛵</div>
                        <div className="font-bold text-center">Last Mile<br />Delivery</div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export const AdminOversight = memo(() => {
    return (
        <div className="page-enter col gap16">
            <h2 className="sec-title" style={{ marginBottom: 0 }}>System Administration & Logs</h2>
            <div className="card">
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: T.textDim, whiteSpace: "pre-wrap" }}>
                    {`[2025-03-24 14:02] SERVER: Pricing algorithm refreshed. 12 SKUs updated.
[2025-03-24 13:45] AUTH: Role 'Manager' assigned to User 8841.
[2025-03-24 13:10] CRON: PO Auto-drafter generated PO-2025-0318 (AgriVista Foods).
[2025-03-24 12:00] API: ERP Sync successful. 4022 records processed.
[2025-03-24 11:15] WARN: Supplier S004 (FreshLink) delivery SLA breached.
[2025-03-24 10:30] SEC: Rate limit exceeded IP 192.168.1.4. Blocked.`}
                </div>
            </div>
        </div>
    );
});
