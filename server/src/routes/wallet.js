const express = require("express");
const { body, query } = require("express-validator");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { BadRequest, NotFound } = require("../utils/errors");
const { createRazorpayOrder, verifySignature } = require("../services/paymentService");
const { notify } = require("../services/notificationService");
const config = require("../config");
const logger = require("../utils/logger");

const router = express.Router();

// ── Get Wallet Balance ────────────────────────────────────────────────────────
router.get("/balance", authenticate, (req, res) => {
    res.json({ ok: true, balance: req.user.walletBalance });
});

// ── Add Money — Create Razorpay Order ─────────────────────────────────────────
router.post("/add-money",
    authenticate, authorize("customer"),
    body("amount").isFloat({ min: 10, max: 50000 }).withMessage("Amount must be ₹10–₹50,000"),
    validate,
    async (req, res, next) => {
        try {
            const amount = parseFloat(req.body.amount);

            // Create pending wallet transaction
            const walletTxn = await WalletTransaction.create({
                userId: req.user._id,
                type: "credit",
                amount,
                category: "add_money",
                balanceBefore: req.user.walletBalance,
                balanceAfter: req.user.walletBalance, // updated after verification
                note: `Add ₹${amount} to wallet`,
                status: "pending",
            });

            // Create Razorpay order
            const rzOrder = await createRazorpayOrder(amount, `wallet_${walletTxn._id}`);
            walletTxn.razorpayOrderId = rzOrder.id;
            await walletTxn.save();

            res.json({
                ok: true,
                razorpayOrderId: rzOrder.id,
                razorpayKeyId: config.razorpay.keyId,
                amount: rzOrder.amount,
                currency: rzOrder.currency,
                walletTxnId: walletTxn._id,
            });
        } catch (err) { next(err); }
    }
);

// ── Verify Topup — Credit Wallet After Payment ────────────────────────────────
router.post("/verify-topup",
    authenticate,
    body("razorpay_order_id").notEmpty(),
    body("razorpay_payment_id").notEmpty(),
    body("razorpay_signature").notEmpty(),
    validate,
    async (req, res, next) => {
        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

            // Verify signature
            const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
            if (!isValid) throw new BadRequest("Invalid payment signature");

            // Find pending wallet transaction
            const walletTxn = await WalletTransaction.findOne({
                razorpayOrderId: razorpay_order_id,
                userId: req.user._id,
                status: "pending",
            });
            if (!walletTxn) throw new NotFound("Wallet transaction not found");

            // Idempotency: already completed
            if (walletTxn.status === "completed") {
                return res.json({ ok: true, message: "Already processed", balance: req.user.walletBalance });
            }

            // Credit wallet atomically
            const user = await User.findByIdAndUpdate(
                req.user._id,
                { $inc: { walletBalance: walletTxn.amount } },
                { new: true }
            );

            walletTxn.paymentId = razorpay_payment_id;
            walletTxn.balanceAfter = user.walletBalance;
            walletTxn.status = "completed";
            await walletTxn.save();

            await notify("customer", `₹${walletTxn.amount} added to wallet! Balance: ₹${user.walletBalance}`, "payment", req.user._id);

            logger.info("Wallet topup verified", {
                userId: req.user._id.toString(),
                amount: walletTxn.amount,
                newBalance: user.walletBalance,
            });

            res.json({ ok: true, balance: user.walletBalance });
        } catch (err) { next(err); }
    }
);

// ── Wallet Transaction History ────────────────────────────────────────────────
router.get("/transactions",
    authenticate,
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 }),
    validate,
    async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;

            const filter = { userId: req.user._id, status: "completed" };

            const [transactions, total] = await Promise.all([
                WalletTransaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
                WalletTransaction.countDocuments(filter),
            ]);

            res.json({
                ok: true,
                transactions,
                balance: req.user.walletBalance,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            });
        } catch (err) { next(err); }
    }
);

module.exports = router;
