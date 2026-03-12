const cron = require("node-cron");
const User = require("../models/User");
const pushService = require("./pushService");
const logger = require("../utils/logger");

// Run every day at 12:01 AM
cron.schedule("1 0 * * *", async () => {
    logger.info("[Cron] Running daily OTP quota reset check...");
    try {
        const now = new Date();

        // Find users who have hit the limit (10+) and their reset time has passed
        const usersToReset = await User.find({
            otpCountToday: { $gte: 10 },
            otpCountResetAt: { $lt: now }
        });

        if (usersToReset.length === 0) return;

        // Reset them
        const userIds = usersToReset.map(u => u._id);
        const midnightTonight = new Date(now);
        midnightTonight.setHours(24, 0, 0, 0);

        await User.updateMany(
            { _id: { $in: userIds } },
            {
                $set: {
                    otpCountToday: 0,
                    otpCountResetAt: midnightTonight
                }
            }
        );

        // Dispatch notifications to those with devices
        const usersWithDevices = usersToReset.filter(u => u.fcmTokens && u.fcmTokens.length > 0);

        for (const user of usersWithDevices) {
            await pushService.sendMulticast(
                user.fcmTokens,
                "Phone Verification Unlocked 🔓",
                "Your daily phone verification limit has reset. You can now use your number for faster login.",
                { type: "auth_reset" }
            );
        }

        logger.info(`[Cron] Reset OTP quotas for ${usersToReset.length} users and sent ${usersWithDevices.length} push notifications.`);
    } catch (error) {
        logger.error("[Cron] Error resetting OTP quotas:", error);
    }
});

// ── Sweep stale PENDING_PAYMENT orders (every 5 minutes) ────────────────────
// Prevents inventory depletion attack: bots clicking checkout without paying
const Order = require("../models/Order");
const Product = require("../models/Product");
const Transaction = require("../models/Transaction");
const WalletTransaction = require("../models/WalletTransaction");

cron.schedule("*/5 * * * *", async () => {
    try {
        const cutoff = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

        const staleOrders = await Order.find({
            status: "PENDING_PAYMENT",
            createdAt: { $lt: cutoff },
        });

        if (staleOrders.length === 0) return;

        // Group by paymentGroupId to avoid double-processing
        const processedGroups = new Set();

        for (const order of staleOrders) {
            // Restore stock for this order
            for (const item of order.items) {
                let updateQuery = { $inc: { stock: item.qty } };
                if (item.selectedVariant && item.selectedVariant.variantId) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId },
                        updateQuery,
                        { arrayFilters: [{ "v.variantId": item.selectedVariant.variantId }] }
                    );
                } else if (item.selectedVariant && item.selectedVariant.name) {
                    updateQuery = { $inc: { "variants.$[v].stock": item.qty } };
                    await Product.findOneAndUpdate(
                        { _id: item.productId },
                        updateQuery,
                        { arrayFilters: [{ "v.name": item.selectedVariant.name }] }
                    );
                } else {
                    await Product.findByIdAndUpdate(item.productId, updateQuery);
                }
            }

            // Refund wallet only once per payment group
            if (order.paymentGroupId && !processedGroups.has(order.paymentGroupId)) {
                processedGroups.add(order.paymentGroupId);

                const txn = await Transaction.findOne({
                    paymentId: order.paymentGroupId, status: "pending",
                });

                if (txn && txn.walletAmount > 0) {
                    const refundedUser = await User.findByIdAndUpdate(
                        order.customerId,
                        { $inc: { walletBalance: txn.walletAmount } },
                        { new: true }
                    );
                    const prevBalance = (refundedUser.walletBalance || 0) - txn.walletAmount;
                    await WalletTransaction.create({
                        userId: order.customerId, type: "credit", amount: txn.walletAmount,
                        category: "refund",
                        balanceBefore: prevBalance,
                        balanceAfter: refundedUser.walletBalance,
                        note: `Auto-refund — stale checkout expired (Group ${order.paymentGroupId})`,
                    });
                }

                if (txn) { txn.status = "failed"; await txn.save(); }
            }
        }

        // Bulk cancel all stale orders
        const staleIds = staleOrders.map(o => o._id);
        await Order.updateMany(
            { _id: { $in: staleIds } },
            {
                $set: { status: "CANCELLED", paymentStatus: "failed", cancelReason: "Auto-cancelled — payment timeout (15 min)" },
                $push: { events: { status: "CANCELLED", note: "Cron: stale checkout auto-cancelled, stock & wallet restored" } }
            }
        );

        logger.info(`[Cron] Auto-cancelled ${staleOrders.length} stale PENDING_PAYMENT orders (${processedGroups.size} groups). Stock & wallet restored.`);
    } catch (error) {
        logger.error("[Cron] Error sweeping stale orders:", error);
    }
});
