const express = require('express');
const path = require('path');
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

// Security headers — enhanced helmet config
app.use(helmet({
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
        },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS — restrict origins in production via CORS_ORIGINS env var.
// Falls back to allow-all in development for mobile + web testing.
const corsOptions = {
    origin: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
};
app.use(cors(corsOptions));

// Body parser — captures raw body for Plaid webhook signature verification
app.use(express.json({
    limit: '10kb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Request ID middleware - must be early in chain
app.use(requestIdMiddleware);

// Request logging middleware
app.use((req, res, next) => {
    logger.info('Request received', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        auth: req.headers.authorization ? 'Bearer ***' : undefined,
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

// Health check — before rate limiting and HTTPS redirect so Render health checks work
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// HTTPS redirect in production (after health check, so Render's internal checker isn't redirected)
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// Public static pages (Privacy Policy, Terms) — served at clean URLs: /privacy, /terms.
// Placed before the rate limiter so public/legal pages and crawlers aren't throttled.
// __dirname is packages/backend/src, so ../public → packages/backend/public.
app.use(express.static(path.join(__dirname, '../public'), {
    extensions: ['html'],
    maxAge: '1h',
}));

// Apply rate limiting
app.use(apiLimiter);
app.use('/users/login', authLimiter);
app.use('/users/signup', authLimiter);
app.use('/users/forgot-password', authLimiter);
app.use('/users/reset-password', authLimiter);
app.use('/users/verify-email', authLimiter);
app.use('/users/resend-verification', authLimiter);

// API Routes
app.use('/transactions', transactionsRoutes);
app.use('/flags', require('./routes/flags'));
app.use('/plaid/webhook', require('./routes/plaidWebhook')); // must be before /plaid
app.use('/plaid', require('./routes/plaid'));
app.use('/debt', require('./routes/debt'));
app.use('/accounts', require('./routes/accounts'));
app.use('/watchdog', require('./routes/watchdog'));
app.use('/users', require('./routes/users'));
app.use('/analytics', require('./routes/analytics'));
app.use('/insights', require('./routes/insights'));
app.use('/educational', require('./routes/educational'));
app.use('/etfs', require('./routes/etfs'));
app.use('/goals', require('./routes/goals'));

// Sync curated articles on startup (non-blocking), then check a batch of links.
// The verifier runs after the sync so freshly-inserted rows are eligible, and is
// bounded per boot — it drains the catalog over several restarts rather than
// firing dozens of requests at publishers every time the dyno wakes up.
const { syncCuratedArticles } = require('./services/educational_content');
const { verifyArticleLinks } = require('./services/link_health');
syncCuratedArticles()
    .then(() => {
        if (process.env.LINK_HEALTH_CHECK_ENABLED === 'false') return null;
        return verifyArticleLinks();
    })
    .catch(err => console.error('Curated article sync / link check failed on startup:', err));
app.use('/2fa', require('./routes/twoFactor'));
app.use('/feedback', require('./routes/feedback'));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'IndusWealth Backend Running',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
    });
});

// Security.txt (RFC 9116) — security contact disclosure
app.get('/.well-known/security.txt', (req, res) => {
    res.type('text/plain').send(
        `Contact: mailto:security@induswealth.app\n` +
        `Preferred-Languages: en\n` +
        `Canonical: https://induswealth.app/.well-known/security.txt\n` +
        `Expires: 2027-04-15T00:00:00.000Z\n`
    );
});

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(globalErrorHandler);

module.exports = app;
