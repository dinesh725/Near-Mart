/**
 * Seed script — Populates MongoDB with NearMart demo data.
 * Run: cd server && node seed.js
 *
 * SAFETY: This script CANNOT run in production.
 */
require("dotenv").config();

// ── Production guard ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
    console.error("🚫 FATAL: Seed script cannot run in production environment.");
    console.error("   Set NODE_ENV=development to run this script.");
    process.exit(1);
}

const mongoose = require("mongoose");
const User = require("./src/models/User");
const Product = require("./src/models/Product");
const Notification = require("./src/models/Notification");
const config = require("./src/config");

const DEMO_USERS = [
    { name: "Priya Sharma", email: "demo.customer@nearmart.in", password: "demo123", role: "customer", avatar: "PS", address: "12, Linking Road, Bandra West, Mumbai", walletBalance: 2500, loyaltyPoints: 420, totalOrders: 8, emailVerified: true, phoneVerified: true },
    { name: "Raj Patel", email: "demo.seller@nearmart.in", password: "demo123", role: "seller", avatar: "RP", storeId: "STORE-412", storeName: "Dark Store #412", emailVerified: true, phoneVerified: true },
    { name: "Global Foods Ltd", email: "demo.vendor@nearmart.in", password: "demo123", role: "vendor", avatar: "GF", supplierId: "SUP-001", companyName: "Global Foods Ltd", emailVerified: true, phoneVerified: true },
    { name: "Vikram Singh", email: "demo.delivery@nearmart.in", password: "demo123", role: "delivery", avatar: "VS", vehicleType: "bike", vehicleNo: "MH-04-AB-1234", rating: 4.8, emailVerified: true, phoneVerified: true },
    { name: "Meera Joshi", email: "demo.support@nearmart.in", password: "demo123", role: "support", avatar: "MJ", department: "Customer Support", emailVerified: true, phoneVerified: true },
    { name: "Super Admin", email: "dineshkhatua672@gmail.com", password: "Dinesh@123", role: "super_admin", avatar: "DK", accessLevel: "super", emailVerified: true, phoneVerified: true },
];

const DEMO_PRODUCTS = [
    { name: "Tomatoes (Grade A)", category: "Fresh Produce", emoji: "🍅", sellingPrice: 45, costPrice: 28, mrp: 55, stock: 42, unit: "kg", gstRate: 0, demandTrend: "rising", weekSales: [30, 35, 42, 38, 44, 50, 48] },
    { name: "Farm Fresh Milk 1L", category: "Dairy", emoji: "🥛", sellingPrice: 62, costPrice: 48, mrp: 68, stock: 120, unit: "pcs", gstRate: 0, demandTrend: "stable", weekSales: [80, 85, 78, 90, 88, 92, 95] },
    { name: "Spinach (Fresh Bunch)", category: "Fresh Produce", emoji: "🥬", sellingPrice: 35, costPrice: 18, mrp: 45, stock: 0, unit: "kg", gstRate: 0, demandTrend: "falling" },
    { name: "Brown Rice 25kg", category: "Grains", emoji: "🌾", sellingPrice: 2200, costPrice: 1800, mrp: 2500, stock: 15, unit: "bag", gstRate: 5, demandTrend: "stable" },
    { name: "Amul Butter 500g", category: "Dairy", emoji: "🧈", sellingPrice: 285, costPrice: 240, mrp: 310, stock: 65, unit: "pcs", gstRate: 12, demandTrend: "rising" },
    { name: "Red Onions", category: "Fresh Produce", emoji: "🧅", sellingPrice: 32, costPrice: 20, mrp: 40, stock: 200, unit: "kg", gstRate: 0, demandTrend: "stable" },
    { name: "Multigrain Bread", category: "Bakery", emoji: "🍞", sellingPrice: 55, costPrice: 35, mrp: 65, stock: 40, unit: "pcs", gstRate: 0, demandTrend: "rising" },
    { name: "Greek Yogurt 400g", category: "Dairy", emoji: "🥣", sellingPrice: 120, costPrice: 85, mrp: 145, stock: 50, unit: "pcs", gstRate: 12, demandTrend: "rising" },
];

const seed = async () => {
    try {
        console.log("🌱 Connecting to MongoDB...");
        await mongoose.connect(config.mongoUri);
        console.log("✅ Connected");

        // Only wipe data in development environments
        if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
            await User.deleteMany({});
            await Product.deleteMany({});
            await Notification.deleteMany({});
            console.log("🗑  Cleared existing data (development mode)");
        } else {
            console.log("⚠  Skipping data wipe (non-production, non-development environment)");
        }

        // Create users
        const users = [];
        for (const u of DEMO_USERS) {
            const user = await User.create(u);
            users.push(user);
        }
        console.log(`👥 Created ${users.length} demo users`);

        // Create products (assign to seller)
        const seller = users.find(u => u.role === "seller");
        const products = await Product.insertMany(
            DEMO_PRODUCTS.map(p => ({ ...p, sellerId: seller._id }))
        );
        console.log(`📦 Created ${products.length} demo products`);

        // Welcome notifications
        await Notification.insertMany([
            { forRole: "customer", type: "info", msg: "Welcome to NearMart! Browse fresh groceries near you." },
            { forRole: "seller", type: "info", msg: "Your Dark Store #412 is ready for orders." },
            { forRole: "delivery", type: "info", msg: "Welcome aboard, partner! Deliveries are waiting." },
            { forRole: "super_admin", type: "info", msg: "NearMart backend is live. All systems operational." },
        ]);
        console.log("🔔 Created welcome notifications");

        console.log("\n🎉 Seed complete! Demo credentials:");
        console.log("   All demo users use password: demo123");
        console.log("   Super Admin: demo.admin@nearmart.in / demo123");
        console.log("   Example: demo.customer@nearmart.in / demo123");

        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error("❌ Seed failed:", err.message);
        process.exit(1);
    }
};

seed();
