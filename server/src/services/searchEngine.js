const algoliasearch = require("algoliasearch");
const logger = require("../utils/logger");
const Product = require("../models/Product");

class SearchEngine {
    constructor() {
        this.client = null;
        this.index = null;

        if (process.env.ALGOLIA_APP_ID && process.env.ALGOLIA_API_KEY) {
            try {
                this.client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_API_KEY);
                this.index = this.client.initIndex("nearmart_products");
                logger.info("[SearchEngine] Algolia successfully initialized.");
            } catch (err) {
                logger.error("[SearchEngine] Failed to init Algolia. Falling back to native DB search.");
            }
        } else {
            logger.warn("[SearchEngine] No Algolia keys detected. Operating in DB Native Fallback mode.");
        }
    }

    /**
     * Syncs a product document to the search index.
     * @param {Object|string} product - The mongoose Product doc or ID
     */
    async syncProduct(product) {
        try {
            if (!this.index) return; // Silent skip if no search config (saves to DB only)

            let pDoc = product;
            if (typeof product === "string" || product instanceof String) {
                pDoc = await Product.findById(product);
            }

            if (!pDoc) return;

            // Only index active products that are in-stock
            if (pDoc.status !== "active" || pDoc.stock <= 0) {
                return this.removeProduct(pDoc._id);
            }

            // Sync required fields
            const record = {
                objectID: pDoc._id.toString(),
                sellerId: pDoc.sellerId ? pDoc.sellerId.toString() : null,
                globalProductId: pDoc.globalProductId ? pDoc.globalProductId.toString() : null,
                productName: pDoc.name,
                category: pDoc.category,
                keywords: [pDoc.name, pDoc.category, ...(pDoc.tags || [])].join(" "),
                price: pDoc.sellingPrice,
                stock: pDoc.stock,
            };

            await this.index.saveObject(record);
        } catch (error) {
            logger.error(`[SearchEngine] Sync failed for product ${product._id || product}:`, error);
        }
    }

    /**
     * Removes a product from the index.
     */
    async removeProduct(productId) {
        try {
            if (!this.index) return;
            await this.index.deleteObject(productId.toString());
        } catch (error) {
            logger.error(`[SearchEngine] Delete failed for product ${productId}:`, error);
        }
    }

    /**
     * Searches the index. Typo-tolerance relies on the engine.
     * @param {string} query 
     * @param {number} limit 
     * @returns {Array} List of product IDs matching the query
     */
    async searchProducts(query, limit = 50) {
        if (!this.index) {
            // Fallback native mongo query if no external search engine is connected
            return "USE_DB_FALLBACK";
        }
        try {
            const { hits } = await this.index.search(query, { hitsPerPage: limit });
            return hits.map(hit => hit.objectID);
        } catch (error) {
            logger.error("[SearchEngine] Search failed:", error);
            return "USE_DB_FALLBACK";
        }
    }
}

module.exports = new SearchEngine();
