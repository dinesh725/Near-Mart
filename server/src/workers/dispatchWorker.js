const { Worker, Queue } = require("bullmq");
const redisClient = require("../config/redis");
const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("../utils/logger");
const { haversineStrict: haversineDistance } = require("../utils/geo");

// Phase-5: Separate Queue for Delayed Waves
const dispatchWaveQueue = new Queue("dispatchWaveQueue", { connection: redisClient });

// Phase-8: Adaptive radius steps
const RADIUS_STEPS = [10, 15, 20]; // km
const MAX_DISPATCH_RETRIES = 10;

// Phase-8: Traffic multiplier heuristic (no external API)
const getTrafficMultiplier = () => {
    const hour = new Date().getHours();
    if (hour >= 8 && hour <= 10) return 1.4;
    if (hour >= 12 && hour <= 14) return 1.2;
    if (hour >= 17 && hour <= 20) return 1.5;
    if (hour >= 22 || hour <= 5) return 0.8;
    return 1.0;
};

const processDispatchEvent = async (orderId, waveOffset = 0, app) => {
    try {
        const io = app.get("io");
        const order = await Order.findById(orderId);
        
        if (!order || order.status !== "READY_FOR_PICKUP" || order.acceptedByPartnerId || order.flagged) {
            return;
        }

        // Phase-8: Retry cap check
        if ((order.retryCount || 0) >= MAX_DISPATCH_RETRIES) {
            if (!order.escalationRequired) {
                await Order.findByIdAndUpdate(order._id, { $set: { escalationRequired: true } });
                const { notify } = require("../services/notificationService");
                await notify("admin", `🚨 Dispatch failed after ${MAX_DISPATCH_RETRIES} retries: Order ${order._id}`, "alert");
                logger.warn(`[Dispatch Wave] Order ${order._id} exceeded max retries — escalated`);
            }
            return;
        }

        if (!order.pickupLocation || !order.pickupLocation.coordinates) return;

        const storeLat = order.pickupLocation.coordinates[1];
        const storeLng = order.pickupLocation.coordinates[0];
        const radiusKm = order.currentDispatchRadius || 10;
        const trafficMultiplier = getTrafficMultiplier();

        // 1. Redis GEOSEARCH for nearby riders (adaptive radius)
        const redisCandidates = await redisClient.geosearch(
            "riders:locations",
            "FROMLONLAT", storeLng, storeLat,
            "BYRADIUS", radiusKm, "km",
            "ASC"
        );

        if (redisCandidates.length === 0) {
            // Phase-8: Increment retry count and expand radius
            const currentRetry = (order.retryCount || 0) + 1;
            const radiusIndex = Math.min(Math.floor(currentRetry / 3), RADIUS_STEPS.length - 1);
            const newRadius = RADIUS_STEPS[radiusIndex];

            await Order.findByIdAndUpdate(orderId, {
                $inc: { retryCount: 1 },
                $set: { currentDispatchRadius: newRadius },
            });

            if (currentRetry < MAX_DISPATCH_RETRIES) {
                await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset }, { delay: 15000 });
            }
            return;
        }

        // 2. Intersect with riders:available
        const availableRiders = [];
        for (const riderId of redisCandidates) {
            const isAvail = await redisClient.sismember("riders:available", riderId);
            if (isAvail) availableRiders.push(riderId);
        }

        if (availableRiders.length === 0) {
            await Order.findByIdAndUpdate(orderId, { $inc: { retryCount: 1 } });
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset }, { delay: 15000 });
            return;
        }

        // Check who rejected it
        const rejectedIds = (order.rejectedByPartnerIds || []).map(id => id.toString());
        const validRiderIds = availableRiders.filter(id => !rejectedIds.includes(id));

        if (validRiderIds.length === 0) {
            // Phase-8: Expand radius on exhaustion instead of infinite loop
            const currentRetry = (order.retryCount || 0) + 1;
            const radiusIndex = Math.min(Math.floor(currentRetry / 3), RADIUS_STEPS.length - 1);
            const newRadius = RADIUS_STEPS[radiusIndex];

            await Order.findByIdAndUpdate(orderId, {
                $inc: { retryCount: 1 },
                $set: { currentDispatchRadius: newRadius },
            });

            if (currentRetry < MAX_DISPATCH_RETRIES) {
                await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset: 0 }, { delay: 30000 });
            }
            return;
        }

        // Get riders and metadata — filter by cooldown
        const onlineRiders = await User.find({
            _id: { $in: validRiderIds },
            isOnline: true,
            $or: [
                { dispatchCooldownUntil: null },
                { dispatchCooldownUntil: { $lt: new Date() } },
            ],
        });
        const candidateList = [];

        for (const rider of onlineRiders) {
            const riderId = rider._id.toString();
            const rawMeta = await redisClient.hget(`rider:${riderId}:meta`, "data");
            
            let liveLoc = null;
            if (rawMeta) liveLoc = JSON.parse(rawMeta);

            if (!liveLoc || liveLoc.batteryLevel < 0.1) continue; 
            
            const locationAgeSeconds = (Date.now() - liveLoc.time) / 1000;
            if (locationAgeSeconds > 60) continue; // Stale

            const activeCount = rider.activeOrderIds ? rider.activeOrderIds.length : 0;
            if (activeCount >= (rider.maxActiveOrders || 3)) continue;

            const distToStore = haversineDistance(
                { lat: liveLoc.lat, lng: liveLoc.lng },
                { lat: storeLat, lng: storeLng }
            );

            // Phase-8: Heuristic scoring (no Google Maps API)
            const adjustedDistance = distToStore * trafficMultiplier;
            const idlePenalty = locationAgeSeconds * 5; 
            const loadPenalty = activeCount * 800; 
            const idleBonus = locationAgeSeconds < 5 ? -200 : 0;
            const ratingBonus = (rider.rating || 5) >= 4.5 ? -100 : 0;
            const dispatchScore = adjustedDistance + idlePenalty + loadPenalty + idleBonus + ratingBonus;

            candidateList.push({ rider, liveLoc, dispatchScore, trueDistance: distToStore });
        }

        if (candidateList.length === 0) {
            await Order.findByIdAndUpdate(orderId, { $inc: { retryCount: 1 } });
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset }, { delay: 15000 });
            return;
        }

        // Apply scoring
        candidateList.sort((a, b) => a.dispatchScore - b.dispatchScore);
        
        // WAVE SYSTEM (Take next 3 riders based on offset)
        const waveCandidates = candidateList.slice(waveOffset, waveOffset + 3);

        if (waveCandidates.length === 0) {
            const currentRetry = (order.retryCount || 0) + 1;
            const radiusIndex = Math.min(Math.floor(currentRetry / 3), RADIUS_STEPS.length - 1);
            const newRadius = RADIUS_STEPS[radiusIndex];

            await Order.findByIdAndUpdate(orderId, {
                $inc: { retryCount: 1 },
                $set: { currentDispatchRadius: newRadius },
            });

            if (currentRetry < MAX_DISPATCH_RETRIES) {
                await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset: 0 }, { delay: 30000 });
            }
            return;
        }

        // Take the best from the wave
        const winner = waveCandidates[0];

        // Ensure atomic lock
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, offeredToPartnerId: null, status: "READY_FOR_PICKUP" },
            { 
                $set: { 
                    offeredToPartnerId: winner.rider._id, 
                    offerExpiresAt: new Date(Date.now() + 15 * 1000)
                },
                $inc: { offerCount: 1 }, // Phase-8: Dispatch monitoring
            },
            { new: true }
        );

        if (updatedOrder && io) {
            io.to(`delivery_${winner.rider._id}`).emit("newDeliveryOffer", {
                orderId: order._id,
                storeName: order.storeName,
                distanceToStoreMeters: Math.round(winner.trueDistance), 
                pickupLocation: order.pickupLocation,
                dropLocation: order.dropLocation,
                total: order.total,
                expiresAt: updatedOrder.offerExpiresAt,
                isBatch: false
            });

            logger.info(`[Dispatch Wave] Offer: Order ${order._id} → Rider ${winner.rider._id} (Wave Offset: ${waveOffset}, Radius: ${radiusKm}km)`);
            
            // Schedule the NEXT wave if this one expires
            await dispatchWaveQueue.add("check-expired", { orderId, winnerId: winner.rider._id, waveOffset }, { delay: 15500 });
        }

    } catch (err) {
        logger.error(`Dispatch process error: ${err.message}`);
    }
};

const setupDispatchWorker = (app) => {
    // 1. Native BRPOP Queue Consumer Loop
    const runRedisConsumer = async () => {
        logger.info("🚀 Starting Phase-8 BRPOP Dispatch Consumer (Haversine + Adaptive Radius)");
        const blockingClient = redisClient.duplicate();
        while (true) {
            try {
                const result = await blockingClient.brpop("orders:pending", 0);
                if (result) {
                    const orderId = result[1];
                    logger.info(`[Dispatch Engine] Pop order from queue: ${orderId}`);
                    processDispatchEvent(orderId, 0, app);
                }
            } catch (err) {
                logger.error("BRPOP error", err);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    };
    
    runRedisConsumer();

    // 2. BullMQ Worker for Waves and Timeouts
    new Worker("dispatchWaveQueue", async (job) => {
        const { orderId, winnerId, waveOffset } = job.data;

        if (job.name === "dispatch-wave") {
            await processDispatchEvent(orderId, waveOffset, app);
        } 
        else if (job.name === "check-expired") {
            const order = await Order.findById(orderId);
            if (order && order.offeredToPartnerId && order.offeredToPartnerId.toString() === winnerId && order.status === "READY_FOR_PICKUP") {
                await Order.findByIdAndUpdate(orderId, {
                    $set: { offeredToPartnerId: null, offerExpiresAt: null },
                    $push: { rejectedByPartnerIds: winnerId }
                });
                
                // Phase-8: Track rider rejection
                await User.findByIdAndUpdate(winnerId, {
                    $inc: { rejectionCount: 1 },
                    $set: { lastRejectionAt: new Date() },
                });

                // Phase-8: Apply cooldown if threshold exceeded
                const rider = await User.findById(winnerId);
                if (rider && rider.rejectionCount >= 5) {
                    const now = new Date();
                    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
                    if (rider.lastRejectionAt && rider.lastRejectionAt > thirtyMinsAgo) {
                        await User.findByIdAndUpdate(winnerId, {
                            $set: { dispatchCooldownUntil: new Date(now.getTime() + 10 * 60 * 1000) },
                        });
                        logger.warn(`[Dispatch Wave] Rider ${winnerId} on 10-min cooldown`);
                    }
                }

                logger.info(`[Dispatch Wave] Offer Expired. Order ${orderId} missed by ${winnerId}. Triggering next wave.`);
                const io = app.get("io");
                if (io) io.to(`delivery_${winnerId}`).emit("offerExpired", { orderId });

                // Trigger next wave (increment offset by 3)
                await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset: waveOffset + 3 });
            }
        }
    }, { connection: redisClient });

    logger.info("✅ BullMQ Dispatch Worker initialized (Phase-8: Adaptive Radius + Rejection Tracking).");
};

module.exports = { setupDispatchWorker };
