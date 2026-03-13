const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("./logger");
const redisClient = require("../config/redis");
const { haversineStrict: haversineDistance } = require("./geo");

let timeoutSweeper = null;
let isDispatching = false; // Mutex lock

// ── Phase-8: Traffic multiplier heuristic (no external API) ──────────────────
const getTrafficMultiplier = () => {
    const hour = new Date().getHours();
    if (hour >= 8 && hour <= 10) return 1.4;  // Morning rush
    if (hour >= 12 && hour <= 14) return 1.2;  // Lunch rush
    if (hour >= 17 && hour <= 20) return 1.5;  // Evening peak
    if (hour >= 22 || hour <= 5) return 0.8;   // Low traffic
    return 1.0;
};

// ── Phase-8: Adaptive dispatch radius ────────────────────────────────────────
const getDispatchRadius = (order) => {
    return order.currentDispatchRadius || 10; // km, stored per order
};

const MAX_DISPATCH_RETRIES = 10;
const RADIUS_STEPS = [10, 15, 20]; // km

const triggerDispatch = async (app) => {
    if (isDispatching) return;
    isDispatching = true;

    try {
        const io = app.get("io");
        const liveRiders = app.get("liveRiders");

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

        const onlineRiders = await User.find({ role: "delivery", isOnline: true });
        
        // Map rider states
        const riderLoad = {};
        for (const r of onlineRiders) {
            riderLoad[r._id.toString()] = r.activeOrderIds ? r.activeOrderIds.length : 0;
        }

        // Phase-5: N+1 Optimization (Batch Fetch Active Orders)
        const activeOrderIdsToFetch = onlineRiders.map(r => r.activeOrderId).filter(Boolean);
        const activeOrdersList = activeOrderIdsToFetch.length > 0 ? await Order.find({ _id: { $in: activeOrderIdsToFetch } }) : [];
        const activeOrdersMap = new Map();
        for (const o of activeOrdersList) {
            activeOrdersMap.set(o._id.toString(), o);
        }

        // Phase-5: Redis N+1 Optimization (Local Meta Cache)
        const riderMetaCache = new Map();
        const trafficMultiplier = getTrafficMultiplier();

        for (const order of unassignedOrders) {
            if (!order.pickupLocation || !order.pickupLocation.coordinates) continue;
            const storeLat = order.pickupLocation.coordinates[1];
            const storeLng = order.pickupLocation.coordinates[0];

            // Phase-8: Retry cap check
            if ((order.retryCount || 0) >= MAX_DISPATCH_RETRIES) {
                if (!order.escalationRequired) {
                    await Order.findByIdAndUpdate(order._id, {
                        $set: { escalationRequired: true },
                    });
                    const { notify } = require("../services/notificationService");
                    await notify("admin", `🚨 Dispatch failed after ${MAX_DISPATCH_RETRIES} retries: Order ${order._id}`, "alert");
                    logger.warn(`[Dispatch] Order ${order._id} exceeded max retries — escalated to admin`);
                }
                continue; // Skip this order
            }

            let bestRider = null;
            let shortestDist = Infinity;
            let bestTrueDistance = Infinity;
            let isBatchOpportunity = false;
            let candidateList = [];

            // Phase-8: Adaptive dispatch radius
            const radiusKm = getDispatchRadius(order);

            // Single Source of Truth (Redis GEO Clustering)
            let searchPool = [];
            let useRedisFallback = true;
            try {
                const redisCandidates = await redisClient.geosearch(
                    "riders:locations",
                    "FROMLONLAT", storeLng, storeLat,
                    "BYRADIUS", radiusKm, "km",
                    "ASC"
                );
                searchPool = redisCandidates;
                useRedisFallback = false;
            } catch (e) {
                logger.warn("Redis GEOSEARCH failed, falling back to Memory Maps for Dispatch.");
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

                // Phase-8: Rider rejection cooldown check
                if (rider.dispatchCooldownUntil && new Date(rider.dispatchCooldownUntil) > new Date()) {
                    continue; // Rider is in cooldown
                }

                const activeCount = riderLoad[riderId] || 0;
                const maxActive = rider.maxActiveOrders || 3;
                if (activeCount >= maxActive) continue;

                // Cross-Cluster Metadata
                let liveLoc = liveRiders ? liveRiders.get(riderId) : null;
                if (!useRedisFallback) {
                    if (riderMetaCache.has(riderId)) {
                        liveLoc = riderMetaCache.get(riderId);
                    } else {
                        try {
                            const rawMeta = await redisClient.hget(`rider:${riderId}:meta`, "data");
                            if (rawMeta) liveLoc = JSON.parse(rawMeta);
                        } catch (e) {}
                        riderMetaCache.set(riderId, liveLoc);
                    }
                }

                if (!liveLoc || liveLoc.batteryLevel < 0.1 || liveLoc.status !== "online") continue;

                // RIDER GPS FRESHNESS CHECK
                const locationAgeSeconds = (Date.now() - liveLoc.time) / 1000;
                if (locationAgeSeconds > 30) continue;

                // BATCHING PROXIMITY SAFEGUARDS
                let riderIsAtSameStore = false;
                if (activeCount > 0 && rider.activeOrderId) {
                    const existingOrder = activeOrdersMap.get(rider.activeOrderId.toString());
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
                    bestRider = rider;
                    shortestDist = distToStore;
                    bestTrueDistance = distToStore;
                    isBatchOpportunity = true;
                    break;
                }

                if (distToStore <= radiusKm * 1000) {
                    // Phase-8: Pure Haversine + traffic multiplier scoring (no Google API)
                    const adjustedDistance = distToStore * trafficMultiplier;
                    const idlePenalty = locationAgeSeconds * 5;
                    const loadPenalty = activeCount * 800;
                    const idleBonus = locationAgeSeconds < 5 ? -200 : 0; // Bonus for very fresh location
                    const ratingBonus = (rider.rating || 5) >= 4.5 ? -100 : 0; // Quality bonus
                    const baseScore = adjustedDistance + idlePenalty + loadPenalty + idleBonus + ratingBonus;

                    candidateList.push({
                        rider,
                        liveLoc,
                        distToStore,
                        baseScore
                    });
                }
            }

            if (!bestRider && candidateList.length > 0) {
                // Phase-8: Sort by heuristic score, take best
                candidateList.sort((a, b) => a.baseScore - b.baseScore);
                const winner = candidateList[0];
                bestRider = winner.rider;
                shortestDist = winner.baseScore;
                bestTrueDistance = winner.distToStore;
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
                        },
                        $inc: { offerCount: 1 }, // Phase-8: Dispatch monitoring
                    },
                    { new: true }
                );

                if (updatedOrder && io) {
                    io.to(`delivery_${bestRider._id}`).emit("newDeliveryOffer", {
                        orderId: order._id,
                        storeName: order.storeName,
                        distanceToStoreMeters: Math.round(bestTrueDistance),
                        pickupLocation: order.pickupLocation,
                        dropLocation: order.dropLocation,
                        total: order.total,
                        expiresAt: updatedOrder.offerExpiresAt,
                        isBatch: isBatchOpportunity
                    });
                    logger.info(`[Dispatch Engine] Offer: Order ${order._id} → Rider ${bestRider._id} (${Math.round(bestTrueDistance)}m, radius: ${radiusKm}km). Batched: ${isBatchOpportunity}`);
                }
            } else {
                // Phase-8: Increment retry count and expand radius
                const currentRetry = (order.retryCount || 0) + 1;
                const radiusIndex = Math.min(Math.floor(currentRetry / 3), RADIUS_STEPS.length - 1);
                const newRadius = RADIUS_STEPS[radiusIndex];

                await Order.findByIdAndUpdate(order._id, {
                    $inc: { retryCount: 1 },
                    $set: { currentDispatchRadius: newRadius },
                });

                logger.info(`[Dispatch] No riders for Order ${order._id} (retry ${currentRetry}, radius → ${newRadius}km)`);
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

                // Phase-8: Track rider rejection metrics
                await User.findByIdAndUpdate(expiredRiderId, {
                    $inc: { rejectionCount: 1 },
                    $set: { lastRejectionAt: now },
                });

                // Phase-8: Apply cooldown if threshold exceeded (5 rejections in 30 minutes)
                const rider = await User.findById(expiredRiderId);
                if (rider && rider.rejectionCount >= 5) {
                    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
                    if (rider.lastRejectionAt && rider.lastRejectionAt > thirtyMinsAgo) {
                        await User.findByIdAndUpdate(expiredRiderId, {
                            $set: { dispatchCooldownUntil: new Date(now.getTime() + 10 * 60 * 1000) }, // 10 min cooldown
                        });
                        logger.warn(`[Dispatch] Rider ${expiredRiderId} placed on 10-min cooldown (${rider.rejectionCount} rejections)`);
                    }
                }

                if (io) io.to(`delivery_${expiredRiderId}`).emit("offerExpired", { orderId: order._id });
                needsRedispatch = true;
            }

            if (needsRedispatch) {
                setImmediate(() => triggerDispatch(app));
            }

        } catch (err) {
            logger.error(`[Dispatch Sweeper] Error: ${err.message}`);
        }
    }, 10000); // Check timeouts every 10 seconds
};

module.exports = { startDispatchEngine, triggerDispatch };
