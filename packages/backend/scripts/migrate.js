const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false, // Required for Render
            },
        }
        : {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
        }
);

// Migration files in execution order
const MIGRATIONS = [
    'init.sql',
    'add_custom_debts.sql',
    'add_user_dob.sql',
    'add_ai_insights.sql',
    'add_ai_categorization.sql',
    'add_account_alias.sql'
];

async function migrate() {
    console.log('Running database migrations...');
    const client = await pool.connect();

    try {
        // Create migrations tracking table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Get list of already executed migrations
        const result = await client.query('SELECT migration_name FROM schema_migrations');
        const executedMigrations = new Set(result.rows.map(row => row.migration_name));

        // Execute each migration if not already run
        for (const migrationFile of MIGRATIONS) {
            if (executedMigrations.has(migrationFile)) {
                console.log(`✓ Skipping ${migrationFile} (already executed)`);
                continue;
            }

            const sqlPath = path.join(__dirname, '../db', migrationFile);

            if (!fs.existsSync(sqlPath)) {
                console.log(`⚠ Warning: ${migrationFile} not found, skipping...`);
                continue;
            }

            const sql = fs.readFileSync(sqlPath, 'utf8');

            console.log(`→ Executing migration: ${migrationFile}...`);
            await client.query(sql);

            // Mark migration as executed
            await client.query(
                'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
                [migrationFile]
            );

            console.log(`✓ Completed: ${migrationFile}`);
        }

        console.log('\n✓ All migrations completed successfully.');
    } catch (err) {
        console.error('✗ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
