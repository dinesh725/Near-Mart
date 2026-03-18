const Joi = require('joi');
const { BadRequest } = require("../utils/errors");

const validateJoi = (schema) => (req, res, next) => {
    // Backward compatibility: if a bare Joi schema is passed, treat as body validation
    if (Joi.isSchema(schema)) {
        schema = { body: schema };
    }

    const validSchema = Object.keys(schema).reduce((acc, key) => {
        if (['params', 'query', 'body'].includes(key)) {
            acc[key] = schema[key];
        }
        return acc;
    }, {});

    const object = Object.keys(validSchema).reduce((acc, key) => {
        acc[key] = req[key];
        return acc;
    }, {});

    const { value, error } = Joi.compile(validSchema)
        .prefs({ errors: { label: 'key' }, abortEarly: false })
        .validate(object);

    if (error) {
        const errorMessage = error.details.map(d => d.message).join(', ');
        return next(new BadRequest(errorMessage));
    }

    // ✅ SAFE (no mutation of req.query)
    if (value.query) req.validatedQuery = value.query;
    if (value.body) req.validatedBody = value.body;
    if (value.params) req.validatedParams = value.params;

    return next();
};

module.exports = validateJoi;