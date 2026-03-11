const Order = require("../models/Order");
const User = require("../models/User");
const logger = require("./logger");

// Helper: Haversine distance in meters
function haversineDistance(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

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

            // Loop through online riders
            for (const rider of onlineRiders) {
                const riderId = rider._id.toString();

                if (order.rejectedByPartnerIds && order.rejectedByPartnerIds.some(id => id.toString() === riderId)) {
                    continue;
                }

                const activeCount = riderLoad[riderId] || 0;
                const maxActive = rider.maxActiveOrders || 3;
                
                if (activeCount >= maxActive) continue; // Full capacity

                const liveLoc = liveRiders ? liveRiders.get(riderId) : null;
                if (!liveLoc || liveLoc.batteryLevel < 0.1 || liveLoc.status !== "online") continue; // Needs GPS and Battery > 10%

                // ── RIDER GPS FRESHNESS CHECK ──
                const locationAgeSeconds = (Date.now() - liveLoc.time) / 1000;
                if (locationAgeSeconds > 30) continue; // Location is too stale, rider might be disconnected

                // ── BATCHING PROXIMITY SAFEGUARDS ──
                let riderIsAtSameStore = false;
                if (activeCount > 0 && rider.activeOrderId) {
                    const existingOrder = await Order.findById(rider.activeOrderId);
                    if (existingOrder && existingOrder.storeId === order.storeId && ["READY_FOR_PICKUP", "RIDER_ASSIGNED"].includes(existingOrder.status)) {
                        
                        // Strict Proximity Check: Only batch if drop-off B is within 1.5km of drop-off A
                        if (order.dropLocation && existingOrder.dropLocation) {
                            const dropDiff = haversineDistance(
                                { lat: order.dropLocation.lat, lng: order.dropLocation.lng },
                                { lat: existingOrder.dropLocation.lat, lng: existingOrder.dropLocation.lng }
                            );
                            
                            if (dropDiff <= 1500) { // Max 1.5km detour allowed
                                riderIsAtSameStore = true;
                            }
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

                // ── DISPATCH SCORING CALCULATION ──
                // The lower the score, the better the match.
                // Weight distance heavily, but add physical "penalty" meters for active payload load and stale GPS age.
                if (distToStore <= 5000) {
                    const idlePenalty = locationAgeSeconds * 5; // Adds perceived 5m per stale second
                    const loadPenalty = activeCount * 800; // Adds perceived 800m per active order
                    
                    const dispatchScore = distToStore + idlePenalty + loadPenalty;

                    // Compare calculated scores via perceived distance, but track true distance
                    if (dispatchScore < shortestDist) {
                        shortestDist = dispatchScore; // we evaluate based on score
                        bestTrueDistance = distToStore;
                        bestRider = rider;
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
