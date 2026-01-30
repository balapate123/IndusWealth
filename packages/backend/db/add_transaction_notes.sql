-- Add notes column to transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add updated_at column to track manual edits
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create index for notes search (optional, for future full-text search)
CREATE INDEX IF NOT EXISTS idx_transactions_notes ON transactions USING GIN (to_tsvector('english', notes));

-- Comments for documentation
COMMENT ON COLUMN transactions.notes IS 'User-added notes for transaction context';
