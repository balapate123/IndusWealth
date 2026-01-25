const { Pool } = require('pg');

// PostgreSQL connection pool
const fs = require('fs');
const path = require('path');

// PostgreSQL connection pool
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false, // Required for Render
            },
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'induswealth',
            user: process.env.DB_USER || 'induswealth',
            password: process.env.DB_PASSWORD || 'induswealth123',
        }
);

// Test connection on startup
pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch(err => {
        console.error('❌ PostgreSQL connection failed:', err.message);
        // Don't exit process, let it try to reconnect or let the request fail
    });

// Initialize Database Schema
const initDb = async () => {
    try {
        // Run initial schema
        const initSqlPath = path.join(__dirname, '../../db/init.sql');
        const initSql = fs.readFileSync(initSqlPath, 'utf8');
        console.log('🔄 Initializing database schema...');
        await pool.query(initSql);

        // Run custom debts migration
        const debSqlPath = path.join(__dirname, '../../db/add_custom_debts.sql');
        if (fs.existsSync(debSqlPath)) {
            const debSql = fs.readFileSync(debSqlPath, 'utf8');
            console.log('🔄 Running custom debts migration...');
            await pool.query(debSql);
        }

        // Run user DOB migration
        const dobSqlPath = path.join(__dirname, '../../db/add_user_dob.sql');
        if (fs.existsSync(dobSqlPath)) {
            const dobSql = fs.readFileSync(dobSqlPath, 'utf8');
            console.log('🔄 Running user DOB migration...');
            await pool.query(dobSql);
        }

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
    }
};

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
        `SELECT id, email, password_hash, name, date_of_birth, plaid_access_token, plaid_item_id, created_at
         FROM users WHERE email = $1`,
        [email]
    );
    return result.rows[0];
};

const getUserById = async (userId) => {
    const result = await pool.query(
        `SELECT id, email, name, date_of_birth, plaid_access_token, plaid_item_id, created_at
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

// Whitelist of valid sync type columns to prevent SQL injection
const VALID_SYNC_TYPES = ['last_transaction_sync', 'last_account_sync', 'last_balance_sync'];

const validateSyncType = (syncType) => {
    if (!VALID_SYNC_TYPES.includes(syncType)) {
        throw new Error(`Invalid sync type: ${syncType}. Must be one of: ${VALID_SYNC_TYPES.join(', ')}`);
    }
    return syncType;
};

const getLastSyncTime = async (userId, syncType = 'last_transaction_sync') => {
    const validatedSyncType = validateSyncType(syncType);
    const result = await pool.query(
        `SELECT ${validatedSyncType} FROM sync_log WHERE user_id = $1`,
        [userId]
    );
    return result.rows[0]?.[validatedSyncType] || null;
};

const updateSyncTime = async (userId, syncType = 'last_transaction_sync') => {
    const validatedSyncType = validateSyncType(syncType);
    await pool.query(
        `INSERT INTO sync_log (user_id, ${validatedSyncType}, updated_at)
         VALUES ($1, NOW(), NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET ${validatedSyncType} = NOW(), updated_at = NOW()`,
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

// Delete all accounts for a user
const deleteUserAccounts = async (userId) => {
    const result = await pool.query(
        `DELETE FROM accounts WHERE user_id = $1`,
        [userId]
    );
    return result.rowCount;
};

// Delete all transactions for a user
const deleteUserTransactions = async (userId) => {
    const result = await pool.query(
        `DELETE FROM transactions WHERE user_id = $1`,
        [userId]
    );
    return result.rowCount;
};

// Clear Plaid tokens for a user
const clearUserPlaidTokens = async (userId) => {
    await pool.query(
        `UPDATE users SET plaid_access_token = NULL, plaid_item_id = NULL, updated_at = NOW() WHERE id = $1`,
        [userId]
    );
};

// Delete a single account by plaid_account_id
const deleteAccount = async (userId, plaidAccountId) => {
    const result = await pool.query(
        `DELETE FROM accounts WHERE user_id = $1 AND plaid_account_id = $2`,
        [userId, plaidAccountId]
    );
    return result.rowCount;
};

// Delete transactions for a single account by plaid_account_id
const deleteAccountTransactions = async (userId, plaidAccountId) => {
    // First get the internal account ID
    const accountResult = await pool.query(
        `SELECT id FROM accounts WHERE user_id = $1 AND plaid_account_id = $2`,
        [userId, plaidAccountId]
    );

    if (accountResult.rows.length === 0) {
        return 0;
    }

    const accountId = accountResult.rows[0].id;
    const result = await pool.query(
        `DELETE FROM transactions WHERE user_id = $1 AND account_id = $2`,
        [userId, accountId]
    );
    return result.rowCount;
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
                t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending, t.iso_currency_code,
                a.name as account_name, a.plaid_account_id as account_id
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = $1
         ORDER BY t.date DESC, t.id DESC
         LIMIT $2`,
        [userId, limit]
    );
    return result.rows;
};

// Get transactions for a specific account
const getTransactionsByAccount = async (userId, accountId, limit = 100) => {
    const result = await pool.query(
        `SELECT t.id, t.plaid_transaction_id as transaction_id, t.name, t.merchant_name, 
                t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending, t.iso_currency_code,
                a.name as account_name, a.plaid_account_id as account_id
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = $1 AND a.plaid_account_id = $2
         ORDER BY t.date DESC, t.id DESC
         LIMIT $3`,
        [userId, accountId, limit]
    );
    return result.rows;
};

// Get spending by category for analytics
const getCategorySpending = async (userId, days = 30, offsetDays = 0) => {
    const result = await pool.query(
        `SELECT
            COALESCE(category[1], 'Other') as category,
            SUM(ABS(amount)) as amount,
            COUNT(*) as count
         FROM transactions
         WHERE user_id = $1
           AND amount > 0
           AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
           AND date < CURRENT_DATE - INTERVAL '1 day' * $3
         GROUP BY category[1]
         ORDER BY amount DESC`,
        [userId, days + offsetDays, offsetDays]
    );
    return result.rows;
};

// Get daily spending totals
const getDailySpending = async (userId, days = 30) => {
    const result = await pool.query(
        `SELECT
            date::text,
            SUM(ABS(amount)) as amount
         FROM transactions
         WHERE user_id = $1
           AND amount > 0
           AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
         GROUP BY date
         ORDER BY date ASC`,
        [userId, days]
    );
    return result.rows;
};

// Get income vs expenses
const getIncomeVsExpenses = async (userId, days = 30) => {
    const result = await pool.query(
        `SELECT
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as income,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as expenses
         FROM transactions
         WHERE user_id = $1
           AND date >= CURRENT_DATE - INTERVAL '1 day' * $2`,
        [userId, days]
    );
    return result.rows[0] || { income: 0, expenses: 0 };
};

// Get monthly spending trends
const getMonthlySpending = async (userId, months = 6) => {
    const result = await pool.query(
        `SELECT
            TO_CHAR(date, 'YYYY-MM') as month,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as spending,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as income
         FROM transactions
         WHERE user_id = $1
           AND date >= CURRENT_DATE - INTERVAL '1 month' * $2
         GROUP BY TO_CHAR(date, 'YYYY-MM')
         ORDER BY month ASC`,
        [userId, months]
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
    deleteUserAccounts,
    deleteUserTransactions,
    clearUserPlaidTokens,
    deleteAccount,
    deleteAccountTransactions,
    // Transaction operations
    upsertTransactions,
    getTransactions,
    getTransactionsByAccount,
    // Analytics operations
    getCategorySpending,
    getDailySpending,
    getIncomeVsExpenses,
    getMonthlySpending,
    initDb,
};

