const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { Unauthorized, Forbidden } = require("../utils/errors");

/**
 * Verify JWT access token and attach user to req.
 */
const authenticate = async (req, res, next) => {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer "))
            throw new Unauthorized("No token provided");

        const token = header.split(" ")[1];
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id);

        if (!user) throw new Unauthorized("User not found");

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError")
            return next(new Unauthorized("Token expired"));
        if (err.name === "JsonWebTokenError")
            return next(new Unauthorized("Invalid token"));
        next(err);
    }
};

/**
 * Role-based access. Usage: authorize("seller", "admin")
 */
const authorize = (...roles) => (req, res, next) => {
    if (!req.user) return next(new Unauthorized());
    if (!roles.includes(req.user.role))
        return next(new Forbidden(`Role '${req.user.role}' not allowed`));
    next();
};

/**
 * Require account verification (Email, Phone, or Google).
 */
const requireVerification = (req, res, next) => {
    if (!req.user) return next(new Unauthorized());

    // Google logins set emailVerified to true automatically
    if (!req.user.emailVerified && !req.user.phoneVerified) {
        return next(new Forbidden("Account verification required. Please verify your email or phone number to continue."));
    }
    next();
};

/**
 * Generate token pair
 */
const generateTokens = (userId) => {
    const accessToken = jwt.sign({ id: userId }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
    });
    const refreshToken = jwt.sign({ id: userId }, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn,
    });
    return { accessToken, refreshToken };
};

module.exports = { authenticate, authorize, requireVerification, generateTokens };
