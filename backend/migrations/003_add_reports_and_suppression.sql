-- Migration: Add Reports and Visual Suppression
-- Description: Adds report tracking and visual suppression formula (reports > likes * 2)
-- Date: 2026-02-15

-- Add reports column to pins table
ALTER TABLE pins 
ADD COLUMN IF NOT EXISTS reports INTEGER DEFAULT 0 NOT NULL;

-- Add is_suppressed column to pins table
ALTER TABLE pins
ADD COLUMN IF NOT EXISTS is_suppressed BOOLEAN DEFAULT FALSE NOT NULL;

-- Add index for suppression queries
CREATE INDEX IF NOT EXISTS idx_pins_suppressed ON pins(is_suppressed);

-- Update pin_interactions to support 'report' type
-- (Already supports via STRING(10), no schema change needed)

-- Update existing pins to have proper defaults
UPDATE pins 
SET reports = 0, is_suppressed = FALSE 
WHERE reports IS NULL OR is_suppressed IS NULL;

-- Optional: Update default pin expiry to 10 years (permanent landmarks)
-- Note: This only affects NEW pins; existing pins keep their current expiry
-- You can also set this via environment variable PIN_EXPIRY_HOURS=87600
