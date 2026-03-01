/**
 * Cloudinary Image Upload Service
 * Handles image uploads with auto-compression, WebP format, and CDN delivery.
 */
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const config = require("../config");
const logger = require("../utils/logger");

// ── Configure Cloudinary ─────────────────────────────────────────────────────
let configured = false;

function ensureConfigured() {
    if (configured) return true;
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) {
        logger.warn("Cloudinary not configured — image uploads will fail");
        return false;
    }
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });
    configured = true;
    return true;
}

// ── Multer middleware (memory storage, 5MB limit) ────────────────────────────
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_TYPES.join(", ")}`));
        }
    },
});

// ── Upload to Cloudinary ─────────────────────────────────────────────────────
async function uploadImage(buffer, options = {}) {
    if (!ensureConfigured()) {
        throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env");
    }

    const {
        folder = "nearmart",
        transformation = { quality: "auto:good", fetch_format: "auto", width: 1200, crop: "limit" },
        resourceType = "image",
    } = options;

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
                transformation,
                overwrite: true,
                invalidate: true,
            },
            (error, result) => {
                if (error) {
                    logger.error("Cloudinary upload failed", { error: error.message });
                    reject(error);
                } else {
                    logger.info("Cloudinary upload success", {
                        publicId: result.public_id,
                        url: result.secure_url,
                        bytes: result.bytes,
                        format: result.format,
                    });
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                        width: result.width,
                        height: result.height,
                        format: result.format,
                        bytes: result.bytes,
                    });
                }
            }
        );
        uploadStream.end(buffer);
    });
}

// ── Delete from Cloudinary ───────────────────────────────────────────────────
async function deleteImage(publicId) {
    if (!ensureConfigured()) return;
    try {
        await cloudinary.uploader.destroy(publicId);
        logger.info("Cloudinary image deleted", { publicId });
    } catch (err) {
        logger.error("Cloudinary delete failed", { publicId, error: err.message });
    }
}

module.exports = { upload, uploadImage, deleteImage, ensureConfigured };
