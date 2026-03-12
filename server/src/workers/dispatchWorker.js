const { Worker, Queue } = require("bullmq");
const redisClient = require("../config/redis");
const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("../utils/logger");
const { getDistanceMatrix } = require("../services/googleMapsService");
const { haversineStrict: haversineDistance } = require("../utils/geo");

// Phase-5: Separate Queue for Delayed Waves
const dispatchWaveQueue = new Queue("dispatchWaveQueue", { connection: redisClient });

const processDispatchEvent = async (orderId, waveOffset = 0, app) => {
    try {
        const io = app.get("io");
        const order = await Order.findById(orderId);
        
        if (!order || order.status !== "READY_FOR_PICKUP" || order.acceptedByPartnerId || order.flagged) {
            return; // Order resolved or invalid
        }

        if (!order.pickupLocation || !order.pickupLocation.coordinates) return;

        const storeLat = order.pickupLocation.coordinates[1];
        const storeLng = order.pickupLocation.coordinates[0];

        // 1. Redis GEOSEARCH for nearby riders
        const redisCandidates = await redisClient.geosearch(
            "riders:locations",
            "FROMLONLAT", storeLng, storeLat,
            "BYRADIUS", 10, "km",
            "ASC"
        );

        if (redisCandidates.length === 0) {
            // No riders nearby. Wait and retry wave.
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset }, { delay: 15000 });
            return;
        }

        // 2. Intersect with riders:available
        const availableRiders = [];
        for (const riderId of redisCandidates) {
            const isAvail = await redisClient.sismember("riders:available", riderId);
            if (isAvail) availableRiders.push(riderId);
        }

        if (availableRiders.length === 0) {
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset }, { delay: 15000 });
            return;
        }

        // Check who rejected it
        const rejectedIds = (order.rejectedByPartnerIds || []).map(id => id.toString());
        const validRiderIds = availableRiders.filter(id => !rejectedIds.includes(id));

        if (validRiderIds.length === 0) {
            // Everyone rejected/busy. Retry later.
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset: 0 }, { delay: 30000 });
            return;
        }

        // Get riders and metadata
        const onlineRiders = await User.find({ _id: { $in: validRiderIds }, isOnline: true });
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

            const idlePenalty = locationAgeSeconds * 5; 
            const loadPenalty = activeCount * 800; 
            const dispatchScore = distToStore + idlePenalty + loadPenalty;

            candidateList.push({ rider, liveLoc, dispatchScore, trueDistance: distToStore });
        }

        if (candidateList.length === 0) {
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset }, { delay: 15000 });
            return;
        }

        // Apply scoring
        candidateList.sort((a, b) => a.dispatchScore - b.dispatchScore);
        
        // ── WAVE SYSTEM ── (Take next 3 riders based on offset)
        const waveCandidates = candidateList.slice(waveOffset, waveOffset + 3);

        if (waveCandidates.length === 0) {
            // Restart wave targeting if we ran out of new candidates
            await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset: 0 }, { delay: 30000 });
            return;
        }

        // Fetch Distance Matrix for top wave candidates
        const origins = waveCandidates.map(c => ({ lat: c.liveLoc.lat, lng: c.liveLoc.lng }));
        const destination = { lat: storeLat, lng: storeLng };
        
        try {
            const matrixResults = await getDistanceMatrix(origins, destination);
            for (let i = 0; i < waveCandidates.length; i++) {
                waveCandidates[i].trueDistance = matrixResults[i].distance;
                waveCandidates[i].dispatchScore = matrixResults[i].distance + waveCandidates[i].dispatchScore;
            }
            waveCandidates.sort((a, b) => a.dispatchScore - b.dispatchScore);
        } catch (e) {
            logger.warn("Matrix failed, using Haversine");
        }

        const winner = waveCandidates[0];

        // Ensure atomic lock
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: order._id, offeredToPartnerId: null, status: "READY_FOR_PICKUP" },
            { 
                $set: { 
                    offeredToPartnerId: winner.rider._id, 
                    offerExpiresAt: new Date(Date.now() + 15 * 1000)
                } 
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

            logger.info(`[Dispatch Wave] Offer: Order ${order._id} → Rider ${winner.rider._id} (Wave Offset: ${waveOffset})`);
            
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
        logger.info("🚀 Starting Phase-5 BRPOP Dispatch Consumer");
        // We use a duplicated client for blocking operations
        const blockingClient = redisClient.duplicate();
        while (true) {
            try {
                // Blocks until an order is pushed
                const result = await blockingClient.brpop("orders:pending", 0);
                if (result) {
                    const orderId = result[1];
                    logger.info(`[Dispatch Engine] Pop order from queue: ${orderId}`);
                    // Fire and forget
                    processDispatchEvent(orderId, 0, app);
                }
            } catch (err) {
                logger.error("BRPOP error", err);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    };
    
    // Start consumer asynchronously
    runRedisConsumer();

    // 2. BullMQ Worker for Waves and Timeouts
    new Worker("dispatchWaveQueue", async (job) => {
        const { orderId, winnerId, waveOffset } = job.data;
        const io = app.get("io");

        if (job.name === "dispatch-wave") {
            await processDispatchEvent(orderId, waveOffset, app);
        } 
        else if (job.name === "check-expired") {
            const order = await Order.findById(orderId);
            if (order && order.offeredToPartnerId && order.offeredToPartnerId.toString() === winnerId && order.status === "READY_FOR_PICKUP") {
                // Still waiting? Time expired!
                await Order.findByIdAndUpdate(orderId, {
                    $set: { offeredToPartnerId: null, offerExpiresAt: null },
                    $push: { rejectedByPartnerIds: winnerId }
                });
                
                logger.info(`[Dispatch Wave] Offer Expired. Order ${orderId} missed by ${winnerId}. Triggering next wave.`);
                if (io) io.to(`delivery_${winnerId}`).emit("offerExpired", { orderId });

                // Trigger next wave (increment offset by 3)
                await dispatchWaveQueue.add("dispatch-wave", { orderId, waveOffset: waveOffset + 3 });
            }
        }
    }, { connection: redisClient });

    logger.info("✅ BulkMQ Dispatch Worker initialized.");
};

module.exports = { setupDispatchWorker };
