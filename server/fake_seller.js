const mongoose = require('mongoose');
const Product = require('./src/models/Product');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const products = await Product.find().limit(2);
    if (products.length >= 2) {
        products[1].sellerId = new mongoose.Types.ObjectId();
        await products[1].save();
        console.log("Updated product 2 to have a distinct fake sellerId:", products[1].sellerId);
    } else {
        console.log("Not enough products in DB");
    }
    process.exit(0);
}).catch(console.error);
