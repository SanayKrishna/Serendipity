-- ============================================
-- MIGRATION: Community Broadcast + Personal Diary
-- ============================================
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

-- ============================================
-- 1. ADD ROLE COLUMN TO DEVICES
-- ============================================
-- Add role to `devices` for backward compatibility (legacy auth)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Safely add check constraint to devices
DO $$ BEGIN
    ALTER TABLE devices ADD CONSTRAINT devices_check_role CHECK (role IN ('admin', 'user'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_devices_role ON devices(role);

-- Also add role to `profiles` (Supabase auth profiles table) if present
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        BEGIN
            ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
        EXCEPTION WHEN undefined_column OR duplicate_column THEN
            -- ignore if column already exists
            NULL;
        END;

        BEGIN
            ALTER TABLE profiles ADD CONSTRAINT profiles_check_role CHECK (role IN ('admin', 'user'));
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;

        CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
    END IF;
END $$;

-- ============================================
-- 2. CREATE BROADCASTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS broadcasts (
    id BIGSERIAL PRIMARY KEY,
    community_id TEXT DEFAULT 'default',
    admin_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Admin identifier may refer to either `devices.device_id` (legacy) or `profiles.id` (Supabase)
    CONSTRAINT broadcasts_admin_fkey FOREIGN KEY (admin_id) 
        REFERENCES devices(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_community ON broadcasts(community_id);

-- ============================================
-- 3. CREATE USER_DIARY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_diary (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    pin_id INTEGER NOT NULL,
    rating TEXT NOT NULL CHECK (rating IN ('Good', 'Normal', 'Bad')),
    visit_date TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    
    -- user_id may be a devices.device_id or profiles.id depending on auth mode
    CONSTRAINT diary_user_fkey FOREIGN KEY (user_id) 
        REFERENCES devices(device_id) ON DELETE CASCADE,
    CONSTRAINT diary_pin_fkey FOREIGN KEY (pin_id) 
        REFERENCES pins(id) ON DELETE CASCADE
);

-- FIX: Use AT TIME ZONE 'UTC' to make the expression IMMUTABLE for the index
CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_user_pin_day 
ON user_diary (user_id, pin_id, (CAST(visit_date AT TIME ZONE 'UTC' AS DATE)));

CREATE INDEX IF NOT EXISTS idx_diary_user ON user_diary(user_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_diary_pin ON user_diary(pin_id);

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_diary ENABLE ROW LEVEL SECURITY;

-- BROADCASTS POLICIES
CREATE POLICY "Anyone can view broadcasts"
    ON broadcasts FOR SELECT USING (true);
-- Allow admins stored in either `devices` (legacy) or `profiles` (Supabase)
CREATE POLICY "Only admins can create broadcasts"
    ON broadcasts FOR INSERT
    WITH CHECK (
        (
            EXISTS (
                SELECT 1 FROM devices 
                WHERE devices.device_id = broadcasts.admin_id 
                AND devices.role = 'admin'
            )
        ) OR (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = broadcasts.admin_id
                AND profiles.role = 'admin'
            )
        )
    );

CREATE POLICY "Admins can update their own broadcasts"
    ON broadcasts FOR UPDATE
    USING (
        (
            EXISTS (
                SELECT 1 FROM devices 
                WHERE devices.device_id = broadcasts.admin_id 
                AND devices.role = 'admin'
            )
        ) OR (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = broadcasts.admin_id
                AND profiles.role = 'admin'
            )
        )
    );

CREATE POLICY "Admins can delete their own broadcasts"
    ON broadcasts FOR DELETE
    USING (
        (
            EXISTS (
                SELECT 1 FROM devices 
                WHERE devices.device_id = broadcasts.admin_id 
                AND devices.role = 'admin'
            )
        ) OR (
            EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = broadcasts.admin_id
                AND profiles.role = 'admin'
            )
        )
    );

-- USER_DIARY POLICIES
CREATE POLICY "Users can view their own diary"
    ON user_diary FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can create their own diary entries"
    ON user_diary FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update their own diary entries"
    ON user_diary FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete their own diary entries"
    ON user_diary FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true));

-- ============================================
-- 5. HELPER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION set_current_user(user_device_id TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_device_id, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notes:
-- - This migration ensures backward compatibility between legacy `devices` auth and Supabase `profiles`.
-- - After running this migration, update any Supabase auth hooks to set `app.current_user_id` to the
--   current user's identifier (either `device_id` or `profiles.id`) when making requests that rely on RLS.