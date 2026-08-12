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

/**
 * Look a user up by their Plaid item id. Webhooks identify the Item, not the
 * user, so this is how an inbound webhook finds whose data to sync.
 */
const getUserByPlaidItemId = async (itemId) => {
    const result = await pool.query(
        `SELECT id, email, name, plaid_access_token, plaid_item_id, email_verified
         FROM users WHERE plaid_item_id = $1`,
        [itemId]
    );
    const user = result.rows[0];
    if (user && user.plaid_access_token) {
        user.plaid_access_token = decrypt(user.plaid_access_token);
    }
    return user;
};

/**
 * Fill in a missing Plaid item id without touching one already stored.
 *
 * Connections made before the exchange saved the item id have NULL here, and a
 * NULL is unreachable by the webhook lookup. The `IS NULL` guard makes this a
 * repair rather than an overwrite: it can run on every sync and will only ever
 * write once per connection.
 */
const setPlaidItemIdIfMissing = async (userId, itemId) => {
    if (!itemId) return false;
    const result = await pool.query(
        `UPDATE users SET plaid_item_id = $1, updated_at = NOW()
         WHERE id = $2 AND plaid_item_id IS NULL`,
        [itemId, userId]
    );
    return result.rowCount > 0;
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
        values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8},$${idx+9},$${idx+10})`);
        params.push(
            userId, account.account_id, account.name, account.official_name,
            account.type, account.subtype, account.mask,
            account.balances?.current, account.balances?.available,
            // Null on depository accounts; on credit it is the credit limit,
            // which is what "how much of the card have I used" is measured against.
            account.balances?.limit ?? null,
            account.balances?.iso_currency_code || 'CAD'
        );
        idx += 11;
    }

    await pool.query(
        `INSERT INTO accounts (user_id, plaid_account_id, name, official_name, type, subtype, mask, current_balance, available_balance, credit_limit, iso_currency_code)
         VALUES ${values.join(',')}
         ON CONFLICT (user_id, plaid_account_id)
         DO UPDATE SET
            name = EXCLUDED.name,
            current_balance = EXCLUDED.current_balance,
            available_balance = EXCLUDED.available_balance,
            -- A limit Plaid omits on one poll must not wipe the one we hold.
            credit_limit = COALESCE(EXCLUDED.credit_limit, accounts.credit_limit),
            iso_currency_code = EXCLUDED.iso_currency_code,
            updated_at = NOW()`,
        params
    );
};

const getAccounts = async (userId) => {
    const result = await pool.query(
        `SELECT id, plaid_account_id, name, alias, official_name, type, subtype, mask,
                current_balance, available_balance, credit_limit, iso_currency_code, updated_at
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

/**
 * Delete transactions Plaid has retracted, addressed by Item rather than by
 * user because that is what the webhook carries. Joining through users scopes
 * the delete to the Item's owner, so an id cannot reach anyone else's rows.
 */
const deleteTransactionsByPlaidIds = async (itemId, plaidTransactionIds) => {
    if (!itemId || !plaidTransactionIds?.length) return 0;

    const result = await pool.query(
        `DELETE FROM transactions t
         USING users u
         WHERE t.user_id = u.id
           AND u.plaid_item_id = $1
           AND t.plaid_transaction_id = ANY($2::varchar[])`,
        [itemId, plaidTransactionIds]
    );
    return result.rowCount;
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

const TRANSACTION_COLUMNS = `
    t.id, t.plaid_transaction_id as transaction_id, t.name, t.merchant_name,
    t.amount, TO_CHAR(t.date, 'YYYY-MM-DD') as date, t.category, t.pending,
    t.iso_currency_code, t.notes,
    a.name as account_name, a.plaid_account_id as account_id,
    COALESCE((
        SELECT json_agg(json_build_object(
                   'id', f.id, 'name', f.name,
                   'color_index', f.color_index, 'icon', f.icon
               ) ORDER BY f.name)
        FROM transaction_flag_links fl
        JOIN transaction_flags f ON f.id = fl.flag_id
        WHERE fl.transaction_id = t.id
    ), '[]'::json) AS flags`;

/**
 * Shared WHERE clause for the paged transaction list, so the page query and the
 * count that drives "has more" can never drift apart and disagree about how many
 * rows exist.
 *
 * `days` counts back inclusive of today: 7 means today plus the six days before.
 */
const buildTransactionFilter = (userId, { accountId, days, search, flagId } = {}) => {
    const clauses = ['t.user_id = $1'];
    const params = [userId];

    if (accountId && accountId !== 'all') {
        params.push(accountId);
        clauses.push(`a.plaid_account_id = $${params.length}`);
    }

    // EXISTS rather than a join: a join against the link table would multiply
    // rows for a transaction carrying several flags, inflating both the page and
    // the count. 'none' selects the untagged ones — "what have I not sorted yet".
    if (flagId === 'none') {
        clauses.push(`NOT EXISTS (
            SELECT 1 FROM transaction_flag_links fl WHERE fl.transaction_id = t.id
        )`);
    } else if (flagId) {
        params.push(flagId);
        clauses.push(`EXISTS (
            SELECT 1 FROM transaction_flag_links fl
            WHERE fl.transaction_id = t.id AND fl.flag_id = $${params.length}
        )`);
    }

    if (days) {
        params.push(days);
        clauses.push(`t.date >= CURRENT_DATE - ($${params.length}::int - 1)`);
    }

    if (search) {
        params.push(`%${search}%`);
        const p = `$${params.length}`;
        // Matches what the list shows: merchant, the raw name, the user's note,
        // and the amount as typed ("42.50").
        clauses.push(`(
            t.name ILIKE ${p}
            OR t.merchant_name ILIKE ${p}
            OR t.notes ILIKE ${p}
            OR CAST(ABS(t.amount) AS TEXT) LIKE ${p}
        )`);
    }

    return { where: clauses.join(' AND '), params };
};

/** One page of transactions, newest first. */
const getTransactionsPage = async (userId, options = {}) => {
    const { limit = 100, offset = 0 } = options;
    const { where, params } = buildTransactionFilter(userId, options);

    params.push(limit, offset);

    const result = await pool.query(
        `SELECT ${TRANSACTION_COLUMNS}
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE ${where}
         ORDER BY t.date DESC, t.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return result.rows;
};

/** How many rows match, ignoring limit/offset — the total behind the paging. */
const countTransactions = async (userId, options = {}) => {
    const { where, params } = buildTransactionFilter(userId, options);

    const result = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE ${where}`,
        params
    );
    return result.rows[0]?.total || 0;
};

/**
 * Money totals across everything the filter matches — NOT just the page.
 *
 * Plaid's sign convention: a positive amount is money leaving the account. So
 * outflow and inflow are split on the sign, and `net` is simply SUM(amount),
 * i.e. spent minus reimbursed. The netting is the point for a shared-expense
 * flag: a roommate paying you back lands as an inflow and should cancel part of
 * what you fronted, otherwise the flag reports what you spent gross and nobody
 * can act on it.
 */
const sumTransactions = async (userId, options = {}) => {
    const { where, params } = buildTransactionFilter(userId, options);

    const result = await pool.query(
        `SELECT
            COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)::float AS outflow,
            COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)::float AS inflow,
            COALESCE(SUM(t.amount), 0)::float AS net,
            COUNT(*)::int AS count
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE ${where}`,
        params
    );
    return result.rows[0] || { outflow: 0, inflow: 0, net: 0, count: 0 };
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

// ============ FLAG OPERATIONS ============
//
// Conflict handling is uniform across create and update: a duplicate name raises
// Postgres 23505 on the (user_id, LOWER(name)) unique index and propagates to
// the route, which turns it into a 409. A null return always means "no such flag
// for this user" and never means "name taken".

/** Every flag, with the count and money totals of what is currently attached. */
const getFlags = async (userId) => {
    const result = await pool.query(
        `SELECT f.id, f.name, f.color_index, f.icon,
                COUNT(l.transaction_id)::int AS transaction_count,
                COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)::float AS outflow,
                COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)::float AS inflow,
                COALESCE(SUM(t.amount), 0)::float AS net
         FROM transaction_flags f
         LEFT JOIN transaction_flag_links l ON l.flag_id = f.id
         LEFT JOIN transactions t ON t.id = l.transaction_id
         WHERE f.user_id = $1
         GROUP BY f.id
         ORDER BY LOWER(f.name)`,
        [userId]
    );
    return result.rows;
};

const getFlagById = async (userId, flagId) => {
    const result = await pool.query(
        `SELECT id, name, color_index, icon FROM transaction_flags
         WHERE user_id = $1 AND id = $2`,
        [userId, flagId]
    );
    return result.rows[0] || null;
};

/**
 * Create the starter set once. Returns true if this call is what created them.
 *
 * The UPDATE ... WHERE flags_seeded_at IS NULL is the lock: if two first-loads
 * race, one of them updates a row and the other updates none and bails, so the
 * defaults cannot be inserted twice. Stamping also means a user who deletes
 * every flag is not handed the defaults back on their next load.
 */
const seedDefaultFlags = async (userId, defaults) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const claimed = await client.query(
            `UPDATE users SET flags_seeded_at = NOW()
             WHERE id = $1 AND flags_seeded_at IS NULL
             RETURNING id`,
            [userId]
        );
        if (!claimed.rows.length) {
            await client.query('ROLLBACK');
            return false;
        }

        for (const flag of defaults) {
            await client.query(
                `INSERT INTO transaction_flags (user_id, name, color_index, icon)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [userId, flag.name, flag.colorIndex, flag.icon]
            );
        }

        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const createFlag = async (userId, { name, colorIndex, icon }) => {
    const result = await pool.query(
        `INSERT INTO transaction_flags (user_id, name, color_index, icon)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, color_index, icon`,
        [userId, name, colorIndex, icon]
    );
    return result.rows[0];
};

const updateFlag = async (userId, flagId, { name, colorIndex, icon }) => {
    const params = [userId, flagId];
    const sets = [];
    const set = (column, value) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
    };

    if (name !== undefined) set('name', name);
    if (colorIndex !== undefined) set('color_index', colorIndex);
    if (icon !== undefined) set('icon', icon);
    if (!sets.length) return getFlagById(userId, flagId);

    sets.push('updated_at = NOW()');

    const result = await pool.query(
        `UPDATE transaction_flags SET ${sets.join(', ')}
         WHERE user_id = $1 AND id = $2
         RETURNING id, name, color_index, icon`,
        params
    );
    return result.rows[0] || null;
};

const deleteFlag = async (userId, flagId) => {
    const result = await pool.query(
        `DELETE FROM transaction_flags WHERE user_id = $1 AND id = $2 RETURNING id`,
        [userId, flagId]
    );
    return result.rowCount > 0;
};

/**
 * Attach/detach transactions in one round trip, addressed by the Plaid id the
 * client holds. Returns null if the flag is not this user's.
 *
 * `t.user_id = $2` inside the INSERT ... SELECT is the authorisation: an id
 * belonging to someone else simply selects no row, so a crafted request tags
 * nothing rather than tagging a stranger's transaction.
 */
const setFlagAssignments = async (userId, flagId, { add = [], remove = [] } = {}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const owned = await client.query(
            `SELECT id FROM transaction_flags WHERE id = $1 AND user_id = $2`,
            [flagId, userId]
        );
        if (!owned.rows.length) {
            await client.query('ROLLBACK');
            return null;
        }

        let added = 0;
        let removed = 0;

        if (add.length) {
            const result = await client.query(
                `INSERT INTO transaction_flag_links (flag_id, transaction_id)
                 SELECT $1, t.id FROM transactions t
                 WHERE t.user_id = $2 AND t.plaid_transaction_id = ANY($3::varchar[])
                 ON CONFLICT DO NOTHING`,
                [flagId, userId, add]
            );
            added = result.rowCount;
        }

        if (remove.length) {
            const result = await client.query(
                `DELETE FROM transaction_flag_links l
                 USING transactions t
                 WHERE l.flag_id = $1
                   AND l.transaction_id = t.id
                   AND t.user_id = $2
                   AND t.plaid_transaction_id = ANY($3::varchar[])`,
                [flagId, userId, remove]
            );
            removed = result.rowCount;
        }

        await client.query('COMMIT');
        return { added, removed };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * The breakdowns behind a single flag. Runs through the same
 * buildTransactionFilter as the list, so what the analytics count and what the
 * list shows can never diverge.
 */
const getFlagAnalytics = async (userId, options = {}) => {
    const { where, params } = buildTransactionFilter(userId, options);
    const from = `FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE ${where}`;

    // Breakdowns rank outflows only. Letting a refund into "top merchants" would
    // rank a merchant who paid you back next to ones you actually paid.
    const spent = `${from} AND t.amount > 0`;

    const [totals, monthly, merchants, categories, accounts] = await Promise.all([
        sumTransactions(userId, options),
        pool.query(
            `SELECT TO_CHAR(t.date, 'YYYY-MM') AS month,
                    COALESCE(SUM(t.amount), 0)::float AS net
             ${from} GROUP BY 1 ORDER BY 1`,
            params
        ),
        pool.query(
            `SELECT COALESCE(NULLIF(t.merchant_name, ''), t.name) AS merchant,
                    SUM(t.amount)::float AS amount, COUNT(*)::int AS count
             ${spent} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
            params
        ),
        pool.query(
            `SELECT COALESCE(t.category[1], 'Other') AS category,
                    SUM(t.amount)::float AS amount, COUNT(*)::int AS count
             ${spent} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
            params
        ),
        pool.query(
            `SELECT COALESCE(a.name, 'Unknown') AS account,
                    SUM(t.amount)::float AS amount, COUNT(*)::int AS count
             ${spent} GROUP BY 1 ORDER BY 2 DESC`,
            params
        ),
    ]);

    return {
        totals,
        monthly: monthly.rows,
        top_merchants: merchants.rows,
        categories: categories.rows,
        accounts: accounts.rows,
    };
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

// ============ SAVINGS GOALS ============

/**
 * The columns every goal read returns, with progress computed in SQL.
 *
 * `saved` is deliberately not floored at zero — an account-tracked goal whose
 * balance fell below its baseline really has lost ground, and hiding that would
 * make the number a cheerleader rather than a measurement. Only the percentage
 * is clamped, because a progress bar cannot render -8%.
 *
 * `saved` is NULL when a goal tracks an account that is gone (deleted, or
 * never this user's). That is distinct from zero progress, and `needs_relink`
 * tells the client which of the two it is looking at.
 */
const GOAL_COLUMNS = `
    g.id, g.name, g.goal_type, g.target_amount::float AS target_amount,
    g.target_date, g.tracking_mode, g.account_id,
    g.baseline_amount::float AS baseline_amount,
    g.color_index, g.icon,
    g.reminder_cadence, g.reminder_day, g.reminder_hour,
    g.reminder_amount::float AS reminder_amount,
    g.milestones_notified, g.status, g.achieved_at, g.created_at,
    -- When anything last went in. Only meaningful for manual goals; the check-in
    -- nudge uses it to tell "stalled" from "just started".
    c.last_at AS last_contribution_at,
    a.name AS account_name, a.mask AS account_mask,
    -- The client addresses accounts by their Plaid id, the same way flags
    -- address transactions: it is what GET /accounts hands it. The numeric id
    -- is the foreign key and never leaves this table's own joins.
    a.plaid_account_id AS account_plaid_id,
    a.current_balance::float AS account_balance,
    p.saved::float AS saved_amount,
    CASE WHEN p.saved IS NULL THEN NULL
         ELSE LEAST(GREATEST(p.saved / g.target_amount * 100, 0), 100)
    END::float AS progress_percent,
    (g.tracking_mode = 'account' AND a.id IS NULL) AS needs_relink`;

// `a.user_id = g.user_id` in the join is the authorisation: an account_id
// pointing at someone else's account joins to nothing and reads as unlinked,
// rather than exposing a stranger's balance.
const GOAL_FROM = `
    FROM user_goals g
    LEFT JOIN accounts a ON a.id = g.account_id AND a.user_id = g.user_id
    LEFT JOIN LATERAL (
        SELECT SUM(amount) AS total, MAX(occurred_on) AS last_at
        FROM goal_contributions WHERE goal_id = g.id
    ) c ON TRUE
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN g.tracking_mode = 'account' AND a.id IS NOT NULL
                THEN a.current_balance - g.baseline_amount
            WHEN g.tracking_mode = 'manual'
                THEN COALESCE(c.total, 0)
            ELSE NULL
        END AS saved
    ) p`;

const getGoals = async (userId, { status = 'active' } = {}) => {
    const params = [userId];
    let statusClause = '';
    if (status && status !== 'all') {
        params.push(status);
        statusClause = ` AND g.status = $${params.length}`;
    }

    const result = await pool.query(
        `SELECT ${GOAL_COLUMNS} ${GOAL_FROM}
         WHERE g.user_id = $1${statusClause}
         ORDER BY g.status = 'achieved', g.target_date NULLS LAST, LOWER(g.name)`,
        params
    );
    return result.rows;
};

const getGoalById = async (userId, goalId) => {
    const result = await pool.query(
        `SELECT ${GOAL_COLUMNS} ${GOAL_FROM}
         WHERE g.user_id = $1 AND g.id = $2`,
        [userId, goalId]
    );
    return result.rows[0] || null;
};

/**
 * Look up one of this user's accounts by the Plaid id the client holds.
 *
 * Scoping to `user_id` here is the authorisation for every account link: a
 * crafted Plaid id belonging to someone else simply resolves to nothing.
 */
const _resolveOwnedAccount = async (userId, plaidAccountId) => {
    const result = await pool.query(
        `SELECT id, current_balance FROM accounts
         WHERE user_id = $1 AND plaid_account_id = $2`,
        [userId, String(plaidAccountId)]
    );
    return result.rows[0] || null;
};

/**
 * Create a goal.
 *
 * When tracking an account, the baseline is snapshotted here from the live
 * balance so an existing $4,000 does not instantly complete a $5,000 goal.
 * `countExistingBalance: true` sets the baseline to 0 for the user who meant
 * "I already have some of this saved".
 */
const createGoal = async (userId, goal) => {
    const {
        name,
        goalType = 'savings',
        targetAmount,
        targetDate = null,
        trackingMode = 'manual',
        accountId = null,
        countExistingBalance = false,
        colorIndex = 0,
        icon = 'flag',
        reminderCadence = null,
        reminderDay = null,
        reminderHour = 9,
        reminderAmount = null,
    } = goal;

    let baseline = 0;
    let linkedAccountId = null;

    if (trackingMode === 'account' && accountId) {
        const account = await _resolveOwnedAccount(userId, accountId);
        // Null means the Plaid id is not one of this user's accounts, so the
        // ownership check lives in the query rather than in the route.
        if (!account) return null;

        linkedAccountId = account.id;
        baseline = countExistingBalance ? 0 : parseFloat(account.current_balance) || 0;
    }

    const created = await pool.query(
        `INSERT INTO user_goals
            (user_id, name, goal_type, target_amount, target_date, tracking_mode,
             account_id, baseline_amount, color_index, icon,
             reminder_cadence, reminder_day, reminder_hour, reminder_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
            userId, name, goalType, targetAmount, targetDate,
            trackingMode === 'account' ? 'account' : 'manual',
            linkedAccountId, baseline, colorIndex, icon,
            reminderCadence, reminderDay, reminderHour, reminderAmount,
        ]
    );

    return getGoalById(userId, created.rows[0].id);
};

const updateGoal = async (userId, goalId, fields) => {
    const params = [userId, goalId];
    const sets = [];
    const set = (column, value) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
    };

    const map = {
        name: 'name',
        goalType: 'goal_type',
        targetAmount: 'target_amount',
        targetDate: 'target_date',
        colorIndex: 'color_index',
        icon: 'icon',
        reminderCadence: 'reminder_cadence',
        reminderDay: 'reminder_day',
        reminderHour: 'reminder_hour',
        reminderAmount: 'reminder_amount',
        status: 'status',
    };

    for (const [key, column] of Object.entries(map)) {
        if (fields[key] !== undefined) set(column, fields[key]);
    }

    // Relinking re-snapshots the baseline, otherwise progress would be measured
    // against a balance from a different account.
    if (fields.accountId !== undefined) {
        if (fields.accountId === null) {
            set('account_id', null);
            set('tracking_mode', 'manual');
            set('baseline_amount', 0);
        } else {
            const account = await _resolveOwnedAccount(userId, fields.accountId);
            if (!account) return null;
            set('account_id', account.id);
            set('tracking_mode', 'account');
            set('baseline_amount', fields.countExistingBalance
                ? 0
                : parseFloat(account.current_balance) || 0);
        }
    }

    if (!sets.length) return getGoalById(userId, goalId);
    sets.push('updated_at = NOW()');

    const result = await pool.query(
        `UPDATE user_goals SET ${sets.join(', ')}
         WHERE user_id = $1 AND id = $2
         RETURNING id`,
        params
    );
    if (!result.rows.length) return null;
    return getGoalById(userId, goalId);
};

const deleteGoal = async (userId, goalId) => {
    const result = await pool.query(
        `DELETE FROM user_goals WHERE user_id = $1 AND id = $2 RETURNING id`,
        [userId, goalId]
    );
    return result.rowCount > 0;
};

/**
 * Log a manual contribution.
 *
 * The `EXISTS` guard is the authorisation: goal_contributions has no user_id of
 * its own, so without it any goal id would accept a row.
 */
const addGoalContribution = async (userId, goalId, { amount, note = null, occurredOn = null }) => {
    const result = await pool.query(
        `INSERT INTO goal_contributions (goal_id, amount, note, occurred_on)
         SELECT $2, $3, $4, COALESCE($5::date, CURRENT_DATE)
         WHERE EXISTS (SELECT 1 FROM user_goals WHERE id = $2 AND user_id = $1)
         RETURNING id, amount::float AS amount, note, occurred_on, created_at`,
        [userId, goalId, amount, note, occurredOn]
    );
    return result.rows[0] || null;
};

const getGoalContributions = async (userId, goalId, limit = 100) => {
    const result = await pool.query(
        `SELECT c.id, c.amount::float AS amount, c.note, c.occurred_on, c.created_at
         FROM goal_contributions c
         JOIN user_goals g ON g.id = c.goal_id
         WHERE g.user_id = $1 AND c.goal_id = $2
         ORDER BY c.occurred_on DESC, c.id DESC
         LIMIT $3`,
        [userId, goalId, limit]
    );
    return result.rows;
};

const deleteGoalContribution = async (userId, goalId, contributionId) => {
    const result = await pool.query(
        `DELETE FROM goal_contributions c
         USING user_goals g
         WHERE c.goal_id = g.id AND g.user_id = $1 AND c.goal_id = $2 AND c.id = $3`,
        [userId, goalId, contributionId]
    );
    return result.rowCount > 0;
};

/**
 * Record milestones as announced, and flip a goal to achieved at 100%.
 *
 * Uses array union rather than assignment so two devices reporting different
 * milestones in the same moment cannot erase each other's.
 */
const markGoalMilestones = async (userId, goalId, milestones) => {
    if (!Array.isArray(milestones) || milestones.length === 0) {
        return getGoalById(userId, goalId);
    }

    const result = await pool.query(
        `UPDATE user_goals
         SET milestones_notified = (
                 SELECT ARRAY(SELECT DISTINCT UNNEST(milestones_notified || $3::smallint[]) ORDER BY 1)
             ),
             status = CASE WHEN 100 = ANY($3::smallint[]) THEN 'achieved' ELSE status END,
             achieved_at = CASE
                 WHEN 100 = ANY($3::smallint[]) AND achieved_at IS NULL THEN NOW()
                 ELSE achieved_at
             END,
             updated_at = NOW()
         WHERE user_id = $1 AND id = $2
         RETURNING id`,
        [userId, goalId, milestones]
    );
    if (!result.rows.length) return null;
    return getGoalById(userId, goalId);
};

// ============ CHECK-IN NUDGES ============

/** The debts a user entered by hand. Plaid-derived debts are not in this table. */
const getCustomDebts = async (userId) => {
    const result = await pool.query(
        `SELECT id, name, debt_type, balance::float AS balance, apr::float AS apr,
                min_payment::float AS min_payment, created_at
         FROM custom_debts WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows;
};

/**
 * Everything the nudge selector needs about what this user has already been
 * shown. Nothing about what a nudge SAYS is stored — that is computed on read
 * from live goals and debts, so it cannot go stale.
 */
const getNudgeState = async (userId) => {
    const [prefs, history] = await Promise.all([
        pool.query(
            `SELECT checkin_last_shown_at, checkin_enabled
             FROM user_preferences WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            'SELECT nudge_key, last_shown_at FROM nudge_history WHERE user_id = $1',
            [userId]
        ),
    ]);

    const seen = {};
    for (const row of history.rows) seen[row.nudge_key] = row.last_shown_at;

    return {
        // No preferences row yet means a user who has never changed anything,
        // which is opted in — the column default.
        lastShownAt: prefs.rows[0]?.checkin_last_shown_at || null,
        enabled: prefs.rows[0]?.checkin_enabled !== false,
        seen,
    };
};

/**
 * Record that a nudge was actually shown.
 *
 * Called when the sheet renders, never when it is fetched — a background
 * request that nobody saw must not spend the user's one interruption a week.
 * Same rule as POST /insights/spotlight/seen.
 */
const recordNudgeShown = async (userId, nudgeKey) => {
    await pool.query(
        `INSERT INTO user_preferences (user_id, checkin_last_shown_at)
         VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET checkin_last_shown_at = NOW()`,
        [userId]
    );

    await pool.query(
        `INSERT INTO nudge_history (user_id, nudge_key, last_shown_at, shown_count)
         VALUES ($1, $2, NOW(), 1)
         ON CONFLICT (user_id, nudge_key) DO UPDATE
            SET last_shown_at = NOW(),
                -- The SET target must NOT be table-qualified; the reference on
                -- the right must be. Qualifying the left reads as a column
                -- named "nudge_history" and the whole statement 500s.
                shown_count = nudge_history.shown_count + 1`,
        [userId, nudgeKey]
    );
};

const setCheckinEnabled = async (userId, enabled) => {
    await pool.query(
        `INSERT INTO user_preferences (user_id, checkin_enabled)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET checkin_enabled = EXCLUDED.checkin_enabled`,
        [userId, enabled]
    );
};

// ============ CARD PAYMENT DUE DATES ============

/**
 * Columns for a due-date reminder, resolved against whichever target it names.
 *
 * `needs_relink` distinguishes "this card was disconnected" from "this reminder
 * is fine", the same signal goals carry. The reminder itself is kept either
 * way — it is keyed on the Plaid string id, so reconnecting the same card finds
 * its due date again rather than making the user re-enter it.
 */
const CARD_DUE_COLUMNS = `
    d.id, d.target_type, d.plaid_account_id, d.custom_debt_id,
    d.due_day, d.lead_days, d.reminder_hour, d.enabled, d.created_at,
    COALESCE(a.name, cd.name) AS card_name,
    a.mask AS account_mask,
    COALESCE(a.current_balance, cd.balance)::float AS balance,
    a.credit_limit::float AS credit_limit,
    cd.min_payment::float AS min_payment,
    (d.target_type = 'plaid_account' AND a.id IS NULL) AS needs_relink`;

// `user_id` on both joins is the authorisation: a row naming an id that is not
// this user's joins to nothing and reads as unlinked, never as someone else's
// balance. Same rule as GOAL_FROM.
const CARD_DUE_FROM = `
    FROM card_due_dates d
    LEFT JOIN accounts a
        ON a.user_id = d.user_id AND a.plaid_account_id = d.plaid_account_id
    LEFT JOIN custom_debts cd
        ON cd.id = d.custom_debt_id AND cd.user_id = d.user_id`;

const getCardDueDates = async (userId) => {
    const result = await pool.query(
        `SELECT ${CARD_DUE_COLUMNS} ${CARD_DUE_FROM}
         WHERE d.user_id = $1
         ORDER BY d.due_day, LOWER(COALESCE(a.name, cd.name, ''))`,
        [userId]
    );
    return result.rows;
};

const getCardDueDateById = async (userId, id) => {
    const result = await pool.query(
        `SELECT ${CARD_DUE_COLUMNS} ${CARD_DUE_FROM}
         WHERE d.user_id = $1 AND d.id = $2`,
        [userId, id]
    );
    return result.rows[0] || null;
};

const countCardDueDates = async (userId) => {
    const result = await pool.query(
        'SELECT COUNT(*)::int AS n FROM card_due_dates WHERE user_id = $1',
        [userId]
    );
    return result.rows[0].n;
};

/** Confirm a custom debt belongs to this user before a reminder can name it. */
const _resolveOwnedCustomDebt = async (userId, customDebtId) => {
    const result = await pool.query(
        'SELECT id, name FROM custom_debts WHERE user_id = $1 AND id = $2',
        [userId, customDebtId]
    );
    return result.rows[0] || null;
};

/**
 * Create or update the reminder for one card.
 *
 * Upsert rather than separate create/update endpoints: there is at most one
 * reminder per card, so "set the due date for this card" is the only operation
 * the UI ever needs, and a client that lost track of whether a row exists
 * cannot produce a duplicate.
 *
 * The ON CONFLICT targets have to repeat the partial indexes' WHERE clauses —
 * Postgres matches a partial index by its predicate, and without them this
 * silently falls back to raising the violation instead of updating.
 */
const upsertCardDueDate = async (userId, fields) => {
    const {
        targetType,
        plaidAccountId = null,
        customDebtId = null,
        dueDay,
        leadDays = 3,
        reminderHour = 9,
        enabled = true,
    } = fields;

    const conflict = targetType === 'plaid_account'
        ? '(user_id, plaid_account_id) WHERE plaid_account_id IS NOT NULL'
        : '(user_id, custom_debt_id) WHERE custom_debt_id IS NOT NULL';

    const result = await pool.query(
        `INSERT INTO card_due_dates
            (user_id, target_type, plaid_account_id, custom_debt_id,
             due_day, lead_days, reminder_hour, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ${conflict} DO UPDATE
            SET due_day = EXCLUDED.due_day,
                lead_days = EXCLUDED.lead_days,
                reminder_hour = EXCLUDED.reminder_hour,
                enabled = EXCLUDED.enabled,
                updated_at = NOW()
         RETURNING id`,
        [
            userId,
            targetType,
            targetType === 'plaid_account' ? String(plaidAccountId) : null,
            targetType === 'custom_debt' ? customDebtId : null,
            dueDay,
            leadDays,
            reminderHour,
            enabled,
        ]
    );

    return getCardDueDateById(userId, result.rows[0].id);
};

const deleteCardDueDate = async (userId, id) => {
    const result = await pool.query(
        'DELETE FROM card_due_dates WHERE user_id = $1 AND id = $2 RETURNING id',
        [userId, id]
    );
    return result.rows.length > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Insight tracking — recurrence and cost of inaction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thresholds for showing a cost-of-inaction figure.
 *
 * These exist to stop the app saying something true but ridiculous. On day one
 * of a $340/year insight the arithmetic gives "$0.93 forgone", which reads as a
 * gimmick and costs the number all its credibility for the day it actually
 * matters. Two sightings and two weeks is the point where "you have been
 * sitting on this" is a fair thing to say.
 */
const COST_MIN_OCCURRENCES = 2;
const COST_MIN_DAYS = 14;

/** Days a single insight is left alone after being shown as a pop-up. */
const SPOTLIGHT_INSIGHT_COOLDOWN_DAYS = 14;
/** Days before the user may be interrupted by any pop-up again. */
const SPOTLIGHT_USER_COOLDOWN_DAYS = 7;
/** Below this annual figure an interruption is not worth the user's attention. */
const SPOTLIGHT_MIN_BENEFIT = 100;

const OUTSTANDING_DAYS_SQL = '(EXTRACT(EPOCH FROM (NOW() - t.first_seen_at)) / 86400.0)';

/**
 * The benefit the cost figure is calculated from.
 *
 * LEAST of the first and latest quotes, floored at zero. The model requotes the
 * benefit each cycle as balances move, and applying a figure that grew last
 * week to the whole elapsed period would overstate what the user gave up. A
 * number presented as "what this cost you" only survives contact with a
 * sceptical user if it is never the flattering reading.
 */
const EFFECTIVE_BENEFIT_SQL =
    'GREATEST(0, LEAST(t.first_annual_benefit, t.annual_benefit))';

const COST_OF_INACTION_SQL = `
    CASE
        WHEN t.acted_at IS NOT NULL THEN NULL
        WHEN t.occurrence_count < ${COST_MIN_OCCURRENCES} THEN NULL
        WHEN ${OUTSTANDING_DAYS_SQL} < ${COST_MIN_DAYS} THEN NULL
        WHEN ${EFFECTIVE_BENEFIT_SQL} <= 0 THEN NULL
        ELSE ROUND((${EFFECTIVE_BENEFIT_SQL} * ${OUTSTANDING_DAYS_SQL} / 365.0)::numeric, 2)
    END`;

const TRACKING_COLUMNS = `
    t.fingerprint,
    t.insight_type,
    t.subject,
    t.title,
    t.first_seen_at,
    t.last_seen_at,
    t.occurrence_count,
    t.acted_at,
    t.spotlighted_at,
    t.annual_benefit::float AS annual_benefit,
    FLOOR(${OUTSTANDING_DAYS_SQL})::int AS outstanding_days,
    ${COST_OF_INACTION_SQL}::float AS cost_of_inaction`;

/**
 * Record that these insights were shown, once per generation.
 *
 * `occurrence_count` only advances when the previous sighting was more than 20
 * hours ago, so pulling to refresh five times in a row counts as one. The count
 * means "days we told you", and it gates the cost figure — letting a refresh
 * button inflate it would let the user manufacture their own guilt trip.
 */
const recordInsightSightings = async (userId, insights) => {
    if (!Array.isArray(insights) || insights.length === 0) return 0;

    const rows = insights.filter((i) => i && typeof i.fingerprint === 'string' && i.fingerprint);
    if (rows.length === 0) return 0;

    const result = await pool.query(
        `INSERT INTO insight_tracking
             (user_id, fingerprint, insight_type, subject, title,
              first_annual_benefit, annual_benefit)
         SELECT $1, f, ty, su, ti, be, be
         FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[])
              AS x(f, ty, su, ti, be)
         ON CONFLICT (user_id, fingerprint) DO UPDATE SET
             insight_type = EXCLUDED.insight_type,
             subject = EXCLUDED.subject,
             title = EXCLUDED.title,
             annual_benefit = EXCLUDED.annual_benefit,
             last_seen_at = NOW(),
             -- A condition that resolved and later came back starts a new clock.
             -- The gap was not time the user spent ignoring anything, and
             -- carrying the old first_seen_at across it would bill them for it.
             first_seen_at = CASE
                 WHEN insight_tracking.resolved_at IS NOT NULL THEN NOW()
                 ELSE insight_tracking.first_seen_at
             END,
             first_annual_benefit = CASE
                 WHEN insight_tracking.resolved_at IS NOT NULL THEN EXCLUDED.first_annual_benefit
                 ELSE insight_tracking.first_annual_benefit
             END,
             occurrence_count = CASE
                 WHEN insight_tracking.resolved_at IS NOT NULL THEN 1
                 ELSE insight_tracking.occurrence_count + CASE
                     WHEN insight_tracking.last_seen_at < NOW() - INTERVAL '20 hours' THEN 1
                     ELSE 0
                 END
             END,
             acted_at = CASE
                 WHEN insight_tracking.resolved_at IS NOT NULL THEN NULL
                 ELSE insight_tracking.acted_at
             END,
             resolved_at = NULL,
             updated_at = NOW()`,
        [
            userId,
            rows.map((i) => i.fingerprint),
            rows.map((i) => i.type || 'other'),
            rows.map((i) => i.subject || 'general'),
            rows.map((i) => (i.title || '').slice(0, 200)),
            rows.map((i) => Number(i.potential_benefit?.annual_savings) || 0),
        ]
    );
    return result.rowCount;
};

/**
 * Mark everything the latest generation did NOT produce as resolved.
 *
 * Guarded against an empty batch: an empty array would resolve the user's
 * entire history, so a failed or filtered-to-nothing generation must be treated
 * as "no information", not as "everything is fixed".
 */
const markInsightsResolved = async (userId, activeFingerprints) => {
    if (!Array.isArray(activeFingerprints) || activeFingerprints.length === 0) return 0;

    const result = await pool.query(
        `UPDATE insight_tracking
         SET resolved_at = NOW(), updated_at = NOW()
         WHERE user_id = $1
           AND resolved_at IS NULL
           AND NOT (fingerprint = ANY($2::text[]))`,
        [userId, activeFingerprints]
    );
    return result.rowCount;
};

/**
 * Everything still outstanding for a user, worst first.
 *
 * Feeds the prompt's ALREADY OUTSTANDING block so the model knows what it has
 * already said, and can lead with what changed instead of restating it.
 */
const getOutstandingInsights = async (userId, limit = 10) => {
    const result = await pool.query(
        `SELECT ${TRACKING_COLUMNS}
         FROM insight_tracking t
         WHERE t.user_id = $1
           AND t.resolved_at IS NULL
           AND t.acted_at IS NULL
         ORDER BY ${OUTSTANDING_DAYS_SQL} DESC
         LIMIT $2`,
        [userId, limit]
    );
    return result.rows;
};

/** Tracking rows for a set of fingerprints, keyed by fingerprint. */
const getInsightTracking = async (userId, fingerprints) => {
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) return {};

    const result = await pool.query(
        `SELECT ${TRACKING_COLUMNS}
         FROM insight_tracking t
         WHERE t.user_id = $1 AND t.fingerprint = ANY($2::text[])`,
        [userId, fingerprints]
    );

    return Object.fromEntries(result.rows.map((row) => [row.fingerprint, row]));
};

/**
 * Record that the user acted on an insight.
 *
 * This stops the cost counter. We cannot verify they followed through — only
 * that they tapped the button — but continuing to tell someone they are
 * ignoring advice they visibly engaged with is worse than under-counting.
 */
const markInsightActed = async (userId, fingerprint) => {
    const result = await pool.query(
        `UPDATE insight_tracking
         SET acted_at = COALESCE(acted_at, NOW()), updated_at = NOW()
         WHERE user_id = $1 AND fingerprint = $2
         RETURNING id`,
        [userId, fingerprint]
    );
    return result.rowCount > 0;
};

/**
 * The one insight worth interrupting the user for, or null.
 *
 * Requires a second sighting on purpose: a brand-new insight is already sitting
 * on the Insights tab, and interrupting someone to show them something they
 * have not had a chance to see yet is just noise. An interruption is earned by
 * persistence plus money, which is also exactly what the pop-up is there to say.
 */
const getSpotlightCandidate = async (userId) => {
    const result = await pool.query(
        `SELECT ${TRACKING_COLUMNS}
         FROM insight_tracking t
         LEFT JOIN user_insight_dismissals d
                ON d.user_id = t.user_id
               AND d.insight_fingerprint = t.fingerprint
               AND (d.remind_after IS NULL OR d.remind_after > NOW())
         WHERE t.user_id = $1
           AND t.resolved_at IS NULL
           AND t.acted_at IS NULL
           AND d.id IS NULL
           AND t.occurrence_count >= $2
           AND ${EFFECTIVE_BENEFIT_SQL} >= $3
           AND (t.spotlighted_at IS NULL
                OR t.spotlighted_at < NOW() - ($4 || ' days')::interval)
         ORDER BY ${EFFECTIVE_BENEFIT_SQL} * ${OUTSTANDING_DAYS_SQL} DESC
         LIMIT 1`,
        [userId, COST_MIN_OCCURRENCES, SPOTLIGHT_MIN_BENEFIT, String(SPOTLIGHT_INSIGHT_COOLDOWN_DAYS)]
    );
    return result.rows[0] || null;
};

/** Is the user due a pop-up at all? Honours the opt-out and the global cooldown. */
const isSpotlightDue = async (userId) => {
    const result = await pool.query(
        `SELECT spotlight_enabled,
                spotlight_last_shown_at
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
    );

    // No preferences row is the common case for a new user, not a problem:
    // defaults are "enabled, never shown".
    if (result.rows.length === 0) return true;

    const { spotlight_enabled: enabled, spotlight_last_shown_at: lastShown } = result.rows[0];
    if (enabled === false) return false;
    if (!lastShown) return true;

    const dueAfter = new Date(lastShown).getTime()
        + SPOTLIGHT_USER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() >= dueAfter;
};

/** Stamp both cooldowns: this insight, and this user. */
const markSpotlightShown = async (userId, fingerprint) => {
    await pool.query(
        `UPDATE insight_tracking
         SET spotlighted_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND fingerprint = $2`,
        [userId, fingerprint]
    );
    await pool.query(
        `INSERT INTO user_preferences (user_id, spotlight_last_shown_at)
         VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET spotlight_last_shown_at = NOW()`,
        [userId]
    );
};

/**
 * Fingerprints the user has dismissed or snoozed.
 *
 * `remind_after IS NULL` means dismissed outright; a future `remind_after` is a
 * snooze. This is the read that never existed — the dismiss endpoint has been
 * writing to this table since the feature shipped and nothing has ever looked
 * at it, so dismissing an insight removed it from the screen and it returned on
 * the next generation.
 */
const getActiveDismissals = async (userId) => {
    const result = await pool.query(
        `SELECT insight_fingerprint
         FROM user_insight_dismissals
         WHERE user_id = $1
           AND insight_fingerprint IS NOT NULL
           AND (remind_after IS NULL OR remind_after > NOW())`,
        [userId]
    );
    return new Set(result.rows.map((row) => row.insight_fingerprint));
};

const dismissInsight = async (userId, { insightType, fingerprint, reason = null, remindAfter = null }) => {
    await pool.query(
        `INSERT INTO user_insight_dismissals
             (user_id, insight_type, insight_fingerprint, dismiss_reason, remind_after)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, insight_type, insight_fingerprint)
         DO UPDATE SET dismissed_at = NOW(), dismiss_reason = $4, remind_after = $5`,
        [userId, insightType, fingerprint, reason, remindAfter]
    );
};

module.exports = {
    pool,
    // User operations
    createUser,
    getUserByEmail,
    getUserById,
    getUserByPlaidItemId,
    updateUserPlaidToken,
    setPlaidItemIdIfMissing,
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
    getTransactionsPage,
    countTransactions,
    sumTransactions,
    getTransactionsByAccount,
    updateTransactionNotes,
    deleteTransactionsByPlaidIds,
    // Flag operations
    getFlags,
    getFlagById,
    seedDefaultFlags,
    createFlag,
    updateFlag,
    deleteFlag,
    setFlagAssignments,
    getFlagAnalytics,
    // Goal operations
    getGoals,
    getGoalById,
    createGoal,
    updateGoal,
    deleteGoal,
    addGoalContribution,
    getGoalContributions,
    deleteGoalContribution,
    markGoalMilestones,

    // Check-in nudges
    getCustomDebts,
    getNudgeState,
    recordNudgeShown,
    setCheckinEnabled,

    // Card payment due dates
    getCardDueDates,
    getCardDueDateById,
    countCardDueDates,
    // Ownership resolvers — scoping to user_id is the authorisation for both.
    _resolveOwnedAccount,
    _resolveOwnedCustomDebt,
    upsertCardDueDate,
    deleteCardDueDate,
    // Insight tracking operations
    recordInsightSightings,
    markInsightsResolved,
    getOutstandingInsights,
    getInsightTracking,
    markInsightActed,
    getSpotlightCandidate,
    isSpotlightDue,
    markSpotlightShown,
    getActiveDismissals,
    dismissInsight,
    COST_MIN_OCCURRENCES,
    COST_MIN_DAYS,
    SPOTLIGHT_INSIGHT_COOLDOWN_DAYS,
    SPOTLIGHT_USER_COOLDOWN_DAYS,
    SPOTLIGHT_MIN_BENEFIT,
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

