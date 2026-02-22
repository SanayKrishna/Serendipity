-- Migration: Add Community Pin Support
-- Created: 2026-02-19
-- Description: Add is_community column to pins table for community/regular pin distinction

-- Add is_community column
ALTER TABLE pins 
ADD COLUMN is_community BOOLEAN DEFAULT FALSE NOT NULL;

-- Add index for community pin queries
CREATE INDEX idx_pins_is_community ON pins(is_community, created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN pins.is_community IS 'TRUE for community pins (visible to all within 10km), FALSE for regular pins (visible within 50m)';
