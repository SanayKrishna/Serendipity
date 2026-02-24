/**
 * Auth Service - Handles user identification
 * 
 * HYBRID APPROACH (Backwards Compatible):
 * 1. If Supabase is configured → Use Supabase Anonymous Auth (real UUID)
 * 2. If not configured → Fall back to device ID (current behavior)
 * 
 * WHY THIS MATTERS:
 * - Device ID changes if user clears app data = lost pins
 * - Supabase user ID is permanent and can be linked to email later
 * - You can build "Friends" or "Profiles" without data migration
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_CONFIG, isSupabaseConfigured } from '../config/supabase';

// ============================================
// TYPES
// ============================================

export interface AuthUser {
  id: string;           // The user/device ID to send to backend
  authType: 'supabase' | 'device';  // How they're authenticated
  isAnonymous: boolean; // True for both anonymous and device-based
}

// ============================================
// STORAGE HELPERS (same as ApiService)
// ============================================

const DEVICE_ID_KEY = 'serendipity_device_id';
const SUPABASE_USER_KEY = 'serendipity_supabase_user';

function getStorageItem(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Silently fail
  }
}

// ============================================
// UUID GENERATION (fallback)
// ============================================

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================
// SUPABASE CLIENT (lazy loaded)
// ============================================

let supabaseClient: any = null;

async function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  
  if (!supabaseClient) {
    try {
      // Dynamic import to avoid errors if package not installed
      const { createClient } = await import('@supabase/supabase-js');
      supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch (error) {
      console.log('📱 Supabase not installed, using device ID');
      return null;
    }
  }
  
  return supabaseClient;
}

// ============================================
// AUTH SERVICE
// ============================================

class AuthService {
  private currentUser: AuthUser | null = null;
  private initPromise: Promise<AuthUser> | null = null;

  /**
   * Initialize authentication
   * Returns a user (either from Supabase or device ID)
   */
  async initialize(): Promise<AuthUser> {
    // Prevent multiple initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<AuthUser> {
    // Try Supabase first if configured
    if (isSupabaseConfigured()) {
      const supabaseUser = await this._initSupabase();
      if (supabaseUser) {
        this.currentUser = supabaseUser;
        return supabaseUser;
      }
    }

    // Fall back to device ID
    const deviceUser = this._initDeviceId();
    this.currentUser = deviceUser;
    return deviceUser;
  }

  /**
   * Initialize Supabase Anonymous Auth
   */
  private async _initSupabase(): Promise<AuthUser | null> {
    try {
      const client = await getSupabaseClient();
      if (!client) return null;

      // Check for existing session
      const { data: { session }, error: sessionError } = await client.auth.getSession();

      // Handle stale / already-used refresh token — clear the bad session so
      // the next call creates a fresh anonymous session instead of looping.
      if (sessionError) {
        const msg = sessionError.message || '';
        if (msg.toLowerCase().includes('refresh token') || msg.toLowerCase().includes('already used')) {
          console.log('🔄 Stale refresh token detected — clearing session and re-authenticating...');
          await client.auth.signOut();
        } else {
          console.error('❌ Supabase getSession error:', sessionError.message);
          return null;
        }
      } else if (session?.user) {
        console.log('🔐 Supabase session restored:', session.user.id.substring(0, 8) + '...');
        return {
          id: session.user.id,
          authType: 'supabase',
          isAnonymous: session.user.is_anonymous ?? true,
        };
      }

      // No valid session - sign in anonymously
      const { data, error } = await client.auth.signInAnonymously();
      
      if (error) {
        console.error('❌ Supabase anonymous auth failed:', error.message);
        return null;
      }

      if (data.user) {
        console.log('🔐 Supabase anonymous user created:', data.user.id.substring(0, 8) + '...');
        return {
          id: data.user.id,
          authType: 'supabase',
          isAnonymous: true,
        };
      }

      return null;
    } catch (error) {
      console.log('📱 Supabase auth error, falling back to device ID:', error);
      return null;
    }
  }

  /**
   * Initialize device ID (fallback)
   */
  private _initDeviceId(): AuthUser {
    let deviceId = getStorageItem(DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = generateUUID();
      setStorageItem(DEVICE_ID_KEY, deviceId);
      console.log('🆔 New device ID generated:', deviceId.substring(0, 8) + '...');
    } else {
      console.log('🆔 Using existing device ID:', deviceId.substring(0, 8) + '...');
    }

    return {
      id: deviceId,
      authType: 'device',
      isAnonymous: true,
    };
  }

  /**
   * Get current user (must call initialize first)
   */
  getUser(): AuthUser | null {
    return this.currentUser;
  }

  /**
   * Get user ID for API requests
   */
  getUserId(): string {
    if (!this.currentUser) {
      // Fallback if not initialized
      return getStorageItem(DEVICE_ID_KEY) || generateUUID();
    }
    return this.currentUser.id;
  }

  /**
   * Get auth type for debugging
   */
  getAuthType(): 'supabase' | 'device' | 'none' {
    return this.currentUser?.authType ?? 'none';
  }

  /**
   * Link anonymous user to email (for future use)
   * Call this when user wants to save their profile
   */
  async linkEmail(email: string, password: string): Promise<boolean> {
    if (this.currentUser?.authType !== 'supabase') {
      console.error('❌ Cannot link email: not using Supabase auth');
      return false;
    }

    try {
      const client = await getSupabaseClient();
      if (!client) return false;

      const { error } = await client.auth.updateUser({
        email,
        password,
      });

      if (error) {
        console.error('❌ Link email failed:', error.message);
        return false;
      }

      console.log('✅ Email linked successfully!');
      if (this.currentUser) {
        this.currentUser.isAnonymous = false;
      }
      return true;
    } catch (error) {
      console.error('❌ Link email error:', error);
      return false;
    }
  }

  /**
   * Sign out (for testing)
   */
  async signOut(): Promise<void> {
    if (this.currentUser?.authType === 'supabase') {
      const client = await getSupabaseClient();
      if (client) {
        await client.auth.signOut();
      }
    }
    this.currentUser = null;
    this.initPromise = null;
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
