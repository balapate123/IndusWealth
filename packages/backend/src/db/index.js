const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false, // Required for Render's managed Postgres
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

module.exports = {
    query: (text, params) => pool.query(text, params),
};
