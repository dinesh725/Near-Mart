const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("./logger");
const { getDistanceMatrix } = require("../services/googleMapsService");
const redisClient = require("../config/redis");
const { haversineStrict: haversineDistance } = require("./geo");

let timeoutSweeper = null;
let isDispatching = false; // Mutex lock

const triggerDispatch = async (app) => {
    if (isDispatching) return; // Prevent race conditions
    isDispatching = true;

    try {
        const io = app.get("io");
        const liveRiders = app.get("liveRiders"); // Map from server.js

        const unassignedOrders = await Order.find({
            status: "READY_FOR_PICKUP",
            acceptedByPartnerId: null,
            offeredToPartnerId: null,
            flagged: { $ne: true }
        }).sort({ createdAt: 1 });

        if (unassignedOrders.length === 0) {
            isDispatching = false;
            return;
        }

        // Get all online delivery partners
        const onlineRiders = await User.find({ role: "delivery", isOnline: true });
        
        // Map rider states
        const riderLoad = {}; // active order count
        for (const r of onlineRiders) {
            riderLoad[r._id.toString()] = r.activeOrderIds ? r.activeOrderIds.length : 0;
        }

        for (const order of unassignedOrders) {
            if (!order.pickupLocation || !order.pickupLocation.coordinates) continue;
            const storeLat = order.pickupLocation.coordinates[1];
            const storeLng = order.pickupLocation.coordinates[0];

            let bestRider = null;
            let shortestDist = Infinity; // the math score
            let bestTrueDistance = Infinity; // the actual real-world meters
            let isBatchOpportunity = false;
            let candidateList = [];

            // ── Single Source of Truth (Redis GEO Clustering) ────────────
            let searchPool = [];
            let useRedisFallback = true;
            try {
                // Fetch rider IDs natively from Redis regardless of which Node node they connected to
                const redisCandidates = await redisClient.geosearch(
                    "riders:locations",
                    "FROMLONLAT", storeLng, storeLat,
                    "BYRADIUS", 10, "km",
                    "ASC"
                );
                searchPool = redisCandidates;
                useRedisFallback = false;
            } catch (e) {
                logger.warn("Redis GEOSEARCH failed dynamically falling back to Memory Maps for Dispatch.");
                searchPool = onlineRiders;
            }

            // Loop through candidate riders
            for (const item of searchPool) {
                const riderId = useRedisFallback ? item._id.toString() : item;
                const rider = onlineRiders.find(r => r._id.toString() === riderId);
                if (!rider) continue;

                if (order.rejectedByPartnerIds && order.rejectedByPartnerIds.some(id => id.toString() === riderId)) {
                    continue;
                }

                const activeCount = riderLoad[riderId] || 0;
                const maxActive = rider.maxActiveOrders || 3;
                
                if (activeCount >= maxActive) continue; // Full capacity

                // ── Cross-Cluster Metadata ──────────────────────────────
                let liveLoc = liveRiders ? liveRiders.get(riderId) : null;
                if (!useRedisFallback) {
                    try {
                        const rawMeta = await redisClient.hget(`rider:${riderId}:meta`, "data");
                        if (rawMeta) liveLoc = JSON.parse(rawMeta);
                    } catch (e) {}
                }

                if (!liveLoc || liveLoc.batteryLevel < 0.1 || liveLoc.status !== "online") continue; // Needs GPS and Battery > 10%

                // ── RIDER GPS FRESHNESS CHECK ──
                const locationAgeSeconds = (Date.now() - liveLoc.time) / 1000;
                if (locationAgeSeconds > 30) continue; // Location is too stale, rider might be disconnected

                // ── BATCHING PROXIMITY SAFEGUARDS ──
                let riderIsAtSameStore = false;
                if (activeCount > 0 && rider.activeOrderId) {
                    const existingOrder = await Order.findById(rider.activeOrderId);
                    if (existingOrder && existingOrder.storeId === order.storeId && ["READY_FOR_PICKUP", "RIDER_ASSIGNED"].includes(existingOrder.status)) {
                        if (order.dropLocation && existingOrder.dropLocation) {
                            const dropDiff = haversineDistance(
                                { lat: order.dropLocation.lat, lng: order.dropLocation.lng },
                                { lat: existingOrder.dropLocation.lat, lng: existingOrder.dropLocation.lng }
                            );
                            if (dropDiff <= 1500) riderIsAtSameStore = true;
                        }
                    }
                }

                const distToStore = haversineDistance(
                    { lat: liveLoc.lat, lng: liveLoc.lng },
                    { lat: storeLat, lng: storeLng }
                );

                if (riderIsAtSameStore) {
                    // Instant batching match
                    bestRider = rider;
                    shortestDist = distToStore;
                    bestTrueDistance = distToStore;
                    isBatchOpportunity = true;
                    break; 
                }

                if (distToStore <= 5000) {
                    const idlePenalty = locationAgeSeconds * 5; 
                    const loadPenalty = activeCount * 800; 
                    const baseScore = distToStore + idlePenalty + loadPenalty;

                    candidateList.push({
                        rider,
                        liveLoc,
                        distToStore,
                        idlePenalty,
                        loadPenalty,
                        baseScore
                    });
                }
            }

            if (!bestRider && candidateList.length > 0) {
                // Phase-3: Sort by Haversine base score, slice Top 5
                candidateList.sort((a, b) => a.baseScore - b.baseScore);
                const topCandidates = candidateList.slice(0, 5);

                // Fetch Real Road Network Distances for Top 5 constraints
                const origins = topCandidates.map(c => ({ lat: c.liveLoc.lat, lng: c.liveLoc.lng }));
                const destination = { lat: storeLat, lng: storeLng };
                const matrixResults = await getDistanceMatrix(origins, destination);

                // Find the specific winner based on Road Network Distance
                for (let i = 0; i < topCandidates.length; i++) {
                    const candidate = topCandidates[i];
                    const matrixData = matrixResults[i];

                    // Use real road distance for scoring, or fallback to haversine if API skipped
                    const realDistToStore = matrixData.distance; 
                    const dispatchScore = realDistToStore + candidate.idlePenalty + candidate.loadPenalty;

                    if (dispatchScore < shortestDist) {
                        shortestDist = dispatchScore;
                        bestTrueDistance = realDistToStore;
                        bestRider = candidate.rider;
                    }
                }
            }

            if (bestRider) {
                // Atomic offer lock
                const updatedOrder = await Order.findOneAndUpdate(
                    { _id: order._id, offeredToPartnerId: null },
                    { 
                        $set: { 
                            offeredToPartnerId: bestRider._id, 
                            offerExpiresAt: new Date(Date.now() + 15 * 1000),
                            batchId: isBatchOpportunity ? `BATCH-${order.storeId}-${Math.floor(Date.now() / 1000)}` : order.batchId
                        } 
                    },
                    { new: true }
                );

                if (updatedOrder && io) {
                    io.to(`delivery_${bestRider._id}`).emit("newDeliveryOffer", {
                        orderId: order._id,
                        storeName: order.storeName,
                        distanceToStoreMeters: Math.round(bestTrueDistance), // Send REAL distance to rider app, not score
                        pickupLocation: order.pickupLocation,
                        dropLocation: order.dropLocation,
                        total: order.total,
                        expiresAt: updatedOrder.offerExpiresAt,
                        isBatch: isBatchOpportunity
                    });
                    logger.info(`[Dispatch Engine] Event-Driven Offer: Order ${order._id} → Rider ${bestRider._id} (${Math.round(bestTrueDistance)}m true). Batched: ${isBatchOpportunity}`);
                }
            }
        }
    } catch (err) {
        logger.error(`[Dispatch Engine] Error: ${err.message}`);
    } finally {
        isDispatching = false;
    }
};

const startDispatchEngine = (app) => {
    if (timeoutSweeper) clearInterval(timeoutSweeper);
    logger.info("🚀 Starting Event-Driven Dispatch Sweeper (15s timeouts)...");

    timeoutSweeper = setInterval(async () => {
        try {
            const io = app.get("io");
            const now = new Date();

            // 1. CLEANUP EXPIRED OFFERS
            const expiredOffers = await Order.find({
                status: "READY_FOR_PICKUP",
                offeredToPartnerId: { $ne: null },
                offerExpiresAt: { $lt: now }
            });

            let needsRedispatch = false;
            for (const order of expiredOffers) {
                logger.info(`[Dispatch Expires] Order ${order._id} offer to Rider ${order.offeredToPartnerId} expired.`);
                
                const expiredRiderId = order.offeredToPartnerId;
                
                // Atomically push to rejected array and unlock
                await Order.findByIdAndUpdate(order._id, {
                    $set: { offeredToPartnerId: null, offerExpiresAt: null },
                    $push: { rejectedByPartnerIds: expiredRiderId }
                });

                if (io) io.to(`delivery_${expiredRiderId}`).emit("offerExpired", { orderId: order._id });
                needsRedispatch = true;
            }

            if (needsRedispatch) {
                // Safely trigger next wave immediately
                setImmediate(() => triggerDispatch(app));
            }

        } catch (err) {
            logger.error(`[Dispatch Sweeper] Error: ${err.message}`);
        }
    }, 10000); // Check timeouts every 10 seconds
};

module.exports = { startDispatchEngine, triggerDispatch };
