const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const transactionsRoutes = require('./routes/transactions');

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors());
app.use(express.json());

// General API rate limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 min
    message: { success: false, message: 'Too many login attempts, please try again later.' },
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

app.get('/', (req, res) => {
    res.send('IndusWealth Backend Running');
});

module.exports = app;
