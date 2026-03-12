const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const roleGuard = require('../middleware/roleGuard');
const { generateUploadUrl, generateReadUrl } = require('../services/kycService');

router.get('/upload-url', authMiddleware, async (req, res) => {
    try {
        const { type } = req.query; // e.g. 'AADHAAR'
        if (!['AADHAAR', 'PAN', 'PASSPORT', 'GSTIN'].includes(type)) {
            return res.status(400).json({ error: 'Invalid document type requested' });
        }
        
        const result = await generateUploadUrl(type, req.user.id);
        if (!result.ok) {
            return res.status(500).json({ error: result.error });
        }
        
        // Return pre-signed url to client to upload directly to S3
        res.json({ ok: true, uploadUrl: result.url, documentIdentifier: result.key });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin ONLY: Fetch document image for review
router.get('/read-url/:id', authMiddleware, roleGuard('ADMIN'), async (req, res) => {
    try {
        const documentIdentifier = req.params.id; // Usually a storage key/path
        const result = await generateReadUrl(documentIdentifier);
        
        if (!result.ok) return res.status(500).json({ error: result.error });
        res.json({ ok: true, readUrl: result.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
