const Joi = require('joi');

const cancelOrder = {
  body: Joi.object().keys({
    reason: Joi.string().trim().required().messages({"any.required": "Cancellation reason required"}),
  }).unknown(false),
};

module.exports = {
  cancelOrder,
};
