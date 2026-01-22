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

async function migrate() {
    console.log('Running database migrations...');
    const client = await pool.connect();

    try {
        // Read the custom debts migration file
        const sqlPath = path.join(__dirname, '../db/add_custom_debts.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log(`Executing migration from ${sqlPath}...`);
        await client.query(sql);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
