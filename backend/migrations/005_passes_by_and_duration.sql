-- ============================================
-- MIGRATION 005: passes_by counter + variable pin duration
-- ============================================
-- Run this in your Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste this → Run
-- ============================================

-- 1. Add passes_by counter to pins table
--    This records how many users walked within 20m but never opened the pin.
ALTER TABLE pins ADD COLUMN IF NOT EXISTS passes_by INTEGER NOT NULL DEFAULT 0;

-- Index so creator's diary can quickly sum pass-bys for their pins
CREATE INDEX IF NOT EXISTS idx_pins_passes_by ON pins(id) WHERE passes_by > 0;

-- 2. Widen expires_at to support durations from 1h up to 168h (7 days).
--    The column type is already TIMESTAMPTZ or TIMESTAMP so no type change needed.
--    The backend now accepts a `duration_hours` field and sets expires_at accordingly.
--    Nothing to change in the DB schema for this — it's entirely backend-driven.

-- 3. Verify the column was added successfully
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pins' AND column_name = 'passes_by';
