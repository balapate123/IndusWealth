/**
 * Single source of truth for database migration order.
 *
 * Consumed by BOTH:
 *   - services/db.js  -> initDb(), which runs on every server boot (i.e. every
 *     Render deploy), so anything listed here is applied automatically on deploy.
 *   - scripts/migrate.js -> the `npm run migrate` CLI, which additionally records
 *     applied migrations in the schema_migrations table.
 *
 * To add a migration: drop the .sql file in this folder and append its filename
 * here in dependency order. Every migration MUST be idempotent (CREATE TABLE/
 * INDEX ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, or DO-block guards) because
 * initDb re-runs the full list on each boot without per-migration tracking.
 *
 * Order below is dependency-safe and matches what has been applied on production;
 * only append new migrations at the end unless a dependency requires otherwise.
 */
module.exports = [
    'init.sql',
    'add_custom_debts.sql',
    'add_user_dob.sql',
    'add_ai_insights.sql',
    'add_ai_categorization.sql',
    'add_account_alias.sql',
    'add_transaction_notes.sql',
    'add_educational_content.sql',
    'add_security_tables.sql',
    'add_feedback_table.sql',
    'add_plaid_refresh_cooldown.sql',
    'add_email_verification.sql',
    'add_insights_upgrade.sql',
    'add_watchdog_tables.sql',
    'add_category_insights.sql',
    'add_transaction_paging_index.sql',
    'add_transaction_flags.sql',
];
