const mongoose = require("mongoose");

const globalProductSchema = new mongoose.Schema({
    globalProductId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, index: true },
    image: { type: String, default: "" },
    brand: { type: String, default: "" },
});

globalProductSchema.index({ name: "text", category: "text" });

module.exports = mongoose.model("GlobalProduct", globalProductSchema);
