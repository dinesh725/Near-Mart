const Joi = require('joi');
const { BadRequest } = require("../utils/errors");

const validateJoi = (schema) => (req, res, next) => {
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
        const errorMessage = error.details.map((details) => details.message).join(', ');
        return next(new BadRequest(errorMessage));
    }

    Object.assign(req, value);
    return next();
};

module.exports = validateJoi;
