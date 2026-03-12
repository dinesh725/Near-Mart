const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const config = require("./config");
const logger = require("./utils/logger");
const { startCronJobs } = require("./utils/cronJobs");
const { startDispatchEngine } = require("./utils/dispatchEngine");
const { setupCronWorkers } = require("./workers/cronWorkers");
const { setupNotificationWorkers } = require("./workers/notificationWorkers");
const { createAdapter } = require("@socket.io/redis-adapter");
const redisClient = require("./config/redis");
const DeliveryTrackingLog = require("./models/DeliveryTrackingLog");
const Order = require("./models/Order");
const { haversine } = require("./utils/geo");

// ── App Init ──────────────────────────────────────────────────────────────────
// ── Batch location log buffer ─────────────────────────────────────────────────
const locationBuffer = [];
const BATCH_SIZE = 5;
const FLUSH_INTERVAL_MS = 10000; // flush every 10s even if batch not full

async function flushLocationBuffer() {
    if (locationBuffer.length === 0) return;
    const batch = locationBuffer.splice(0, locationBuffer.length);
    try {
        await DeliveryTrackingLog.insertMany(batch, { ordered: false });
    } catch (err) {
        logger.error("Failed to flush tracking logs", { error: err.message, count: batch.length });
    }
}

// ── Connect to MongoDB & start server ─────────────────────────────────────────
const start = async () => {
    try {
        logger.info(`Connecting to MongoDB: ${config.mongoUri}`);
        try {
            await mongoose.connect(config.mongoUri);
            logger.info("✅ MongoDB connected");
        } catch (e) {
            logger.warn("⚠️ Failed to connect to MongoDB, starting anyway for WebSocket testing...");
        }

        const server = http.createServer(app);
        
        const pubClient = redisClient.duplicate();
        const subClient = redisClient.duplicate();

        // ── Redis Adapter Error Handlers (Stabilization Patch) ────────────
        pubClient.on("error", (err) => logger.error("Redis pub adapter error", { error: err.message }));
        subClient.on("error", (err) => logger.error("Redis sub adapter error", { error: err.message }));

        const io = new Server(server, {
            cors: {
                origin: config.corsOrigin,
                methods: ["GET", "POST"]
            },
            pingTimeout: 30000,
            pingInterval: 10000,
            transports: ["websocket", "polling"],
            adapter: createAdapter(pubClient, subClient)
        });

        app.set("io", io);

        // In-memory rider locations for quick lookups (Fallback)
        const riderLocations = new Map();
        // In-memory spoofing tracker (Fallback)
        const riderTeleportTracker = new Map();
        // Cache drop locations for fast dynamic ETA calculations
        const orderMetaCache = new Map();
        
        app.set("liveRiders", riderTeleportTracker);

        // Periodic flush of location buffer
        setInterval(flushLocationBuffer, FLUSH_INTERVAL_MS);



        io.on("connection", (socket) => {
            logger.info(`⚡ Socket connected: ${socket.id}`);

            socket.on("joinOrderRoom", (orderId) => {
                socket.join(`order_${orderId}`);
                logger.info(`Socket ${socket.id} joined room order_${orderId}`);
            });

            // Seller joins their notification room
            socket.on("joinSellerRoom", (sellerId) => {
                socket.join(`seller_${sellerId}`);
                logger.info(`Socket ${socket.id} joined seller room seller_${sellerId}`);
            });

            // Delivery partner joins the available-orders pool
            socket.on("joinDeliveryPool", () => {
                socket.join("delivery_pool");
                logger.info(`Socket ${socket.id} joined delivery_pool`);
            });



            socket.on("updateLocation", async (data) => {
                if (data.orderId && data.location && data.deliveryPartnerId) {
                    const riderId = data.deliveryPartnerId;
                    socket.riderId = riderId; // Bind to socket for disconnect cleanup
                    const now = Date.now();
                    const newLoc = data.location;

                    // ── GPS Spoof & Anti-Teleport Protection ───────────────
                    let lastLoc = riderTeleportTracker.get(riderId);
                    try {
                        const rawLastLoc = await redisClient.hget(`rider:${riderId}:meta`, "data");
                        if (rawLastLoc) lastLoc = JSON.parse(rawLastLoc);
                    } catch (e) {
                        // Silent fallback
                    }

                    if (lastLoc) {
                        const distMeters = haversine(lastLoc, newLoc);
                        const timeDeltaSeconds = (now - lastLoc.time) / 1000;

                        if (timeDeltaSeconds > 0) {
                            const speedMs = distMeters / timeDeltaSeconds;
                            const speedKmh = speedMs * 3.6;

                            // Fraud condition 1: Unrealistic speed (>120 km/h)
                            // Fraud condition 2: Massive jump (>500m in <3 seconds)
                            if (speedKmh > 120 || (distMeters > 500 && timeDeltaSeconds < 3)) {
                                logger.warn(`[ANTI-FRAUD] Rejected spoofed GPS update for rider ${riderId} - Speed: ${speedKmh.toFixed(1)}km/h, Dist: ${distMeters.toFixed(0)}m in ${timeDeltaSeconds.toFixed(1)}s`);
                                socket.emit("locationSpoofWarning", { msg: "Suspicious location update detected" });
                                return; // Silent reject
                            }
                        }
                    }

                    // Valid location - cache for next jump calc and entire dispatch engine
                    const riderData = { 
                        lat: newLoc.lat, 
                        lng: newLoc.lng, 
                        time: now,
                        batteryLevel: data.batteryLevel || 1.0,
                        status: data.status || "online",
                        activeCount: data.activeCount || 0
                    };
                    
                    riderTeleportTracker.set(riderId, riderData);
                    riderLocations.set(data.orderId, { ...data.location, lastUpdate: now });

                    // Distributed Cluster Update (Single Source of Truth)
                    try {
                        // Geospatial Storage Index
                        await redisClient.geoadd("riders:locations", newLoc.lng, newLoc.lat, riderId);
                        
                        // Metadata JSON blob
                        await redisClient.hset(`rider:${riderId}:meta`, "data", JSON.stringify(riderData));
                        await redisClient.pexpire(`rider:${riderId}:meta`, 12 * 3600 * 1000);
                        
                        // Link specific order tracking for pickup/delivery geofencing 
                        await redisClient.hset("order:locations", data.orderId, JSON.stringify({ ...data.location, lastUpdate: now }));
                    } catch (e) {
                        logger.error(`Redis Location sync failed for rider ${riderId}`, { error: e.message });
                    }

                    // ── Dynamic ETA Engine ──────────────────────────────────────
                    // Perform computation without blocking socket emit
                    (async () => {
                        let meta = orderMetaCache.get(data.orderId);
                        if (!meta) {
                            const order = await Order.findById(data.orderId).select("dropLocation status");
                            if (order && order.dropLocation && order.dropLocation.lat) {
                                meta = { dropLocation: order.dropLocation, smoothedSpeed: newLoc.speed || 5, lastCalc: 0 };
                                orderMetaCache.set(data.orderId, meta);
                            }
                        }

                        if (meta) {
                            const distToDrop = haversine(newLoc, meta.dropLocation);
                            // Exponential smoothing (alpha = 0.3)
                            const rawSpeedMs = newLoc.speed || 5;
                            meta.smoothedSpeed = (meta.smoothedSpeed * 0.7) + (rawSpeedMs * 0.3);

                            // Prevent infinite ETA (min effective speed 2 m/s)
                            const effectiveSpeed = Math.max(meta.smoothedSpeed, 2);
                            const etaSeconds = Math.round(distToDrop / effectiveSpeed);

                            data.distanceMeters = Math.round(distToDrop);
                            data.etaSeconds = etaSeconds;

                            // Only emit specific ETA event if distance changed significantly or time passed
                            if (now - meta.lastCalc > 5000) {
                                io.to(`order_${data.orderId}`).emit("etaUpdate", {
                                    orderId: data.orderId,
                                    distanceMeters: data.distanceMeters,
                                    etaSeconds: data.etaSeconds
                                });
                                meta.lastCalc = now;
                            }
                        }

                        io.to(`order_${data.orderId}`).emit("locationUpdated", data);

                        // Also notify seller room if we know the sellerId
                        if (data.sellerId) {
                            io.to(`seller_${data.sellerId}`).emit("locationUpdated", data);
                        }
                    })();

                    // Buffer for batch persistence
                    locationBuffer.push({
                        orderId: data.orderId,
                        deliveryPartnerId: data.deliveryPartnerId,
                        location: {
                            type: "Point",
                            coordinates: [data.location.lng, data.location.lat],
                        },
                        lat: data.location.lat,
                        lng: data.location.lng,
                        heading: data.location.heading || 0,
                        speed: data.location.speed || 0,
                        accuracy: data.location.accuracy,
                        timestamp: new Date(),
                    });
                    if (locationBuffer.length >= BATCH_SIZE) {
                        flushLocationBuffer();
                    }
                }
            });

            // Geofence: rider confirms pickup (within 200m of store)
            socket.on("confirmPickup", async (data) => {
                let riderLoc = riderLocations.get(data.orderId);
                try {
                    const redisLoc = await redisClient.hget("order:locations", data.orderId);
                    if (redisLoc) riderLoc = JSON.parse(redisLoc);
                } catch (e) {}
                
                if (riderLoc && data.pickupLocation) {
                    const dist = haversine(riderLoc, data.pickupLocation);
                    const valid = dist <= 200; // 200m tolerance for GPS drift
                    socket.emit("pickupValidation", { orderId: data.orderId, valid, distance: Math.round(dist) });
                    if (valid) {
                        io.to(`order_${data.orderId}`).emit("deliveryStatusUpdate", {
                            orderId: data.orderId, status: "PICKED_UP", timestamp: Date.now()
                        });
                    }
                }
            });

            // Geofence: rider confirms delivery (within 200m of customer)
            socket.on("confirmDelivery", async (data) => {
                let riderLoc = riderLocations.get(data.orderId);
                try {
                    const redisLoc = await redisClient.hget("order:locations", data.orderId);
                    if (redisLoc) riderLoc = JSON.parse(redisLoc);
                } catch (e) {}
                if (riderLoc && data.dropLocation) {
                    const dist = haversine(riderLoc, data.dropLocation);
                    const valid = dist <= 200;
                    socket.emit("deliveryValidation", { orderId: data.orderId, valid, distance: Math.round(dist) });
                    if (valid) {
                        io.to(`order_${data.orderId}`).emit("deliveryStatusUpdate", {
                            orderId: data.orderId, status: "DELIVERED", timestamp: Date.now()
                        });
                        riderLocations.delete(data.orderId);
                        try {
                            await redisClient.hdel("order:locations", data.orderId);
                        } catch (e) {}
                    }
                }
            });

            socket.on("disconnect", async () => {
                logger.info(`Socket disconnected: ${socket.id}`);
                // ── Automatically Cleanup Riders From Redis ──
                if (socket.riderId) {
                    try {
                        await redisClient.zrem("riders:locations", socket.riderId);
                        // Do not delete meta yet since they might just be briefly reconnecting, 
                        // geo-removal prevents dispatch indexing natively. 
                    } catch (e) {
                        logger.error(`Redis Disconnect cleanup failed for rider ${socket.riderId}`, { error: e.message });
                    }
                }
            });
        });

        const HOST = "0.0.0.0"; // Required for Render, Railway, etc.
        server.listen(config.port, HOST, () => {
            logger.info(`🚀 NearMart API running on ${HOST}:${config.port}`);
            logger.info(`✅ HTTP & WebSocket Server running on port ${config.port} in ${process.env.NODE_ENV || "development"} mode`);

            // Start background logistics intelligence
            startCronJobs(app);
            setupCronWorkers(app);
            setupNotificationWorkers();
            startDispatchEngine(app);
            logger.info(`   Environment: ${config.nodeEnv}`);
            logger.info(`   CORS origin: ${config.corsOrigin}`);
            logger.info(`   Health check: http://${HOST}:${config.port}/api/health`);
        });
    } catch (err) {
        logger.error("Failed to start server", { error: err.message });
        process.exit(1);
    }
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    await mongoose.connection.close();
    logger.info("MongoDB connection closed");
    process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => {
    logger.error("Unhandled rejection", { error: err.message });
    process.exit(1);
});

start();
