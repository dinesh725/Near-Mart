/**
 * NearMart Infrastructure Verification Script
 * Tests: Razorpay, Cloudinary, Mapbox, MongoDB, Auth, Upload routes
 */

const config = require("./src/config");
const mongoose = require("mongoose");

const results = {};

function pass(name, detail) { results[name] = { status: "✅ PASS", detail }; console.log(`✅ ${name}: ${detail}`); }
function fail(name, detail) { results[name] = { status: "❌ FAIL", detail }; console.log(`❌ ${name}: ${detail}`); }
function warn(name, detail) { results[name] = { status: "⚠️ WARN", detail }; console.log(`⚠️ ${name}: ${detail}`); }

async function run() {
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("  NearMart Infrastructure Verification");
    console.log("═══════════════════════════════════════════════════════════════\n");

    // 1. Config validation
    console.log("── 1. Configuration ──────────────────────────────────────────");
    config.mapbox.accessToken ? pass("Mapbox Token", "Set") : fail("Mapbox Token", "NOT SET");
    config.razorpay.keyId ? pass("Razorpay Key ID", config.razorpay.keyId.substring(0, 15) + "...") : fail("Razorpay Key ID", "NOT SET");
    config.razorpay.keySecret ? pass("Razorpay Key Secret", "Set (hidden)") : fail("Razorpay Key Secret", "NOT SET");
    config.razorpay.webhookSecret ? pass("Razorpay Webhook Secret", "Set") : fail("Razorpay Webhook Secret", "NOT SET");
    config.cloudinary.cloudName ? pass("Cloudinary Cloud Name", config.cloudinary.cloudName) : fail("Cloudinary Cloud Name", "NOT SET");
    config.cloudinary.apiKey ? pass("Cloudinary API Key", "Set (hidden)") : fail("Cloudinary API Key", "NOT SET");
    config.cloudinary.apiSecret ? pass("Cloudinary API Secret", "Set (hidden)") : fail("Cloudinary API Secret", "NOT SET");

    // 2. MongoDB connection
    console.log("\n── 2. MongoDB ────────────────────────────────────────────────");
    try {
        await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
        pass("MongoDB Connection", "Connected to " + mongoose.connection.host);

        // Check collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        const colNames = collections.map(c => c.name);
        pass("MongoDB Collections", colNames.join(", ") || "(empty - first run)");

        // Check indexes
        try {
            const User = require("./src/models/User");
            const indexes = await User.collection.indexes();
            const geoIdx = indexes.find(i => JSON.stringify(i.key).includes("2dsphere"));
            geoIdx ? pass("User Geo Index", "2dsphere index found") : warn("User Geo Index", "No 2dsphere index (created on first User with location)");
        } catch (e) {
            warn("User Geo Index", e.message);
        }

        // Verify DeliveryTrackingLog model
        try {
            const DTL = require("./src/models/DeliveryTrackingLog");
            const dtlIndexes = await DTL.collection.indexes().catch(() => []);
            pass("DeliveryTrackingLog Model", `Schema valid, ${dtlIndexes.length} indexes`);
        } catch (e) {
            warn("DeliveryTrackingLog", e.message);
        }

        // Check password hashing
        try {
            const User = require("./src/models/User");
            const sampleUser = await User.findOne().select("+password");
            if (sampleUser) {
                if (sampleUser.password && sampleUser.password.startsWith("$2")) {
                    pass("Password Hashing", "bcrypt hash detected (secure)");
                } else {
                    fail("Password Hashing", "Password does not appear to be hashed!");
                }
            } else {
                warn("Password Hashing", "No users in DB to verify (first run)");
            }
        } catch (e) {
            warn("Password Hashing", e.message);
        }
    } catch (e) {
        fail("MongoDB Connection", e.message);
    }

    // 3. Razorpay API
    console.log("\n── 3. Razorpay ───────────────────────────────────────────────");
    try {
        const Razorpay = require("razorpay");
        const rz = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
        // Create a small test order to verify API keys work
        const testOrder = await rz.orders.create({
            amount: 100, // ₹1 in paise
            currency: "INR",
            receipt: `test_${Date.now()}`,
            payment_capture: 1,
        });
        if (testOrder && testOrder.id) {
            pass("Razorpay Order Creation", `Order ${testOrder.id} created successfully`);
            pass("Razorpay API Keys", "Valid and working");
        } else {
            fail("Razorpay Order Creation", "No order ID returned");
        }
    } catch (e) {
        fail("Razorpay API", e.message);
    }

    // 4. Cloudinary
    console.log("\n── 4. Cloudinary ─────────────────────────────────────────────");
    try {
        const cloudinary = require("cloudinary").v2;
        cloudinary.config({
            cloud_name: config.cloudinary.cloudName,
            api_key: config.cloudinary.apiKey,
            api_secret: config.cloudinary.apiSecret,
        });
        // Ping Cloudinary by checking account info
        const result = await cloudinary.api.ping();
        if (result.status === "ok") {
            pass("Cloudinary API", "Connection OK, credentials valid");
        } else {
            fail("Cloudinary API", "Unexpected response: " + JSON.stringify(result));
        }
    } catch (e) {
        fail("Cloudinary API", e.message);
    }

    // 5. Mapbox API
    console.log("\n── 5. Mapbox ─────────────────────────────────────────────────");
    try {
        const token = config.mapbox.accessToken;
        // Test geocoding API
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/Mumbai.json?limit=1&access_token=${token}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                pass("Mapbox Geocoding", `Found: ${data.features[0].place_name}`);
            } else {
                warn("Mapbox Geocoding", "API OK but no results for test query");
            }
        } else {
            fail("Mapbox Geocoding", `HTTP ${res.status} — token may be invalid`);
        }

        // Test directions API
        const dirUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/72.8777,19.0760;77.1025,28.7041?geometries=geojson&overview=full&access_token=${token}`;
        const dirRes = await fetch(dirUrl);
        if (dirRes.ok) {
            const dirData = await dirRes.json();
            if (dirData.routes && dirData.routes.length > 0) {
                const route = dirData.routes[0];
                pass("Mapbox Directions", `Mumbai→Delhi: ${(route.distance / 1000).toFixed(0)}km, ${(route.duration / 3600).toFixed(1)}hrs`);
            } else {
                warn("Mapbox Directions", "API OK but no routes returned");
            }
        } else {
            fail("Mapbox Directions", `HTTP ${dirRes.status}`);
        }
    } catch (e) {
        fail("Mapbox API", e.message);
    }

    // 6. Upload route check
    console.log("\n── 6. Routes & Security ──────────────────────────────────────");
    try {
        const res = await fetch("http://localhost:5000/api/upload/image", { method: "POST" });
        if (res.status === 401) {
            pass("Upload Route Auth", "Returns 401 for unauthenticated request (protected)");
        } else if (res.status === 404) {
            fail("Upload Route", "Route not found (404) — not registered");
        } else {
            warn("Upload Route Auth", `Unexpected status: ${res.status}`);
        }
    } catch (e) {
        fail("Upload Route", e.message);
    }

    // Check protected routes
    try {
        const endpoints = ["/api/orders", "/api/wallet/balance", "/api/notifications"];
        for (const ep of endpoints) {
            const res = await fetch(`http://localhost:5000${ep}`);
            if (res.status === 401) {
                pass(`Auth Guard ${ep}`, "Protected (401)");
            } else {
                warn(`Auth Guard ${ep}`, `Status ${res.status} — may not be protected`);
            }
        }
    } catch (e) {
        fail("Auth Guard Check", e.message);
    }

    // 7. Ngrok webhook connectivity
    console.log("\n── 7. Ngrok Webhook ──────────────────────────────────────────");
    try {
        const tunnelRes = await fetch("http://localhost:4040/api/tunnels");
        const tunnelData = await tunnelRes.json();
        const tunnel = tunnelData.tunnels?.[0];
        if (tunnel) {
            pass("Ngrok Tunnel", `Active at ${tunnel.public_url}`);

            // Test webhook reachability via ngrok
            const webhookUrl = `${tunnel.public_url}/api/payments/webhook`;
            const webhookRes = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event: "test", payload: {} }),
            });
            if (webhookRes.status === 200 || webhookRes.status === 400) {
                pass("Webhook Reachable", `${webhookUrl} responds (${webhookRes.status})`);
            } else {
                warn("Webhook Reachable", `Status ${webhookRes.status}`);
            }
        } else {
            warn("Ngrok Tunnel", "No active tunnels found");
        }
    } catch (e) {
        warn("Ngrok Status", e.message);
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("  VERIFICATION SUMMARY");
    console.log("═══════════════════════════════════════════════════════════════");
    const total = Object.keys(results).length;
    const passed = Object.values(results).filter(r => r.status.includes("PASS")).length;
    const failed = Object.values(results).filter(r => r.status.includes("FAIL")).length;
    const warned = Object.values(results).filter(r => r.status.includes("WARN")).length;
    console.log(`\n  Total: ${total} | ✅ Pass: ${passed} | ❌ Fail: ${failed} | ⚠️ Warn: ${warned}\n`);

    if (failed > 0) {
        console.log("  FAILURES:");
        Object.entries(results).filter(([, r]) => r.status.includes("FAIL")).forEach(([name, r]) => {
            console.log(`    ❌ ${name}: ${r.detail}`);
        });
    }

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error("Verification script error:", err); process.exit(1); });
