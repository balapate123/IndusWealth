const express = require('express');
const cors = require('cors');
const transactionsRoutes = require('./routes/transactions');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/transactions', transactionsRoutes);
app.use('/plaid', require('./routes/plaid'));
app.use('/debt', require('./routes/debt'));

app.get('/', (req, res) => {
    res.send('IndusWealth Backend Running');
});

module.exports = app;
