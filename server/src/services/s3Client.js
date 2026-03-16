const { S3Client } = require("@aws-sdk/client-s3");
const logger = require("../utils/logger");

let s3Client = null;

try {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (region && accessKeyId && secretAccessKey) {
        s3Client = new S3Client({
            region: region,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
            },
        });
        logger.info("[S3 Client] Successfully initialized AWS S3 Client.");
    } else {
        logger.warn("[S3 Client] Missing AWS credentials in .env. S3 operations will fail.");
    }
} catch (error) {
    logger.error(`[S3 Client] Initialization error: ${error.message}`);
}

module.exports = s3Client;
