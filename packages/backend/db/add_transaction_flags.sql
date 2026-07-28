-- User-defined flags ("Home", "Work", "Trip to Montreal") that a user attaches
-- to their own transactions, independent of the Plaid/AI-derived `category`.
--
-- Deliberately separate from category: a category is inferred and single-valued,
-- a flag is chosen by the user and a transaction can carry several (an apartment
-- grocery run is both "Home" and "Groceries" — but Groceries is the category, so
-- the two never compete for the same slot).

CREATE TABLE IF NOT EXISTS transaction_flags (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(40) NOT NULL,
    -- A slot in the active theme's validated 7-hue ramp, NOT a hex. Dark and
    -- light resolve different ramps from the same index; a stored hex would be
    -- illegible in one of the two modes. See mobile constants/tokens.js.
    color_index SMALLINT NOT NULL DEFAULT 0 CHECK (color_index >= 0),
    -- Ionicons name. The icon is the secondary encoding that keeps two flags
    -- apart when they land on the same hue, which is what keeps the palette
    -- colour-blind safe once a user has more flags than the ramp has colours.
    icon VARCHAR(40) NOT NULL DEFAULT 'pricetag',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Case-insensitive uniqueness per user: "Home" and "home" are the same flag, and
-- letting both exist would silently split a total across two rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_flags_user_name
    ON transaction_flags (user_id, LOWER(name));

-- Many-to-many. Keyed on the transaction's internal id, which is stable across
-- syncs: upsertTransactions uses ON CONFLICT (user_id, plaid_transaction_id)
-- DO UPDATE, so a re-sync updates the row in place and links survive — the same
-- reason user notes survive. Disconnecting a bank deletes the transactions and
-- cascades the links away, which is the behaviour we want.
CREATE TABLE IF NOT EXISTS transaction_flag_links (
    flag_id        INTEGER NOT NULL REFERENCES transaction_flags(id) ON DELETE CASCADE,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id)      ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (flag_id, transaction_id)
);

-- The PK covers "which transactions carry this flag". This covers the reverse —
-- "which flags does this transaction carry" — which the transaction list runs
-- once per row to draw its colour dots.
CREATE INDEX IF NOT EXISTS idx_flag_links_transaction
    ON transaction_flag_links (transaction_id);

-- Stamped the first time a user's starter flags are created. Without it, a user
-- who deletes every flag would have the defaults handed back on their next load.
ALTER TABLE users ADD COLUMN IF NOT EXISTS flags_seeded_at TIMESTAMP WITH TIME ZONE;
