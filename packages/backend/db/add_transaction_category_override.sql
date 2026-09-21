-- Letting a user correct a category, and remember the correction.
--
-- The category anybody sees is NOT stored: it is derived on every read from
-- Plaid's `category` array by keyword rules and `category_map.js`. So a
-- correction needs somewhere of its own, and it has to be somewhere every
-- consumer can reach -- two of them are SQL aggregates that never call the JS
-- resolver.

-- The correction, as a canonical category name.
--
-- Plaid's `category` array is deliberately NOT overwritten. Keeping it means
-- the derivation still works underneath, the correction is reversible, and the
-- original is there if the mapping improves later. Writing a canonical name
-- into `category[]` would also put a third vocabulary into a column that holds
-- Plaid's taxonomy.
--
-- No CHECK against the category list: it lives in JS (CANONICAL_CATEGORIES) and
-- a copy here would drift. `middleware/validators.js` enforces it, the same way
-- goal icons and types are enforced.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS user_category VARCHAR(50);

-- Partial: corrections are a small fraction of rows, so indexing the NULLs
-- would be most of the index and none of the value.
CREATE INDEX IF NOT EXISTS idx_transactions_user_category
    ON transactions (user_id, user_category)
    WHERE user_category IS NOT NULL;

-- "Apply this to every Pioneer transaction" -- the rule that makes it stick for
-- charges that have not happened yet.
--
-- The rule is also MATERIALISED onto transactions.user_category when it is
-- created and during sync. That is what lets the aggregates read one column
-- with no join: matching merchants needs `normalizeMerchantName`, which is JS,
-- and reimplementing it in SQL would be two implementations of one rule -- how
-- the same keyword ended up in two categories.
CREATE TABLE IF NOT EXISTS merchant_category_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- services/merchant_identity.js merchantKeyFor(): normalised and uppercased,
    -- so PIONEER #0421 and PIONEER #0388 are one merchant and an aliased
    -- merchant cannot split in two on casing.
    merchant_key VARCHAR(255) NOT NULL,

    -- What a person reads. Stored rather than derived from the key, because the
    -- key has already thrown away the casing worth showing: "NETFLIX" is a key,
    -- "Netflix" is what belongs in "Also apply to all Netflix".
    merchant_label VARCHAR(255) NOT NULL,

    category VARCHAR(50) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- One rule per merchant per user. Correcting the same merchant twice updates
-- the rule rather than leaving two that disagree.
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_category_rules_user_merchant
    ON merchant_category_rules (user_id, merchant_key);

COMMENT ON COLUMN transactions.user_category IS
    'User correction of the derived category; NULL means use the derivation. See services/category_map.js effectiveCategory.';
COMMENT ON TABLE merchant_category_rules IS
    'Per-merchant category corrections, materialised onto transactions.user_category at write time';
