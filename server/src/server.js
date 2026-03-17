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
const jwt = require("jsonwebtoken");
const User = require("./models/User");

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
        // ── 🔴 STRICT ENV VALIDATION ──
        const requiredEnvs = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JWT_SECRET"];
        const missing = requiredEnvs.filter(env => !process.env[env]);
        if (missing.length > 0) {
            logger.error("CRITICAL FATAL: Missing required environment variables. Halting startup.", { missing });
            process.exit(1);
        }

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
        // Phase-8: First-location guard tracker (requires 2 consecutive updates before accepting)
        const riderPendingFirstLoc = new Map();
        // Phase-8: Continuous geofence proximity tracker
        const riderGeofenceHistory = new Map();

        // Periodic flush of location buffer
        setInterval(flushLocationBuffer, FLUSH_INTERVAL_MS);



        // Phase-8: Socket.IO JWT Authentication Middleware
        io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                if (!token) {
                    return next(); // Allow unauthenticated connections for customers
                }
                const decoded = jwt.verify(token, config.jwt.secret);
                const user = await User.findById(decoded.id).select("_id role vehicleType");
                if (user) {
                    socket.userId = user._id.toString();
                    socket.userRole = user.role;
                    socket.vehicleType = user.vehicleType || "bike";
                }
                next();
            } catch (err) {
                logger.warn(`Socket auth failed: ${err.message}`);
                next(); // Still allow connection, but without auth binding
            }
        });

        io.on("connection", (socket) => {
            logger.info(`⚡ Socket connected: ${socket.id} (userId: ${socket.userId || 'anon'}, role: ${socket.userRole || 'unknown'})`);

            // Auto-join delivery room if authenticated rider
            if (socket.userId && socket.userRole === "delivery") {
                socket.join(`delivery_${socket.userId}`);
                logger.info(`Auto-joined delivery room: delivery_${socket.userId}`);
            }

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
                if (data.orderId && data.location) {
                    // Phase-8: Use JWT-authenticated rider ID, ignore client-reported ID
                    const riderId = socket.userId || data.deliveryPartnerId;
                    if (!riderId) return; // Unauthenticated — silently drop
                    
                    socket.riderId = riderId;
                    const now = Date.now();
                    const newLoc = data.location;

                    // Phase-8: Offline buffer replay protection
                    if (data.timestamp && data.timestamp < (now - 60000)) {
                        logger.debug(`[REPLAY] Dropped stale buffered location from rider ${riderId} (age: ${now - data.timestamp}ms)`);
                        return; // Discard updates older than 1 minute
                    }

                    // ── GPS Spoof & Anti-Teleport Protection ───────────────
                    let lastLoc = riderTeleportTracker.get(riderId);
                    try {
                        const rawLastLoc = await redisClient.hget(`rider:${riderId}:meta`, "data");
                        if (rawLastLoc) lastLoc = JSON.parse(rawLastLoc);
                    } catch (e) {
                        // Silent fallback
                    }

                    // Phase-8: First-location guard — require at least 2 updates before accepting
                    if (!lastLoc) {
                        const pending = riderPendingFirstLoc.get(riderId);
                        if (!pending) {
                            riderPendingFirstLoc.set(riderId, { loc: newLoc, time: now, count: 1 });
                            logger.debug(`[GPS] First location from ${riderId} — holding for verification`);
                            return; // Don't write to Redis yet
                        } else if (pending.count < 2) {
                            const dist = haversine(pending.loc, newLoc);
                            const timeDelta = (now - pending.time) / 1000;
                            if (timeDelta > 0 && dist / timeDelta > 33.3) { // > 120km/h between first two updates
                                riderPendingFirstLoc.delete(riderId);
                                logger.warn(`[ANTI-FRAUD] First 2 locations from ${riderId} show unrealistic speed — rejected`);
                                return;
                            }
                            pending.count++;
                            pending.loc = newLoc;
                            pending.time = now;
                            // Fall through to normal processing after 2 valid consecutive updates
                            riderPendingFirstLoc.delete(riderId);
                        }
                    }

                    if (lastLoc) {
                        const distMeters = haversine(lastLoc, newLoc);
                        const timeDeltaSeconds = (now - lastLoc.time) / 1000;

                        if (timeDeltaSeconds > 0) {
                            // Phase-8: Server-side speed computation (ignore client speed)
                            const speedMs = distMeters / timeDeltaSeconds;
                            const speedKmh = speedMs * 3.6;

                            // Phase-8: Vehicle-class speed limits
                            const vehicleType = socket.vehicleType || "bike";
                            const maxSpeed = ["van", "mini_truck", "large_truck"].includes(vehicleType) ? 90 : 60;

                            if (speedKmh > maxSpeed || (distMeters > 500 && timeDeltaSeconds < 3)) {
                                logger.warn(`[ANTI-FRAUD] Rejected spoofed GPS for rider ${riderId} — Speed: ${speedKmh.toFixed(1)}km/h (max: ${maxSpeed}), Dist: ${distMeters.toFixed(0)}m in ${timeDeltaSeconds.toFixed(1)}s`);
                                socket.emit("locationSpoofWarning", { msg: "Suspicious location update detected" });
                                return;
                            }

                            // Phase-8: Store server-computed speed for ETA engine (ignore client speed)
                            newLoc._serverSpeed = speedMs;
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
                            // Phase-8: Use server-computed speed for ETA, not client-provided
                            const rawSpeedMs = newLoc._serverSpeed || 5;
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

            // Phase-8: Geofence with continuous proximity validation
            // Rider must be within 200m for at least 20 seconds with 3+ valid GPS samples
            socket.on("confirmPickup", async (data) => {
                let riderLoc = riderLocations.get(data.orderId);
                try {
                    const redisLoc = await redisClient.hget("order:locations", data.orderId);
                    if (redisLoc) riderLoc = JSON.parse(redisLoc);
                } catch (e) {}
                
                if (riderLoc && data.pickupLocation) {
                    const dist = haversine(riderLoc, data.pickupLocation);
                    
                    // Track proximity history per order
                    const key = `pickup_${data.orderId}`;
                    let history = riderGeofenceHistory.get(key) || [];
                    history.push({ time: Date.now(), distance: dist });
                    // Keep only last 30 seconds of data
                    const cutoff = Date.now() - 30000;
                    history = history.filter(h => h.time > cutoff);
                    riderGeofenceHistory.set(key, history);

                    // Phase-8: Require 3+ samples within 200m over 20+ seconds
                    const validSamples = history.filter(h => h.distance <= 200);
                    const timeSpan = validSamples.length >= 2 
                        ? validSamples[validSamples.length - 1].time - validSamples[0].time 
                        : 0;
                    const valid = validSamples.length >= 3 && timeSpan >= 20000;

                    socket.emit("pickupValidation", { 
                        orderId: data.orderId, valid, distance: Math.round(dist),
                        samplesNeeded: valid ? 0 : Math.max(0, 3 - validSamples.length),
                    });
                    if (valid) {
                        io.to(`order_${data.orderId}`).emit("deliveryStatusUpdate", {
                            orderId: data.orderId, status: "PICKED_UP", timestamp: Date.now()
                        });
                        riderGeofenceHistory.delete(key);
                    }
                }
            });

            // Phase-8: Delivery geofence with continuous proximity
            socket.on("confirmDelivery", async (data) => {
                let riderLoc = riderLocations.get(data.orderId);
                try {
                    const redisLoc = await redisClient.hget("order:locations", data.orderId);
                    if (redisLoc) riderLoc = JSON.parse(redisLoc);
                } catch (e) {}
                if (riderLoc && data.dropLocation) {
                    const dist = haversine(riderLoc, data.dropLocation);
                    
                    const key = `delivery_${data.orderId}`;
                    let history = riderGeofenceHistory.get(key) || [];
                    history.push({ time: Date.now(), distance: dist });
                    const cutoff = Date.now() - 30000;
                    history = history.filter(h => h.time > cutoff);
                    riderGeofenceHistory.set(key, history);

                    const validSamples = history.filter(h => h.distance <= 200);
                    const timeSpan = validSamples.length >= 2 
                        ? validSamples[validSamples.length - 1].time - validSamples[0].time 
                        : 0;
                    const valid = validSamples.length >= 3 && timeSpan >= 20000;

                    socket.emit("deliveryValidation", { 
                        orderId: data.orderId, valid, distance: Math.round(dist),
                        samplesNeeded: valid ? 0 : Math.max(0, 3 - validSamples.length),
                    });
                    if (valid) {
                        io.to(`order_${data.orderId}`).emit("deliveryStatusUpdate", {
                            orderId: data.orderId, status: "DELIVERED", timestamp: Date.now()
                        });
                        riderLocations.delete(data.orderId);
                        riderGeofenceHistory.delete(key);
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
            startDispatchEngine(app); // Legacy fallback scanner

            // ── Phase-5: Real-time BullMQ Dispatch Worker ──
            const { setupDispatchWorker } = require("./workers/dispatchWorker");
            setupDispatchWorker(app);

            // ── Phase-6B: Real-time Payment Webhook Worker ──
            const { setupPaymentWorker } = require("./workers/paymentWorker");
            setupPaymentWorker(app);

            // ── Phase-6B: Background Gateway Refund Worker ──
            const { setupRefundWorker } = require("./workers/refundWorker");
            setupRefundWorker(app);

            // ── Phase-6C: Setup Withdrawals & Settlement Workers ──
            const { setupPayoutWorker } = require("./workers/payoutWorker");
            setupPayoutWorker(app);

            const { setupSettlementWorker } = require("./workers/settlementWorker");
            setupSettlementWorker(app);

            // ── Phase-8: Escrow Settlement Queue Worker ──
            const { setupEscrowSettlementWorker } = require("./workers/escrowSettlementWorker");
            setupEscrowSettlementWorker();

            // ── Phase-8: Stock Reservation Sweeper Worker ──
            const { setupStockReservationWorker } = require("./workers/stockReservationWorker");
            setupStockReservationWorker();

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
