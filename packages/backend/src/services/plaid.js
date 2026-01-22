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

class PlaidService {
    async createLinkToken(userId) {
        if (!process.env.PLAID_CLIENT_ID) throw new Error("Missing Plaid Keys");
        try {
            console.log('🔧 Creating link token with PLAID_ENV:', process.env.PLAID_ENV);

            const request = {
                user: { client_user_id: userId || 'test_user' },
                client_name: 'IndusWealth',
                products: ['transactions'],
                country_codes: ['CA'],
                language: 'en',
            };

            // Add Android package name for OAuth redirect (required for production)
            if (process.env.PLAID_ENV === 'production' || process.env.PLAID_ENV === 'development') {
                request.android_package_name = 'com.induswealth.app'; // Your Android package name
                console.log('📱 Added Android package name for OAuth');
            }

            const response = await client.linkTokenCreate(request);
            return response.data;
        } catch (error) {
            console.error('Error creating link token:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Create a Link token for update mode (re-authentication)
     * Used when ITEM_LOGIN_REQUIRED error occurs
     * @param {string} userId - User ID
     * @param {string} accessToken - Existing Plaid access token that needs refresh
     */
    async createUpdateLinkToken(userId, accessToken) {
        if (!process.env.PLAID_CLIENT_ID) throw new Error("Missing Plaid Keys");
        if (!accessToken) throw new Error("Access token required for update mode");

        try {
            console.log('🔄 Creating update mode link token for user:', userId);

            const request = {
                user: { client_user_id: userId || 'test_user' },
                client_name: 'IndusWealth',
                access_token: accessToken, // This triggers update mode
                country_codes: ['CA'],
                language: 'en',
            };

            // Add Android package name for OAuth redirect (required for production)
            if (process.env.PLAID_ENV === 'production' || process.env.PLAID_ENV === 'development') {
                request.android_package_name = 'com.induswealth.app';
            }

            const response = await client.linkTokenCreate(request);
            console.log('✅ Update mode link token created');
            return response.data;
        } catch (error) {
            console.error('Error creating update link token:', error.response ? error.response.data : error.message);
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

            return response.data.transactions;
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
