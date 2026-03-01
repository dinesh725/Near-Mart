class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code || "ERROR";
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequest extends AppError {
    constructor(message = "Bad request") { super(message, 400, "BAD_REQUEST"); }
}
class Unauthorized extends AppError {
    constructor(message = "Unauthorized") { super(message, 401, "UNAUTHORIZED"); }
}
class Forbidden extends AppError {
    constructor(message = "Forbidden") { super(message, 403, "FORBIDDEN"); }
}
class NotFound extends AppError {
    constructor(message = "Not found") { super(message, 404, "NOT_FOUND"); }
}
class Conflict extends AppError {
    constructor(message = "Conflict") { super(message, 409, "CONFLICT"); }
}

module.exports = { AppError, BadRequest, Unauthorized, Forbidden, NotFound, Conflict };
