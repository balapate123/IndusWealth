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
        // 1. Create a Sandbox Public Token directly (Simulation)
        // using 'user_transactions_dynamic' institution 'ins_43' (Canadian test bank often used, or use ins_109512 for TD/RBC specific if needed, but 'ins_1' is mostly US. 
        // For Canada check specific institution_id. 'ins_43' is "Platypus OAuth", 'ins_109508' is "First Platypus Bank (CA)".
        // Let's use 'ins_109508' for Canada or 'ins_109511' (RBC).
        // Actually, simply using standard sandbox institution 'ins_109508' and initial_products ['transactions']

        // Create public token for 'user_transactions_dynamic'
        const publicTokenRes = await client.sandboxPublicTokenCreate({
            institution_id: 'ins_109508', // First Platypus Bank (Canada)
            initial_products: ['transactions'],
            options: {
                override_username: 'user_transactions_dynamic',
                override_password: 'pass_good'
            }
        });

        const publicToken = publicTokenRes.data.public_token;
        console.log('Public Token:', publicToken);

        // 2. Exchange for Access Token
        const exchangeRes = await client.itemPublicTokenExchange({
            public_token: publicToken,
        });

        const accessToken = exchangeRes.data.access_token;
        console.log('ACCESS_TOKEN:', accessToken);

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

getAccessToken();
