/**
 * Supabase Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create a free account (email only, no credit card)
 * 2. Create a new project
 * 3. Go to Settings > API
 * 4. Copy your "Project URL" and "anon public" key
 * 5. Paste them below
 * 
 * WHY SUPABASE AUTH?
 * - Your current device ID is fragile (changes if user clears app data)
 * - Supabase Anonymous Auth gives you a REAL user ID (UUID) in the database
 * - Later, if users want to save their pins, you can "Link" their email to this ID
 * - No data migration needed - the user ID stays the same!
 */

// ============================================
// SUPABASE CONFIGURATION
// ============================================

// Supabase project credentials
export const SUPABASE_CONFIG = {
  // Your Supabase project URL
  url: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://frbtmavtrqnjwqsinyej.supabase.co',
  
  // Your Supabase anon/public key (safe to expose in client code)
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyYnRtYXZ0cnFuandxc2lueWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4OTg2ODcsImV4cCI6MjA4NjQ3NDY4N30.ClwlX-OoiyfFe85p0QctCe6oxdI0pCokZek6I18w4kI',
};

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
    SUPABASE_CONFIG.url.includes('supabase.co')
  );
}
