/**
 * Request ID middleware for request correlation and tracking
 * Adds unique request ID to each request for logging and debugging
 */

const crypto = require('crypto');

/**
 * Middleware that assigns a unique request ID to each request
 * - Uses X-Request-ID header if provided by client
 * - Generates UUID if not provided
 * - Adds request ID to response headers for client correlation
 * - Tracks request start time for duration logging
 */
const requestIdMiddleware = (req, res, next) => {
    // Use existing request ID from header or generate new one
    req.requestId = req.headers['x-request-id'] || crypto.randomUUID();

    // Add to response headers for client correlation
    res.setHeader('X-Request-ID', req.requestId);

    // Track request start time for duration calculation
    req.startTime = Date.now();

    next();
};

module.exports = { requestIdMiddleware };
