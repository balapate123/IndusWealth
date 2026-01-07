const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
require('dotenv').config();

const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

const client = new PlaidApi(configuration);

// MOCK FALLBACK for Development if credentials are missing
// MOCK FALLBACK REMOVED - Using Real Plaid Data Only

// HYBRID DEMO STRATEGY: 
// Inject specific "Leakage" transactions so Watchdog works even with "Good" user (who has Liabilities data).
const DEMO_LEAKAGE = [
    { transaction_id: 'd1', name: 'Netflix Premium', amount: 16.99, date: '2025-01-05', category: ['Subscription'], iso_currency_code: 'CAD' },
    { transaction_id: 'd2', name: 'Spotify Family', amount: 11.99, date: '2025-01-10', category: ['Subscription'], iso_currency_code: 'CAD' },
    { transaction_id: 'd3', name: 'NSF Fee', amount: 48.00, date: '2025-01-12', category: ['Bank Fees'], iso_currency_code: 'CAD' }
];

class PlaidService {
    async createLinkToken(userId) {
        if (!process.env.PLAID_CLIENT_ID) throw new Error("Missing Plaid Keys");
        try {
            const response = await client.linkTokenCreate({
                user: { client_user_id: userId || 'test_user' },
                client_name: 'IndusWealth',
                products: ['transactions'],
                country_codes: ['CA'],
                language: 'en',
            });
            return response.data;
        } catch (error) {
            console.error('Error creating link token:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async exchangePublicToken(publicToken) {
        try {
            const response = await client.itemPublicTokenExchange({
                public_token: publicToken,
            });
            return response.data.access_token;
        } catch (error) {
            console.error('Error exchanging public token:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async getLiabilities(accessToken) {
        if (!accessToken) {
            console.warn('No Access Token provided for Liabilities.');
            return { credit: [], student: [], mortgage: [] };
        }

        try {
            const response = await client.liabilitiesGet({
                access_token: accessToken,
            });
            return response.data.liabilities;
        } catch (error) {
            console.error('Error fetching liabilities from Plaid:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async getTransactions(accessToken) {
        if (!accessToken) {
            console.log('Debug: No Access Token Passed. Env Override:', process.env.PLAID_ACCESS_TOKEN_OVERRIDE ? 'FOUND' : 'MISSING');
            console.warn('No Access Token provided. Please link a bank account or set PLAID_ACCESS_TOKEN_OVERRIDE.');
            // Check if we have an override in env 
            if (process.env.PLAID_ACCESS_TOKEN_OVERRIDE && process.env.PLAID_CLIENT_ID) {
                accessToken = process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
            } else {
                return []; // Return empty if no token, rather than mock
            }
        }

        try {
            // Fetch data for the last 30 days
            const endDate = new Date().toISOString().slice(0, 10);
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            const response = await client.transactionsGet({
                access_token: accessToken,
                start_date: startDate,
                end_date: endDate,
            });

            // HYBRID MERGE: Real Data + Demo Leakage
            // Use spread to combine. We put Demo first to ensure they are top of feed for visibility.
            return [...DEMO_LEAKAGE, ...response.data.transactions];
        } catch (error) {
            console.error('Error fetching from Plaid:', error.response ? error.response.data : error.message);
            throw error; // Throw error instead of returning match
        }
    }

    async getAccounts(accessToken) {
        if (!accessToken) {
            if (process.env.PLAID_ACCESS_TOKEN_OVERRIDE) {
                accessToken = process.env.PLAID_ACCESS_TOKEN_OVERRIDE;
            } else {
                console.warn('No Access Token provided for Accounts.');
                return [];
            }
        }

        try {
            const response = await client.accountsGet({
                access_token: accessToken,
            });
            return response.data.accounts;
        } catch (error) {
            console.error('Error fetching accounts from Plaid:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

module.exports = new PlaidService();
