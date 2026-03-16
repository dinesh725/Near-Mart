const Joi = require('joi');

const listProducts = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    category: Joi.string().trim().optional(),
    search: Joi.string().trim().optional(),
  }).unknown(false),
};

const createProduct = {
  body: Joi.object().keys({
    name: Joi.string().trim().required().messages({"any.required": "Name is required"}),
    category: Joi.string().trim().required().messages({"any.required": "Category is required"}),
    sellingPrice: Joi.number().min(0).required().messages({"any.required": "Price must be ≥ 0"}),
    stock: Joi.number().integer().min(0).optional(),
    emoji: Joi.string().trim().optional(),
    description: Joi.string().trim().optional(),
    unit: Joi.string().trim().optional(),
    mrp: Joi.number().min(0).optional(),
    imageUrl: Joi.string().uri().optional(),
    images: Joi.array().items(Joi.string().uri()).max(5).optional(),
    status: Joi.string().valid("active", "inactive").optional(),
    variants: Joi.array().optional(),
  }).unknown(false),
};

const updateStock = {
  body: Joi.object().keys({
    delta: Joi.number().integer().required().messages({"any.required": "Delta must be an integer"}),
  }).unknown(false),
};

const rateProduct = {
  body: Joi.object().keys({
    rating: Joi.number().integer().min(1).max(5).required().messages({"any.required": "Rating must be 1–5"}),
    comment: Joi.string().trim().allow("").max(500).optional(),
  }).unknown(false),
};

const updateImages = {
  body: Joi.object().keys({
    images: Joi.array().items(Joi.string().uri()).max(5).required().messages({
      "array.max": "Up to 5 image URLs allowed",
      "string.uri": "Each image must be a valid URL"
    }),
  }).unknown(false),
};

module.exports = {
  listProducts,
  createProduct,
  updateStock,
  rateProduct,
  updateImages,
};
