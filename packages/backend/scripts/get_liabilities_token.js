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

async function getAccessToken() {
    try {
        // Create Sandbox Public Token for 'user_good' which has Liabilites
        // 'ins_1' is typically useful for liabilities in US, but for Canada sandbox:
        // We should use 'ins_109508' (First Platypus) or general test.
        // 'user_good' is standard Plaid test user.

        console.log('Creating Public Token for user_good...');
        const publicTokenRes = await client.sandboxPublicTokenCreate({
            institution_id: 'ins_109508',
            initial_products: ['transactions', 'liabilities'], // Request Liabilities
            options: {
                override_username: 'user_good',
                override_password: 'pass_good'
            }
        });

        const publicToken = publicTokenRes.data.public_token;
        console.log('Public Token:', publicToken);

        // Exchange
        const exchangeRes = await client.itemPublicTokenExchange({
            public_token: publicToken,
        });

        const accessToken = exchangeRes.data.access_token;
        console.log('ACCESS_TOKEN_LIABILITIES:', accessToken);

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

getAccessToken();
