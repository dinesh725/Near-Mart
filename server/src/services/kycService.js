const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("./s3Client");
const logger = require("../utils/logger");

const uploadKycDocument = async (fileBuffer, mimeType, docType, userId) => {
    try {
        if (!s3Client) throw new Error("S3 Client not configured");
        
        const timestamp = Date.now();
        const extension = mimeType.split('/')[1] || 'jpg';
        const key = `kyc/${userId}/${timestamp}-${docType}.${extension}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_KYC_BUCKET,
            Key: key,
            Body: fileBuffer,
            ContentType: mimeType,
        });

        await s3Client.send(command);
        return { ok: true, key };
    } catch (e) {
        logger.error(`[KYC Service] Failed uploadKycDocument: ${e.message}`);
        return { ok: false, error: 'Storage network error' };
    }
};

const generateKycReadUrl = async (documentIdentifier) => {
    try {
        if (!s3Client) throw new Error("S3 Client not configured");

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_KYC_BUCKET,
            Key: documentIdentifier,
        });

        // Expires in 300 seconds (5 minutes)
        const readUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
        
        return { ok: true, readUrl };
    } catch (e) {
        logger.error(`[KYC Service] Failed generating read URL: ${e.message}`);
        return { ok: false, error: 'Storage network error' };
    }
};

module.exports = { uploadKycDocument, generateKycReadUrl };
