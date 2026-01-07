const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'induswealth',
    user: process.env.DB_USER || 'induswealth',
    password: process.env.DB_PASSWORD || 'induswealth123',
});

// Test connection on startup
pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch(err => console.error('❌ PostgreSQL connection failed:', err.message));

// ============ USER OPERATIONS ============

const createUser = async (email, passwordHash, name) => {
    const result = await pool.query(
        `INSERT INTO users (email, password_hash, name) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, name, created_at`,
        [email, passwordHash, name]
    );

    // Create sync_log entry for new user
    await pool.query(
        `INSERT INTO sync_log (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [result.rows[0].id]
    );

    return result.rows[0];
};

const getUserByEmail = async (email) => {
    const result = await pool.query(
        `SELECT id, email, password_hash, name, plaid_access_token, plaid_item_id, created_at 
         FROM users WHERE email = $1`,
        [email]
    );
    return result.rows[0];
};

const getUserById = async (userId) => {
    const result = await pool.query(
        `SELECT id, email, name, plaid_access_token, plaid_item_id, created_at 
         FROM users WHERE id = $1`,
        [userId]
    );
    return result.rows[0];
};

const updateUserPlaidToken = async (userId, accessToken, itemId) => {
    await pool.query(
        `UPDATE users SET plaid_access_token = $1, plaid_item_id = $2, updated_at = NOW() 
         WHERE id = $3`,
        [accessToken, itemId, userId]
    );
};

// ============ SYNC LOG OPERATIONS ============

const getLastSyncTime = async (userId, syncType = 'last_transaction_sync') => {
    const result = await pool.query(
        `SELECT ${syncType} FROM sync_log WHERE user_id = $1`,
        [userId]
    );
    return result.rows[0]?.[syncType] || null;
};

const updateSyncTime = async (userId, syncType = 'last_transaction_sync') => {
    await pool.query(
        `INSERT INTO sync_log (user_id, ${syncType}, updated_at) 
         VALUES ($1, NOW(), NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET ${syncType} = NOW(), updated_at = NOW()`,
        [userId]
    );
};

const shouldSync = async (userId, syncType = 'last_transaction_sync', maxAgeHours = 24) => {
    const lastSync = await getLastSyncTime(userId, syncType);
    if (!lastSync) return true; // Never synced

    const hoursSinceSync = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
    return hoursSinceSync >= maxAgeHours;
};

// ============ ACCOUNT OPERATIONS ============

const upsertAccounts = async (userId, accounts) => {
    for (const account of accounts) {
        await pool.query(
            `INSERT INTO accounts (user_id, plaid_account_id, name, official_name, type, subtype, mask, current_balance, available_balance, iso_currency_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (user_id, plaid_account_id)
             DO UPDATE SET 
                name = EXCLUDED.name,
                current_balance = EXCLUDED.current_balance,
                available_balance = EXCLUDED.available_balance,
                updated_at = NOW()`,
            [
                userId,
                account.account_id,
                account.name,
                account.official_name,
                account.type,
                account.subtype,
                account.mask,
                account.balances?.current,
                account.balances?.available,
                account.balances?.iso_currency_code || 'CAD'
            ]
        );
    }
};

const getAccounts = async (userId) => {
    const result = await pool.query(
        `SELECT id, plaid_account_id, name, official_name, type, subtype, mask, 
                current_balance, available_balance, iso_currency_code, updated_at
         FROM accounts WHERE user_id = $1 ORDER BY name`,
        [userId]
    );
    return result.rows;
};

// ============ TRANSACTION OPERATIONS ============

const upsertTransactions = async (userId, transactions) => {
    // Get account ID mapping
    const accountsResult = await pool.query(
        `SELECT id, plaid_account_id FROM accounts WHERE user_id = $1`,
        [userId]
    );
    const accountMap = {};
    accountsResult.rows.forEach(a => accountMap[a.plaid_account_id] = a.id);

    for (const tx of transactions) {
        const accountId = accountMap[tx.account_id] || null;

        await pool.query(
            `INSERT INTO transactions (user_id, account_id, plaid_transaction_id, name, merchant_name, amount, date, category, pending, iso_currency_code)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (user_id, plaid_transaction_id)
             DO UPDATE SET 
                name = EXCLUDED.name,
                amount = EXCLUDED.amount,
                pending = EXCLUDED.pending`,
            [
                userId,
                accountId,
                tx.transaction_id,
                tx.name,
                tx.merchant_name,
                tx.amount,
                tx.date,
                tx.category || [],
                tx.pending || false,
                tx.iso_currency_code || 'CAD'
            ]
        );
    }
};

const getTransactions = async (userId, limit = 100) => {
    const result = await pool.query(
        `SELECT t.id, t.plaid_transaction_id as transaction_id, t.name, t.merchant_name, 
                t.amount, t.date, t.category, t.pending, t.iso_currency_code,
                a.name as account_name
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = $1
         ORDER BY t.date DESC, t.id DESC
         LIMIT $2`,
        [userId, limit]
    );
    return result.rows;
};

module.exports = {
    pool,
    // User operations
    createUser,
    getUserByEmail,
    getUserById,
    updateUserPlaidToken,
    // Sync operations
    getLastSyncTime,
    updateSyncTime,
    shouldSync,
    // Account operations
    upsertAccounts,
    getAccounts,
    // Transaction operations
    upsertTransactions,
    getTransactions,
};
