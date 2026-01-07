const express = require('express');
const cors = require('cors');
const transactionsRoutes = require('./routes/transactions');

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/transactions', transactionsRoutes);
app.use('/plaid', require('./routes/plaid'));
app.use('/debt', require('./routes/debt'));
app.use('/accounts', require('./routes/accounts'));
app.use('/watchdog', require('./routes/watchdog'));
app.use('/users', require('./routes/users'));

app.get('/', (req, res) => {
    res.send('IndusWealth Backend Running');
});

module.exports = app;
