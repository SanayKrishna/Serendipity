-- Migration 007: Add Users Table for Email/Password Authentication
-- ================================================================
-- This migration adds a users table to support email/password login
-- while maintaining backwards compatibility with device-based authentication.
-- The existing devices table will link to users for authenticated accounts.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(15) UNIQUE NOT NULL,  -- Unique username (alphanumeric, lowercase)
    email VARCHAR(255) UNIQUE NOT NULL,    -- Email address
    password_hash VARCHAR(255) NOT NULL,   -- Bcrypt password hash
    profile_icon VARCHAR(50) DEFAULT 'explorer_01',  -- Selected profile icon ID
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT username_format CHECK (username ~ '^[a-z0-9]{3,15}$'),
    CONSTRAINT email_format CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

-- Add index for fast lookups (use IF NOT EXISTS to be idempotent)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add user_id to devices table (nullable for backwards compatibility)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts with email/password authentication';
COMMENT ON COLUMN users.username IS 'Unique username (3-15 chars, lowercase alphanumeric)';
COMMENT ON COLUMN users.profile_icon IS 'ID of selected profile icon (e.g., explorer_01, fox_02)';
