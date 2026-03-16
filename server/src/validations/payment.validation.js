const Joi = require('joi');

const checkout = {
  body: Joi.object().keys({
    items: Joi.array().items(
      Joi.object().keys({
        productId: Joi.string().required(),
        qty: Joi.number().integer().min(1).required(),
        selectedVariant: Joi.object().optional(),
      }).unknown(false)
    ).min(1).required().messages({ "array.min": "At least one item required" }),
    address: Joi.string().trim().required().messages({ "any.required": "Address is required" }),
    paymentMethod: Joi.string().valid("wallet", "razorpay", "hybrid").required().messages({ "any.only": "Invalid payment method" }),
  }).unknown(false),
};

const verify = {
  body: Joi.object().keys({
    razorpay_order_id: Joi.string().required().messages({ "any.required": "Razorpay order ID required" }),
    razorpay_payment_id: Joi.string().required().messages({ "any.required": "Razorpay payment ID required" }),
    razorpay_signature: Joi.string().required().messages({ "any.required": "Razorpay signature required" }),
  }).unknown(false),
};

module.exports = {
  checkout,
  verify,
};
