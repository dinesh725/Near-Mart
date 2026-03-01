const mongoose = require("mongoose");
const Order = require("./src/models/Order");
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local" });

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected DB");
        const orders = await Order.find({});
        console.log(`Found ${orders.length} orders`);

        let demoCount = 0;
        for (let o of orders) {
            // "demo" orders usually have specific names like "Priya Sharma" or "Customer Demo"
            if (o.customerName === "Priya Sharma" || o.customerName === "Customer Demo" || o.address?.includes("12, Linking Road")) {
                await Order.findByIdAndDelete(o._id);
                demoCount++;
            }
        }
        console.log(`Deleted ${demoCount} demo orders.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
