/**
 * One-time migration script to encrypt existing plaintext Plaid access tokens.
 *
 * Usage:
 *   ENCRYPTION_KEY=<your-64-hex-char-key> node scripts/encrypt-existing-tokens.js
 *
 * This script:
 * 1. Reads all users with non-null plaid_access_token
 * 2. Checks if each token is already encrypted (has "enc:" prefix)
 * 3. Encrypts plaintext tokens and updates the database
 * 4. Reports results
 */

require('dotenv').config();

const { Pool } = require('pg');
const { encrypt, isEncrypted, isEncryptionAvailable } = require('../src/services/encryption');

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME || 'induswealth',
            user: process.env.DB_USER || 'induswealth',
            password: process.env.DB_PASSWORD || 'induswealth123',
        }
);

async function main() {
    if (!isEncryptionAvailable()) {
        console.error('ENCRYPTION_KEY is not set. Cannot encrypt tokens.');
        process.exit(1);
    }

    console.log('Starting Plaid token encryption migration...\n');

    const result = await pool.query(
        `SELECT id, plaid_access_token FROM users WHERE plaid_access_token IS NOT NULL`
    );

    let encrypted = 0;
    let alreadyEncrypted = 0;
    let errors = 0;

    for (const user of result.rows) {
        if (isEncrypted(user.plaid_access_token)) {
            alreadyEncrypted++;
            continue;
        }

        try {
            const encryptedToken = encrypt(user.plaid_access_token);
            await pool.query(
                `UPDATE users SET plaid_access_token = $1, updated_at = NOW() WHERE id = $2`,
                [encryptedToken, user.id]
            );
            encrypted++;
            console.log(`  Encrypted token for user ${user.id}`);
        } catch (err) {
            errors++;
            console.error(`  Failed to encrypt token for user ${user.id}:`, err.message);
        }
    }

    console.log(`\nMigration complete:`);
    console.log(`  Total users with tokens: ${result.rows.length}`);
    console.log(`  Newly encrypted: ${encrypted}`);
    console.log(`  Already encrypted: ${alreadyEncrypted}`);
    console.log(`  Errors: ${errors}`);

    await pool.end();
    process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Migration failed:', err);
    pool.end();
    process.exit(1);
});
