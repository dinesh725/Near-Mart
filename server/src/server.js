const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const config = require("./config");
const logger = require("./utils/logger");
const { startCronJobs } = require("./utils/cronJobs");
const DeliveryTrackingLog = require("./models/DeliveryTrackingLog");
const Order = require("./models/Order");

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
        const io = new Server(server, {
            cors: {
                origin: config.corsOrigin,
                methods: ["GET", "POST"]
            },
            pingTimeout: 30000,
            pingInterval: 10000,
            transports: ["websocket", "polling"],
        });

        app.set("io", io);

        // In-memory rider locations for quick lookups
        const riderLocations = new Map();

        // Periodic flush of location buffer
        setInterval(flushLocationBuffer, FLUSH_INTERVAL_MS);

        // Haversine distance (meters)
        function haversine(a, b) {
            const R = 6371e3;
            const toRad = d => d * Math.PI / 180;
            const dLat = toRad(b.lat - a.lat);
            const dLng = toRad(b.lng - a.lng);
            const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
        }

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

            // In-memory spoofing tracker (riderId -> { lat, lng, time })
            const riderTeleportTracker = new Map();
            // Cache drop locations for fast dynamic ETA calculations
            const orderMetaCache = new Map();

            // Haversine helper
            const haversine = (loc1, loc2) => {
                if (!loc1 || !loc2) return 0;
                const toRad = x => (x * Math.PI) / 180;
                const R = 6371e3; // meters
                const dLat = toRad(loc2.lat - loc1.lat);
                const dLng = toRad(loc2.lng - loc1.lng);
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(loc1.lat)) * Math.cos(toRad(loc2.lat)) * Math.sin(dLng / 2) ** 2;
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            };

            socket.on("updateLocation", (data) => {
                if (data.orderId && data.location && data.deliveryPartnerId) {
                    const riderId = data.deliveryPartnerId;
                    const now = Date.now();
                    const newLoc = data.location;

                    // ── GPS Spoof & Anti-Teleport Protection ───────────────
                    const lastLoc = riderTeleportTracker.get(riderId);
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

                    // Valid location - cache for next jump calc
                    riderTeleportTracker.set(riderId, { lat: newLoc.lat, lng: newLoc.lng, time: now });

                    riderLocations.set(data.orderId, { ...data.location, lastUpdate: now });

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
            socket.on("confirmPickup", (data) => {
                const riderLoc = riderLocations.get(data.orderId);
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
            socket.on("confirmDelivery", (data) => {
                const riderLoc = riderLocations.get(data.orderId);
                if (riderLoc && data.dropLocation) {
                    const dist = haversine(riderLoc, data.dropLocation);
                    const valid = dist <= 200;
                    socket.emit("deliveryValidation", { orderId: data.orderId, valid, distance: Math.round(dist) });
                    if (valid) {
                        io.to(`order_${data.orderId}`).emit("deliveryStatusUpdate", {
                            orderId: data.orderId, status: "DELIVERED", timestamp: Date.now()
                        });
                        riderLocations.delete(data.orderId);
                    }
                }
            });

            socket.on("disconnect", () => {
                logger.info(`Socket disconnected: ${socket.id}`);
            });
        });

        server.listen(config.port, () => {
            logger.info(`🚀 NearMart API running on port ${config.port}`);
            logger.info(`✅ HTTP & WebSocket Server running on port ${config.port} in ${process.env.NODE_ENV || "development"} mode`);

            // Start background logistics intelligence
            startCronJobs(app);
            logger.info(`   Environment: ${config.nodeEnv}`);
            logger.info(`   CORS origin: ${config.corsOrigin}`);
            logger.info(`   Health check: http://localhost:${config.port}/api/health`);
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
