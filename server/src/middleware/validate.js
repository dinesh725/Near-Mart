const { validationResult } = require("express-validator");
const { BadRequest } = require("../utils/errors");

/**
 * Run after express-validator checks.
 * Throws BadRequest with field-level errors if validation fails.
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    const formatted = errors.array().map(e => ({
        field: e.path,
        message: e.msg,
    }));

    return next(new BadRequest(JSON.stringify(formatted)));
};

module.exports = { validate };
