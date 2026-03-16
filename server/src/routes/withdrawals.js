const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { authenticate: authMiddleware, authorize: roleGuard } = require('../middleware/auth');
const idempotencyGuard = require('../middleware/idempotency');

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Withdrawal = require('../models/Withdrawal');

const { addPayoutJob } = require('../services/queueService');
const { processTransaction } = require('../services/ledgerService');
const { verifyBankAccount } = require('../services/payoutService');

// ── GET WITHDRAWAL HISTORY ──
router.get('/', authMiddleware, async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ sellerId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ ok: true, data: withdrawals });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── LINK BANK ACCOUNT ──
router.post('/bank-account', [
    authMiddleware,
    require('../middleware/validateJoi')(require('joi').object({
        accountNumber: require('joi').string().trim().required(),
        ifscCode: require('joi').string().trim().required(),
        accountHolderName: require('joi').string().trim().required()
    }).unknown(true))
], async (req, res) => {

    try {
        const seller = await User.findById(req.user.id);
        if (!seller) return res.status(404).json({ error: 'User not found' });

        // Pseudo-Tokenization via Gateway
        const linkResult = await verifyBankAccount(req.body);
        if (!linkResult.ok) return res.status(400).json({ error: linkResult.error });

        const wallet = await Wallet.findOne({ ownerId: seller._id, walletType: 'SELLER' });
        if (!wallet) return res.status(404).json({ error: 'Seller wallet not initialized' });

        wallet.payoutAccountId = linkResult.id;
        await wallet.save();

        // Security: Freeze withdrawals for 7 days
        // Implementation logic goes here for cool-down period

        res.json({ ok: true, message: 'Bank account securely linked' });
    } catch (e) {
        res.status(500).json({ ok: false, error: 'Failed to link account' });
    }
});

// ── REQUEST WITHDRAWAL (INTENT) ──
router.post('/', [
    authMiddleware,
    idempotencyGuard,
    require('../middleware/validateJoi')(require('joi').object({
        amount: require('joi').number().min(500).required().messages({'number.min': 'Minimum threshold is ₹500'})
    }).unknown(true))
], async (req, res) => {

    try {
        const amountToWithdraw = req.body.amount;
        const seller = await User.findById(req.user.id);

        if (!seller) return res.status(404).json({ error: 'User not found' });
        
        // 1. KYC Safeguard
        if (seller.kycStatus !== 'VERIFIED') {
            return res.status(403).json({ error: 'KYC not verified. Payouts locked.' });
        }
        
        // Safety switch
        if (seller.payoutsEnabled === false) {
             return res.status(403).json({ error: 'Payouts are currently disabled for this account.' });
        }

        const wallet = await Wallet.findOne({ ownerId: seller._id, walletType: 'SELLER' });
        if (!wallet || !wallet.payoutAccountId) {
            return res.status(400).json({ error: 'No verified bank account linked' });
        }

        // 2. Liquidity Safeguard
        if (wallet.availableBalance < amountToWithdraw) {
            return res.status(400).json({ error: 'Insufficient available balance' });
        }

        // 3. Freeze Capital Intent transaction
        const payoutIdempotency = `payout_intent_${req.idempotencyKey}_${Date.now()}`;
        
        const txResult = await processTransaction({
            idempotencyKey: payoutIdempotency,
            orderId: null,
            type: 'WITHDRAWAL_REQUEST'
        }, [
            { walletType: 'SELLER', ownerId: seller._id, amount: -amountToWithdraw, balanceType: 'availableBalance' },
            { walletType: 'PAYOUT_RESERVE', ownerId: null, amount: amountToWithdraw, balanceType: 'balance' }
        ]);

        if (!txResult.ok) {
             return res.status(400).json({ error: 'Failed to reserve funds' });
        }

        // 4. Create Withdrawal DB Schema
        const withdrawal = await Withdrawal.create({
            sellerId: seller._id,
            walletId: wallet._id,
            amount: amountToWithdraw,
            idempotencyKey: `payout_job_${wallet._id}_${Date.now()}`
        });

        // 5. Submit to BullMQ
        await addPayoutJob({ withdrawalId: withdrawal._id });

        res.status(202).json({ ok: true, message: 'Withdrawal processing seamlessly', withdrawalId: withdrawal._id });
    } catch (e) {
        console.error("WITHDRAW_ERROR", e);
        res.status(500).json({ ok: false, error: 'Internal server error processing payout' });
    }
});

module.exports = router;
