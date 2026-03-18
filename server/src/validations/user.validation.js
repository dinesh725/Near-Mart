const Joi = require('joi');

const updateProfile = {
  body: Joi.object().keys({
    name: Joi.string().trim().optional(),
    phone: Joi.string().trim().optional(),
    address: Joi.string().trim().optional(),
    storeName: Joi.string().trim().optional(),
    storeId: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    payoutAccount: Joi.object().optional(),
    businessHours: Joi.object().optional(),
    companyName: Joi.string().trim().optional(),
    supplierId: Joi.string().trim().optional(),
    paymentTerms: Joi.string().trim().optional(),
    vehicleType: Joi.string().trim().optional(),
    vehicleNo: Joi.string().trim().optional(),
    department: Joi.string().trim().optional(),
    shift: Joi.string().trim().optional(),
    kycDocuments: Joi.array().items(Joi.object()).optional(),
    kycSubmittedAt: Joi.date().iso().optional(),
    // User-editable profile fields
    avatar: Joi.string().optional(),
    storeDescription: Joi.string().max(500).optional(),
    isOnline: Joi.boolean().optional(),
    deliveryRadius: Joi.number().min(1).max(100).optional(),
    serviceRadius: Joi.number().min(100).max(50000).optional(),
  }).unknown(false), // Rejects unauthorized fields (kycStatus, role, etc.)
};

module.exports = {
  updateProfile,
};
