const { Pool } = require('pg');

// PostgreSQL connection pool
const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('./encryption');

// PostgreSQL connection pool
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }, // Required for Render
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'induswealth',
            user: process.env.DB_USER || 'induswealth',
            password: process.env.DB_PASSWORD || 'induswealth123',
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        }
);

// Test connection on startup
pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch(err => {
        console.error('❌ PostgreSQL connection failed:', err.message);
        // Don't exit process, let it try to reconnect or let the request fail
    });

// Initialize Database Schema.
// Runs on every server boot (i.e. every Render deploy) and applies the full,
// ordered migration list from db/migrations.js — the same list the `npm run
// migrate` CLI uses, so the two can never drift again. Every migration is
// idempotent, so re-running the whole list each boot is a safe no-op for
// already-applied migrations.
const MIGRATIONS = require('../../db/migrations');

const initDb = async () => {
    try {
        console.log(`🔄 Running ${MIGRATIONS.length} database migrations...`);
        for (const file of MIGRATIONS) {
            const sqlPath = path.join(__dirname, '../../db', file);
            if (!fs.existsSync(sqlPath)) {
                console.warn(`⚠️  Migration file not found, skipping: ${file}`);
                continue;
            }
            const sql = fs.readFileSync(sqlPath, 'utf8');
            console.log(`   → ${file}`);
            await pool.query(sql);
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
        `SELECT id, email, password_hash, name, date_of_birth, plaid_access_token, plaid_item_id,
                failed_login_attempts, locked_until, password_changed_at, email_verified, created_at
         FROM users WHERE email = $1`,
        [email]
    );
    const user = result.rows[0];
    if (user && user.plaid_access_token) {
        user.plaid_access_token = decrypt(user.plaid_access_token);
    }
    return user;
};

const getUserById = async (userId) => {
    const result = await pool.query(
        `SELECT id, email, name, date_of_birth, plaid_access_token, plaid_item_id, email_verified, created_at
         FROM users WHERE id = $1`,
        [userId]
    );
    const user = result.rows[0];
    if (user && user.plaid_access_token) {
        user.plaid_access_token = decrypt(user.plaid_access_token);
    }
    return user;
};

const updateUserPlaidToken = async (userId, accessToken, itemId) => {
    const encryptedToken = encrypt(accessToken);
    await pool.query(
        `UPDATE users SET plaid_access_token = $1, plaid_item_id = $2, updated_at = NOW()
         WHERE id = $3`,
        [encryptedToken, itemId, userId]
    );
};

// ============ SYNC LOG OPERATIONS ============

// Whitelist of valid sync type columns to prevent SQL injection
const VALID_SYNC_TYPES = ['last_transaction_sync', 'last_account_sync', 'last_balance_sync', 'last_plaid_refresh'];

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
    if (accounts.length === 0) return;

    const values = [];
    const params = [];
    let idx = 1;

    for (const account of accounts) {
        values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9})`);
        params.push(
            userId, account.account_id, account.name, account.official_name,
            account.type, account.subtype, account.mask,
            account.balances?.current, account.balances?.available,
            account.balances?.iso_currency_code || 'CAD'
        );
        idx += 10;
    }

    await pool.query(
        `INSERT INTO accounts (user_id, plaid_account_id, name, official_name, type, subtype, mask, current_balance, available_balance, iso_currency_code)
         VALUES ${values.join(',')}
         ON CONFLICT (user_id, plaid_account_id)
         DO UPDATE SET
            name = EXCLUDED.name,
            current_balance = EXCLUDED.current_balance,
            available_balance = EXCLUDED.available_balance,
            updated_at = NOW()`,
        params
    );
};

const getAccounts = async (userId) => {
    const result = await pool.query(
        `SELECT id, plaid_account_id, name, alias, official_name, type, subtype, mask,
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
    if (transactions.length === 0) return;

    // Single query for account mapping instead of per-transaction lookup
    const accountsResult = await pool.query(
        `SELECT id, plaid_account_id FROM accounts WHERE user_id = $1`,
        [userId]
    );
    const accountMap = {};
    accountsResult.rows.forEach(a => accountMap[a.plaid_account_id] = a.id);

    // Batch in chunks of 100 to avoid excessive parameter counts
    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < transactions.length; offset += CHUNK_SIZE) {
        const chunk = transactions.slice(offset, offset + CHUNK_SIZE);
        const values = [];
        const params = [];
        let idx = 1;

        for (const tx of chunk) {
            values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9})`);
            params.push(
                userId,
                accountMap[tx.account_id] || null,
                tx.transaction_id,
                tx.name,
                tx.merchant_name || null,
                tx.amount,
                tx.date,
                tx.category || [],
                tx.pending || false,
                tx.iso_currency_code || 'CAD'
            );
            idx += 10;
        }

        await pool.query(
            `INSERT INTO transactions (user_id, account_id, plaid_transaction_id, name, merchant_name, amount, date, category, pending, iso_currency_code)
             VALUES ${values.join(',')}
             ON CONFLICT (user_id, plaid_transaction_id)
             DO UPDATE SET
                name = EXCLUDED.name,
                amount = EXCLUDED.amount,
                pending = EXCLUDED.pending
                -- notes and updated_at intentionally excluded to preserve user data`,
            params
        );
    }
};

const getTransactions = async (userId, limit = 100) => {
    const result = await pool.query(
        `SELECT t.id, t.plaid_transaction_id as transaction_id, t.name, t.merchant_name,
                t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending, t.iso_currency_code, t.notes,
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
                t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending, t.iso_currency_code, t.notes,
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

// Update transaction notes
const updateTransactionNotes = async (userId, plaidTransactionId, notes) => {
    const result = await pool.query(
        `UPDATE transactions
         SET notes = $1, updated_at = NOW()
         WHERE user_id = $2 AND plaid_transaction_id = $3
         RETURNING id, plaid_transaction_id as transaction_id, notes, updated_at`,
        [notes, userId, plaidTransactionId]
    );
    return result.rows[0];
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

// ===================
// AI Categorization Operations
// ===================

/**
 * Get cached merchant category
 */
const getMerchantCategory = async (merchantNormalized) => {
    const result = await pool.query(
        `SELECT category, category_icon, category_color, confidence_score
         FROM merchant_category_cache
         WHERE merchant_normalized = $1
           AND (cache_expires_at IS NULL OR cache_expires_at > NOW())`,
        [merchantNormalized]
    );
    return result.rows[0] || null;
};

/**
 * Store merchant categories in bulk (from AI)
 */
const storeMerchantCategories = async (categorizations) => {
    if (!categorizations || categorizations.length === 0) return;

    const values = [];
    const params = [];
    let paramIndex = 1;

    categorizations.forEach(cat => {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
        params.push(
            cat.merchant_normalized,
            cat.category,
            cat.category_icon,
            cat.category_color,
            cat.confidence_score,
            cat.ai_model_used
        );
        paramIndex += 6;
    });

    const query = `
        INSERT INTO merchant_category_cache
            (merchant_normalized, category, category_icon, category_color, confidence_score, ai_model_used)
        VALUES ${values.join(', ')}
        ON CONFLICT (merchant_normalized)
        DO UPDATE SET
            category = EXCLUDED.category,
            category_icon = EXCLUDED.category_icon,
            category_color = EXCLUDED.category_color,
            confidence_score = EXCLUDED.confidence_score,
            ai_model_used = EXCLUDED.ai_model_used,
            updated_at = NOW()
    `;

    await pool.query(query, params);
    console.log(`✓ Stored ${categorizations.length} merchant categories in cache`);
};

/**
 * Increment cache usage counter
 */
const incrementCacheUsage = async (merchantNormalized) => {
    await pool.query(
        `UPDATE merchant_category_cache
         SET times_used = times_used + 1,
             last_used_at = NOW()
         WHERE merchant_normalized = $1`,
        [merchantNormalized]
    );
};

/**
 * Log AI categorization call
 */
const logAICategorization = async (logData) => {
    await pool.query(
        `INSERT INTO ai_categorization_log
            (merchant_count, token_count_input, token_count_output, ai_model_used, generation_time_ms, error_message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            logData.merchant_count,
            logData.token_count_input || null,
            logData.token_count_output || null,
            logData.ai_model_used || null,
            logData.generation_time_ms || null,
            logData.error_message || null
        ]
    );
};

// ============ REFRESH TOKEN OPERATIONS ============

const storeRefreshToken = async (tokenHash, userId, familyId, expiresAt, ipAddress) => {
    await pool.query(
        `INSERT INTO refresh_tokens (token_hash, user_id, family_id, expires_at, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, userId, familyId, expiresAt, ipAddress]
    );
};

const getRefreshToken = async (tokenHash) => {
    const result = await pool.query(
        `SELECT id, token_hash, user_id, family_id, expires_at, revoked_at, replaced_by_hash, ip_address
         FROM refresh_tokens WHERE token_hash = $1`,
        [tokenHash]
    );
    return result.rows[0];
};

const revokeRefreshToken = async (tokenHash, replacedByHash = null) => {
    await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = $2 WHERE token_hash = $1`,
        [tokenHash, replacedByHash]
    );
};

const revokeTokenFamily = async (familyId) => {
    await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
        [familyId]
    );
};

const revokeAllUserTokens = async (userId) => {
    await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
    );
};

const cleanupExpiredTokens = async () => {
    const result = await pool.query(
        `DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '7 days'`
    );
    return result.rowCount;
};

// ============ LOGIN ATTEMPT OPERATIONS ============

const recordLoginAttempt = async (email, ipAddress, userAgent, success, failureReason = null) => {
    await pool.query(
        `INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, ipAddress, userAgent, success, failureReason]
    );
};

const getRecentFailedAttempts = async (email, windowMinutes = 15) => {
    const result = await pool.query(
        `SELECT COUNT(*) as count FROM login_attempts
         WHERE email = $1 AND success = false
         AND attempted_at > NOW() - INTERVAL '1 minute' * $2`,
        [email, windowMinutes]
    );
    return parseInt(result.rows[0].count, 10);
};

const updateUserLockStatus = async (userId, failedAttempts, lockedUntil = null) => {
    await pool.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [failedAttempts, lockedUntil, userId]
    );
};

// ============ 2FA OPERATIONS ============

const storeTotpSecret = async (userId, encryptedSecret) => {
    await pool.query(
        `INSERT INTO totp_secrets (user_id, encrypted_secret)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET encrypted_secret = $2, is_verified = false, updated_at = NOW()`,
        [userId, encryptedSecret]
    );
};

const getTotpSecret = async (userId) => {
    const result = await pool.query(
        `SELECT encrypted_secret, is_verified FROM totp_secrets WHERE user_id = $1`,
        [userId]
    );
    return result.rows[0];
};

const verifyTotpSetup = async (userId) => {
    await pool.query(
        `UPDATE totp_secrets SET is_verified = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
    );
};

const deleteTotpSecret = async (userId) => {
    await pool.query(`DELETE FROM totp_secrets WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM recovery_codes WHERE user_id = $1`, [userId]);
};

const storeRecoveryCodes = async (userId, codeHashes) => {
    await pool.query(`DELETE FROM recovery_codes WHERE user_id = $1`, [userId]);
    const values = codeHashes.map((_, i) => `($1, $${i + 2})`).join(',');
    await pool.query(
        `INSERT INTO recovery_codes (user_id, code_hash) VALUES ${values}`,
        [userId, ...codeHashes]
    );
};

const getRecoveryCodes = async (userId) => {
    const result = await pool.query(
        `SELECT code_hash, used_at FROM recovery_codes WHERE user_id = $1`,
        [userId]
    );
    return result.rows;
};

const useRecoveryCode = async (userId, codeHash) => {
    const result = await pool.query(
        `UPDATE recovery_codes SET used_at = NOW()
         WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
         RETURNING id`,
        [userId, codeHash]
    );
    return result.rows.length > 0;
};

// ============ EMAIL VERIFICATION OPERATIONS ============

const setEmailVerificationToken = async (userId, tokenHash, expiresAt) => {
    await pool.query(
        `UPDATE users SET email_verification_token = $1, email_verification_expires = $2, updated_at = NOW()
         WHERE id = $3`,
        [tokenHash, expiresAt, userId]
    );
};

/**
 * Consume an email verification code.
 *
 * Scoped to the address the code was sent to. Without that, a six-digit code
 * matched against every pending signup at once, so a guess only had to collide
 * with *someone's* code — and verification now mints a session, which would
 * make that an account takeover.
 */
const verifyEmail = async (tokenHash, email) => {
    const result = await pool.query(
        `UPDATE users SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL, updated_at = NOW()
         WHERE email_verification_token = $1
           AND email_verification_expires > NOW()
           AND LOWER(email) = LOWER($2)
         RETURNING id, email, name, plaid_access_token`,
        [tokenHash, email]
    );
    return result.rows[0] || null;
};

// ============ PASSWORD RESET OPERATIONS ============

const setPasswordResetToken = async (userId, tokenHash, expiresAt) => {
    await pool.query(
        `UPDATE users SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
         WHERE id = $3`,
        [tokenHash, expiresAt, userId]
    );
};

const getPasswordResetUser = async (tokenHash) => {
    const result = await pool.query(
        `SELECT id, email, name FROM users
         WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
        [tokenHash]
    );
    return result.rows[0] || null;
};

const clearPasswordResetToken = async (userId) => {
    await pool.query(
        `UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL, updated_at = NOW()
         WHERE id = $1`,
        [userId]
    );
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
    updateTransactionNotes,
    // Analytics operations
    getCategorySpending,
    getDailySpending,
    getIncomeVsExpenses,
    getMonthlySpending,
    // AI Categorization operations
    getMerchantCategory,
    storeMerchantCategories,
    incrementCacheUsage,
    logAICategorization,
    // Refresh token operations
    storeRefreshToken,
    getRefreshToken,
    revokeRefreshToken,
    revokeTokenFamily,
    revokeAllUserTokens,
    cleanupExpiredTokens,
    // Login attempt operations
    recordLoginAttempt,
    getRecentFailedAttempts,
    updateUserLockStatus,
    // 2FA operations
    storeTotpSecret,
    getTotpSecret,
    verifyTotpSetup,
    deleteTotpSecret,
    storeRecoveryCodes,
    getRecoveryCodes,
    useRecoveryCode,
    // Email verification operations
    setEmailVerificationToken,
    verifyEmail,
    // Password reset operations
    setPasswordResetToken,
    getPasswordResetUser,
    clearPasswordResetToken,
    initDb,
};

