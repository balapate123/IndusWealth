/**
 * Global error handler middleware
 * Provides consistent error responses and logging
 */

const { createLogger } = require('../services/logger');
const { AppError } = require('../errors/AppError');

const logger = createLogger('ERROR_HANDLER');

/**
 * Global error handling middleware
 * Must be registered after all routes
 */
const globalErrorHandler = (err, req, res, next) => {
    // Build request context for logging
    const requestContext = {
        requestId: req.requestId,
        userId: req.user?.id,
        endpoint: `${req.method} ${req.originalUrl}`,
        params: req.params,
        query: req.query,
        ip: req.ip
    };

    // Determine error details
    const statusCode = err.statusCode || 500;
    const errorCode = err.code || 'INTERNAL_ERROR';

    // Log the full error with context
    logger.error('Request failed', {
        ...requestContext,
        statusCode,
        errorCode,
        error: err
    });

    // Operational errors (expected) - safe to send details to client
    if (err instanceof AppError && err.isOperational) {
        return res.status(statusCode).json({
            success: false,
            code: errorCode,
            message: err.message,
            details: process.env.NODE_ENV === 'development' ? err.details : undefined,
            requestId: req.requestId
        });
    }

    // Programming or unknown errors - don't leak details in production
    const isProduction = process.env.NODE_ENV === 'production';

    return res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: isProduction
            ? 'An unexpected error occurred. Please try again later.'
            : err.message,
        stack: isProduction ? undefined : err.stack,
        requestId: req.requestId
    });
};

/**
 * 404 Not Found handler
 * Should be registered after all routes but before error handler
 */
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        requestId: req.requestId
    });
};

module.exports = { globalErrorHandler, notFoundHandler };
