-- Migration: 006_add_ghost_pins_and_search.sql
-- Adds a per-device ghost_pins table and a full-text search index on pins.content

-- 1) Create ghost_pins table to record when a device walked near a pin
CREATE TABLE IF NOT EXISTS ghost_pins (
  id SERIAL PRIMARY KEY,
  device_db_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  pin_id INTEGER NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(device_db_id, pin_id)
);

CREATE INDEX IF NOT EXISTS idx_ghost_pins_device ON ghost_pins(device_db_id);

-- 2) Full-text search index on pins.content for faster search queries
-- Uses English configuration; adjust language if necessary for locale-specific text
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_pins_content_tsv'
  ) THEN
    CREATE INDEX idx_pins_content_tsv ON pins USING GIN (to_tsvector('english', content));
  END IF;
END$$;
