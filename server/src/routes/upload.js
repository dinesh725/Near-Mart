const express = require("express");
const { authenticate } = require("../middleware/auth");
const { upload, uploadImage } = require("../services/cloudinaryService");
const logger = require("../utils/logger");

const router = express.Router();

// ── Upload Product / Store Image ─────────────────────────────────────────────
router.post("/image",
    authenticate,
    upload.single("image"),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({ ok: false, error: "No image file provided" });
            }

            const result = await uploadImage(req.file.buffer, {
                folder: "nearmart/products",
                transformation: { quality: "auto:good", fetch_format: "auto", width: 1200, crop: "limit" },
            });

            res.json({
                ok: true,
                url: result.url,
                publicId: result.publicId,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes,
            });
        } catch (err) {
            logger.error("Image upload failed", { error: err.message });
            if (err.message?.includes("Invalid file type")) {
                return res.status(400).json({ ok: false, error: err.message });
            }
            if (err.message?.includes("not configured")) {
                return res.status(503).json({ ok: false, error: "Image upload service not configured" });
            }
            next(err);
        }
    }
);

// ── Upload Avatar / Profile Picture ──────────────────────────────────────────
router.post("/avatar",
    authenticate,
    upload.single("image"),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({ ok: false, error: "No image file provided" });
            }

            const result = await uploadImage(req.file.buffer, {
                folder: "nearmart/avatars",
                transformation: { quality: "auto:good", fetch_format: "auto", width: 400, height: 400, crop: "fill", gravity: "face" },
            });

            res.json({
                ok: true,
                url: result.url,
                publicId: result.publicId,
            });
        } catch (err) {
            logger.error("Avatar upload failed", { error: err.message });
            if (err.message?.includes("Invalid file type")) {
                return res.status(400).json({ ok: false, error: err.message });
            }
            next(err);
        }
    }
);

// ── Multer error handler ─────────────────────────────────────────────────────
router.use((err, req, res, next) => {
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ ok: false, error: "File too large. Maximum size is 5MB." });
    }
    if (err.message?.includes("Invalid file type")) {
        return res.status(400).json({ ok: false, error: err.message });
    }
    next(err);
});

module.exports = router;
