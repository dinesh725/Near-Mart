const Joi = require('joi');

const addMoney = {
  body: Joi.object().keys({
    amount: Joi.number().min(10).max(50000).required()
      .messages({ "number.min": "Amount must be at least ₹10", "number.max": "Maximum ₹50,000" }),
  }).unknown(false),
};

const verifyTopup = {
  body: Joi.object().keys({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
  }).unknown(false),
};

const transactions = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(50).optional(),
  }).unknown(false),
};

module.exports = { addMoney, verifyTopup, transactions };
