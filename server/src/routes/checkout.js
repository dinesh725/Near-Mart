const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const idempotencyGuard = require("../middleware/idempotency");
const { createPaymentIntent } = require("../services/paymentGateway");
const { authorize, authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { BadRequest } = require("../utils/errors");

// Single checkout route guarded by Redis SetNX idempotency
router.post("/", 
    authenticate, 
    authorize("customer"), 
    idempotencyGuard,
    require("../middleware/validateJoi")(require("joi").object({
        items: require("joi").array().items(require("joi").object({
            productId: require("joi").string().required(),
            qty: require("joi").number().integer().min(1).required()
        }).unknown(true)).min(1).required().messages({ "array.min": "At least one item required" }),
        address: require("joi").string().trim().required().messages({ "any.required": "Address is required", "string.empty": "Address is required" })
    }).unknown(true)),
    async (req, res, next) => {
        try {
            const { items, address } = req.body;
            let grandSubtotal = 0;
            const validItems = [];

            // 1. Calculate Exact Total strictly on backend and verify stock
            for (const item of items) {
                const product = await Product.findById(item.productId);
                if (!product) throw new BadRequest(`Product ${item.productId} not found`);
                
                // Real-time stock reservation Phase-6
                if (product.stock < item.qty) {
                    throw new BadRequest(`Insufficient stock for ${product.name} (available: ${product.stock})`);
                }

                // Verify exact pricing on backend logic
                const itemTotal = product.sellingPrice * item.qty;
                grandSubtotal += itemTotal;

                validItems.push({
                    productId: product._id,
                    name: product.name,
                    qty: item.qty,
                    price: product.sellingPrice,
                    imageUrl: product.imageUrl || "",
                    emoji: product.emoji || "📦",
                    sellerId: product.sellerId || null
                });
                
                // Temporarily reserve stock for checkout (expires in cron worker if not paid)
                // Note: For Phase 6B, decrements actual stock. 
                product.stock -= item.qty;
                await product.save();
            }

            // Pseudo-calculations for Delivery / Platform Fees
            const DELIVERY_FEE = 30; // ₹30 delivery baseline
            const PLATFORM_FEE = 10; // ₹10 handling
            const totalAmount = grandSubtotal + DELIVERY_FEE + PLATFORM_FEE; 
            
            // 2. Create Order skeleton linked to gateway
            const order = new Order({
                customerId: req.user._id,
                customerName: req.user.name,
                customerPhone: req.user.phone || "N/A",
                items: validItems,
                subtotal: grandSubtotal,
                deliveryFee: DELIVERY_FEE,
                platformFee: PLATFORM_FEE,
                total: totalAmount,
                deliveryAddress: {
                    address: address,
                    location: {
                        lat: req.body.lat || 0,
                        lng: req.body.lng || 0
                    }
                },
                // Crucial Phase 6 locks
                status: "PENDING_PAYMENT",
                paymentStatus: "PENDING_PAYMENT", 
                paymentMethod: req.body.paymentMethod || "gateway"
            });
            
            // 3. Generate Gateway Intent
            // Stripe/Razorpay require base units (Paisa/Cents) -> ₹100 = 10000 paise
            const totalInPaise = Math.round(totalAmount * 100);
            
            // For Cash on delivery, skip intent generation
            if (order.paymentMethod === "Cash") {
                order.paymentStatus = "PENDING_PAYMENT"; // Handled on delivery
                order.status = "CONFIRMED"; // Skips holding loop
                await order.save();
                return res.json({ ok: true, isCash: true, orderId: order._id });
            }

            const gatewayRes = await createPaymentIntent(totalInPaise, 'inr', order._id, req.user._id);
            
            if (!gatewayRes.ok) {
                // Return stock on intent failure directly
                for (const item of items) {
                    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.qty } });
                }
                throw new BadRequest(`Gateway unavailable: ${gatewayRes.error}`);
            }

            // 4. Update and Commit Order
            order.gatewayPaymentId = gatewayRes.id;
            await order.save();

            // 5. Return secret to React client (Stripe Element mount)
            return res.json({ 
                ok: true, 
                client_secret: gatewayRes.client_secret, 
                orderId: order._id 
            });
            
        } catch (error) { next(error); }
});

module.exports = router;
