const express = require('express');
const router = express.Router();
const { authenticate: authMiddleware, authorize: roleGuard } = require('../middleware/auth');
const { uploadKycDocument, generateKycReadUrl } = require('../services/kycService');
const multer = require('multer');
const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WEBP, and PDF are allowed.`));
    }
};

const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter
});

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const { type } = req.body; // e.g. 'AADHAAR'
        if (!['AADHAAR', 'PAN', 'PASSPORT', 'GSTIN'].includes(type)) {
            return res.status(400).json({ error: 'Invalid document type requested' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No document file provided' });
        }
        
        const result = await uploadKycDocument(req.file.buffer, req.file.mimetype, type, req.user.id);
        if (!result.ok) {
            return res.status(500).json({ error: result.error });
        }
        
        res.json({ ok: true, documentIdentifier: result.key });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const User = require('../models/User');

// Admin ONLY: Fetch document image for review
router.get('/read-url/:id', 
    authMiddleware, roleGuard('admin', 'super_admin'), 
    require("../middleware/validateJoi")({ params: require("joi").object({ id: require("joi").string().required() }) }),
    async (req, res) => {
    try {
        const params = req.validatedParams || req.params;
        const documentIdentifier = params.id; // Usually a storage key/path
        const result = await generateKycReadUrl(documentIdentifier);
        
        if (!result.ok) return res.status(500).json({ error: result.error });
        res.json({ ok: true, readUrl: result.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin ONLY: Update KYC Status
router.patch('/admin/:userId', 
    authMiddleware, 
    require("../middleware/validateJoi")({ params: require("joi").object({ userId: require("joi").string().required() }) }),
    async (req, res) => {
    // Task 3: Add Authorization Protection
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    try {
        const { kycStatus } = req.body;
        const params = req.validatedParams || req.params;
        const { userId } = params;

        if (!kycStatus) {
            return res.status(400).json({ error: "kycStatus is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Task 4: Prevent Invalid Status Transitions
        const allowedTransitions = {
            PENDING: ["SUBMITTED"],
            SUBMITTED: ["VERIFIED", "REJECTED"],
            VERIFIED: ["REJECTED"], // Provide a way out if verified by mistake
            REJECTED: ["SUBMITTED"] // Let them re-submit
        };

        const validNextStates = allowedTransitions[user.kycStatus] || [];
        if (!validNextStates.includes(kycStatus)) {
            return res.status(400).json({ 
                error: `Invalid transition: Cannot move from ${user.kycStatus} to ${kycStatus}` 
            });
        }

        user.kycStatus = kycStatus;
        
        // Task 6: Add timestamp for verification if state equals VERIFIED
        if (kycStatus === "VERIFIED") {
            user.kycVerifiedAt = new Date();
             // Enable payouts when verified safely
            user.payoutsEnabled = true;
        }

        await user.save();

        // Audit trail
        const AuditLog = require('../models/AuditLog');
        await AuditLog.create({
            action: "kyc_status_change", actorId: req.user._id,
            actorName: req.user.name, actorRole: req.user.role,
            targetId: userId, targetType: "user",
            details: { previousStatus: validNextStates.length > 0 ? "transition" : "unknown", newStatus: kycStatus, userName: user.name },
            newState: { kycStatus },
            ipAddress: req.ip || "unknown",
        }).catch(() => {});

        res.json({ ok: true, user: user.toJSON() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
