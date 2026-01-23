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
            console.log('🔧 Creating link token for user:', userId, '| PLAID_ENV:', process.env.PLAID_ENV);

            const response = await client.linkTokenCreate({
                user: { client_user_id: userId || 'test_user' },
                client_name: 'IndusWealth',
                products: ['transactions', 'balance'],
                country_codes: ['CA'],
                language: 'en',
            });

            console.log('✅ Link token created successfully');
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

            const response = await client.linkTokenCreate({
                user: { client_user_id: userId || 'test_user' },
                client_name: 'IndusWealth',
                access_token: accessToken, // This triggers update mode
                country_codes: ['CA'],
                language: 'en',
                // For update mode, products inference is usually automatic based on the item, 
                // but we can try to request it if not present. However, Plaid often ignores products in update mode 
                // if they weren't in the original item. The USER MUST create a NEW link (disconnect/connect) 
                // to fundamentally change products if update mode fails to add them.
            });

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

    async getTransactions(accessToken, forceRefresh = false) {
        console.log(`🔍 [Plaid] getTransactions called with forceRefresh=${forceRefresh}`);
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
            // If forced refresh is requested, explicitly tell Plaid to sync with the bank
            if (forceRefresh) {
                try {
                    console.log('🔄 [Plaid] Force refresh requested - dispatching transactions/refresh');
                    await client.transactionsRefresh({ access_token: accessToken });
                    console.log('✅ [Plaid] transactions/refresh successful');
                } catch (refreshError) {
                    const errCode = refreshError.response?.data?.error_code || refreshError.message;
                    console.warn(`⚠️ [Plaid] transactions/refresh failed: ${errCode}`);

                    // Fallback: Try fetching real-time balances to trigger a sync
                    try {
                        console.log('🔄 [Plaid] Fallback: Fetching real-time balances to trigger sync...');
                        await client.accountsBalanceGet({ access_token: accessToken });
                        console.log('✅ [Plaid] Fallback balance check successful - this often triggers a transaction sync');
                    } catch (balanceError) {
                        const balanceErrCode = balanceError.response?.data?.error_code || balanceError.message;
                        console.warn(`⚠️ [Plaid] Fallback balance check also failed: ${balanceErrCode}`);
                    }
                }
            }

            // Fetch data for the last 30 days
            // extend endDate to tomorrow to ensure we capture all transactions from "today" 
            // regardless of server timezone (UTC) vs user timezone (EST/PST)
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const endDate = tomorrow.toISOString().slice(0, 10);
            const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            console.log(`   📅 [Plaid] Querying transactions from ${startDate} to ${endDate}`);

            const response = await client.transactionsGet({
                access_token: accessToken,
                start_date: startDate,
                end_date: endDate,
                options: {
                    count: 500
                }
            });

            const transactions = response.data.transactions;

            // Log the date range of returned transactions
            if (transactions.length > 0) {
                const dates = transactions.map(t => t.date).sort();
                const pendingCount = transactions.filter(t => t.pending).length;
                const postedCount = transactions.length - pendingCount;

                // Determine latest transaction for debugging
                const sortedByDate = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
                const latestTx = sortedByDate[0];

                console.log(`   📊 [Plaid] Returned ${transactions.length} transactions (Posted: ${postedCount}, Pending: ${pendingCount})`);
                console.log(`   📊 [Plaid] Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
                console.log(`   🧐 [Plaid] LATEST Transaction: ${latestTx.date} - ${latestTx.name} ($${latestTx.amount}) [Pending: ${latestTx.pending}]`);
            } else {
                console.log(`   📊 [Plaid] Returned 0 transactions`);
            }

            return transactions;
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
