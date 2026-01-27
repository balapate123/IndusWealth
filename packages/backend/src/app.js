const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import logging and error handling
const { createLogger } = require('./services/logger');
const { requestIdMiddleware } = require('./middleware/requestId');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');

const logger = createLogger('HTTP');

// Import routes
const transactionsRoutes = require('./routes/transactions');

const app = express();

// Trust proxy - required for Render.com and other reverse proxies
// This allows express-rate-limit to correctly identify users via X-Forwarded-For header
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS
app.use(cors());
app.use(express.json());

// Request ID middleware - must be early in chain
app.use(requestIdMiddleware);

// Request logging middleware
app.use((req, res, next) => {
    logger.info('Request received', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent']
    });

    // Log response on finish
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

        logger[logLevel]('Request completed', {
            requestId: req.requestId,
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration}ms`
        });
    });

    next();
});

// General API rate limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { success: false, code: 'RATE_LIMIT_ERROR', message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 min
    message: { success: false, code: 'RATE_LIMIT_ERROR', message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting
app.use(apiLimiter);
app.use('/users/login', authLimiter);
app.use('/users/signup', authLimiter);

// API Routes
app.use('/transactions', transactionsRoutes);
app.use('/plaid', require('./routes/plaid'));
app.use('/debt', require('./routes/debt'));
app.use('/accounts', require('./routes/accounts'));
app.use('/watchdog', require('./routes/watchdog'));
app.use('/users', require('./routes/users'));
app.use('/analytics', require('./routes/analytics'));
app.use('/insights', require('./routes/insights'));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'IndusWealth Backend Running',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
    });
});

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(globalErrorHandler);

module.exports = app;
