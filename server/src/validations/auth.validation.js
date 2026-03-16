const Joi = require('joi');

const PUBLIC_ROLES = ["customer", "seller", "vendor", "delivery"];

const register = {
  body: Joi.object().keys({
    name: Joi.string().trim().required().messages({"any.required": "Name is required"}),
    email: Joi.string().trim().email().required().messages({"string.email": "Valid email required"}),
    password: Joi.string().min(6).required().messages({"string.min": "Min 6 characters"}),
    role: Joi.string().valid(...PUBLIC_ROLES).default("customer").messages({"any.only": "Invalid role"}),
  }).unknown(false),
};

const acceptInvite = {
  body: Joi.object().keys({
    token: Joi.string().trim().required().messages({"any.required": "Invite token required"}),
    name: Joi.string().trim().required().messages({"any.required": "Name is required"}),
    password: Joi.string().min(6).required().messages({"string.min": "Min 6 characters"}),
  }).unknown(false),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().trim().email().required().messages({"string.email": "Valid email required"}),
    password: Joi.string().required().messages({"any.required": "Password required"}),
  }).unknown(false),
};

const mfaVerify = {
  body: Joi.object().keys({
    token: Joi.string().trim().required().messages({"any.required": "TOTP token required"}),
  }).unknown(false),
};

const location = {
  body: Joi.object().keys({
    lat: Joi.number().required().messages({"any.required": "lat required"}),
    lng: Joi.number().required().messages({"any.required": "lng required"}),
    address: Joi.string().allow("").optional(),
  }).unknown(false),
};

const google = {
  body: Joi.object().keys({
    token: Joi.string().required().messages({"any.required": "Google ID token required"}),
    role: Joi.string().valid(...PUBLIC_ROLES).default("customer").messages({"any.only": "Invalid role"}),
  }).unknown(false),
};

const linkPhone = {
  body: Joi.object().keys({
    phone: Joi.string().trim().required().messages({"any.required": "Phone required"}),
    otp: Joi.string().trim().length(6).required().messages({"string.length": "6-digit OTP required"}),
  }).unknown(false),
};

const sendOtp = {
  body: Joi.object().keys({
    phone: Joi.string().trim().pattern(/^\+?[0-9]{10,15}$/).required().messages({"string.pattern.base": "Invalid phone number", "any.required": "Phone number required"}),
  }).unknown(false),
};

const fcmToken = {
  body: Joi.object().keys({
    fcmToken: Joi.string().trim().required().messages({"any.required": "FCM token required"}),
  }).unknown(false),
};

const forgotPassword = {
  body: Joi.object().keys({
    identifier: Joi.string().trim().required().messages({"any.required": "Email or Phone required"}),
  }).unknown(false),
};

const changePassword = {
  body: Joi.object().keys({
    oldPassword: Joi.string().required().messages({"any.required": "Current password required"}),
    newPassword: Joi.string().min(6).required().messages({"string.min": "New password must be at least 6 characters"}),
  }).unknown(false),
};
const verifyOtp = {
  body: Joi.object().keys({
    phone: Joi.string().trim().required().messages({"any.required": "Phone required"}),
    otp: Joi.string().trim().length(6).required().messages({"string.length": "6-digit OTP required"}),
    name: Joi.string().trim().optional(),
    role: Joi.string().valid("customer", "seller", "vendor", "delivery").optional(),
  }).unknown(false),
};


module.exports = {
  register,
  acceptInvite,
  login,
  mfaVerify,
  location,
  google,
  linkPhone,
  sendOtp,
  verifyOtp,
  fcmToken,
  forgotPassword,
  changePassword,
};
