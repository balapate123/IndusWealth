-- Migration: Add date_of_birth column to users table
-- This column stores the user's date of birth for future analytics

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
