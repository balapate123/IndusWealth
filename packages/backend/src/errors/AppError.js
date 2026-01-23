/**
 * Custom error classes for structured error handling
 * All errors extend AppError for consistent handling
 */

class AppError extends Error {
    constructor(message, statusCode, code, details = {}) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true; // Distinguishes from programming errors
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            details: this.details
        };
    }
}

/**
 * 400 Bad Request - Invalid input or validation failures
 */
class ValidationError extends AppError {
    constructor(message, details = {}) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

/**
 * 401 Unauthorized - Authentication failures
 */
class AuthError extends AppError {
    constructor(message, code = 'AUTH_ERROR') {
        super(message, 401, code);
    }
}

/**
 * 404 Not Found - Resource not found
 */
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND', { resource });
    }
}

/**
 * 502 Bad Gateway - External service (Plaid) errors
 */
class PlaidError extends AppError {
    constructor(message, plaidErrorCode, details = {}) {
        super(message, 502, 'PLAID_ERROR', { plaidErrorCode, ...details });
        this.plaidErrorCode = plaidErrorCode;
    }

    /**
     * Create PlaidError from Plaid API response
     * @param {Error} error - Error from Plaid SDK
     * @returns {PlaidError}
     */
    static fromPlaidResponse(error) {
        const errorData = error.response?.data || {};
        const errorCode = errorData.error_code;

        // Map Plaid error codes to user-friendly messages
        const errorMessages = {
            'ITEM_LOGIN_REQUIRED': 'Your bank connection needs to be refreshed. Please re-authenticate.',
            'PRODUCTS_NOT_SUPPORTED': 'This feature is not supported by your bank.',
            'INVALID_ACCESS_TOKEN': 'Bank connection is invalid. Please reconnect your account.',
            'INSTITUTION_DOWN': 'Your bank is temporarily unavailable. Please try again later.',
            'INSTITUTION_NOT_RESPONDING': 'Your bank is not responding. Please try again later.',
            'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment and try again.',
            'INTERNAL_SERVER_ERROR': 'Bank service error. Please try again later.'
        };

        const userMessage = errorMessages[errorCode]
            || errorData.error_message
            || 'Bank connection error. Please try again.';

        return new PlaidError(userMessage, errorCode, {
            originalError: errorData.error_message,
            errorType: errorData.error_type,
            displayMessage: errorData.display_message
        });
    }

    /**
     * Check if this is a login required error
     */
    isLoginRequired() {
        return this.plaidErrorCode === 'ITEM_LOGIN_REQUIRED';
    }
}

/**
 * 500 Internal Server Error - Database errors
 */
class DatabaseError extends AppError {
    constructor(message, originalError = null) {
        super(message, 500, 'DATABASE_ERROR', {
            originalError: originalError?.message
        });
    }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
class RateLimitError extends AppError {
    constructor(message = 'Too many requests. Please try again later.') {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}

module.exports = {
    AppError,
    ValidationError,
    AuthError,
    NotFoundError,
    PlaidError,
    DatabaseError,
    RateLimitError
};
