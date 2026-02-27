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
import { getAuthApiUrl } from '../config/api';

// ============================================
// TYPES
// ============================================

export interface AuthUser {
  id: string;           // The user/device ID to send to backend
  authType: 'supabase' | 'device' | 'email';  // How they're authenticated
  isAnonymous: boolean; // True for both anonymous and device-based
  email?: string;       // Email (if authenticated via email/password)
  username?: string;    // Username (if authenticated via email/password)
  profileIcon?: string; // Profile icon ID
  token?: string;       // Session token (for email/password auth)
}

// ============================================
// STORAGE HELPERS (same as ApiService)
// ============================================

const DEVICE_ID_KEY = 'serendipity_device_id';
const SUPABASE_USER_KEY = 'serendipity_supabase_user';
const EMAIL_AUTH_USER_KEY = 'serendipity_email_user';
const EMAIL_AUTH_TOKEN_KEY = 'serendipity_email_token';

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
    // Try email/password auth first (check for stored session)
    const storedUser = await this._initEmailAuth();
    if (storedUser) {
      this.currentUser = storedUser;
      return storedUser;
    }

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
   * Initialize Email/Password Auth (check for stored session)
   */
  private async _initEmailAuth(): Promise<AuthUser | null> {
    try {
      const storedUserJson = await AsyncStorage.getItem(EMAIL_AUTH_USER_KEY);
      const storedToken = await AsyncStorage.getItem(EMAIL_AUTH_TOKEN_KEY);

      if (storedUserJson && storedToken) {
        const userData = JSON.parse(storedUserJson);
        console.log('🔐 Email auth session restored:', userData.username);
        return {
          id: userData.user_id,
          authType: 'email',
          isAnonymous: false,
          email: userData.email,
          username: userData.username,
          profileIcon: userData.profile_icon,
          token: storedToken,
        };
      }

      return null;
    } catch (error) {
      console.log('📱 Email auth restore failed:', error);
      return null;
    }
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
  getAuthType(): 'supabase' | 'device' | 'email' | 'none' {
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
   * Sign up with email/password
   */
  async signup(
    email: string,
    username: string,
    password: string,
    profileIcon: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const apiUrl = getAuthApiUrl();
      // Strip ALL invisible Unicode format/control characters that mobile keyboards
      // inject (zero-width spaces, word joiners, soft hyphens, BOM, etc.).
      // trim() only removes edge whitespace and misses chars injected in the middle.
      const trimmedPassword = password
        .replace(/\p{Cf}/gu, '')        // Unicode Format category (invisible chars)
        .replace(/[\x00-\x1F\x7F]/g, '') // ASCII control chars
        .trim();
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          username: username.toLowerCase().trim(),
          password: trimmedPassword,
          profile_icon: profileIcon,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.detail || 'Sign up failed' };
      }

      const data = await response.json();

      // Store user data and token
      await AsyncStorage.setItem(EMAIL_AUTH_USER_KEY, JSON.stringify({
        user_id: data.user_id,
        email: data.email,
        username: data.username,
        profile_icon: data.profile_icon,
      }));
      await AsyncStorage.setItem(EMAIL_AUTH_TOKEN_KEY, data.token);

      // Update current user
      this.currentUser = {
        id: data.user_id,
        authType: 'email',
        isAnonymous: false,
        email: data.email,
        username: data.username,
        profileIcon: data.profile_icon,
        token: data.token,
      };

      console.log('✅ Sign up successful:', data.username);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Sign up error:', error);
      return { success: false, error: error.message || 'Network error' };
    }
  }

  /**
   * Login with username or email
   */
  async login(
    identifier: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const apiUrl = getAuthApiUrl();
      // Same invisible-char cleaning used at signup — must be identical so the
      // hashed value at login matches the one stored during signup.
      const trimmedPassword = password
        .replace(/\p{Cf}/gu, '')        // Unicode Format category (invisible chars)
        .replace(/[\x00-\x1F\x7F]/g, '') // ASCII control chars
        .trim();
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.toLowerCase().trim(),
          password: trimmedPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.detail || 'Login failed' };
      }

      const data = await response.json();

      // Store user data and token
      await AsyncStorage.setItem(EMAIL_AUTH_USER_KEY, JSON.stringify({
        user_id: data.user_id,
        email: data.email,
        username: data.username,
        profile_icon: data.profile_icon,
      }));
      await AsyncStorage.setItem(EMAIL_AUTH_TOKEN_KEY, data.token);

      // Update current user
      this.currentUser = {
        id: data.user_id,
        authType: 'email',
        isAnonymous: false,
        email: data.email,
        username: data.username,
        profileIcon: data.profile_icon,
        token: data.token,
      };

      console.log('✅ Login successful:', data.username);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Login error:', error);
      return { success: false, error: error.message || 'Network error' };
    }
  }

  /**
   * Check if user is authenticated via email/password
   */
  isEmailAuthenticated(): boolean {
    return this.currentUser?.authType === 'email' && !this.currentUser.isAnonymous;
  }

  /**
   * Get auth token (for email/password auth)
   */
  getAuthToken(): string | null {
    return this.currentUser?.token || null;
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
    } else if (this.currentUser?.authType === 'email') {
      // Clear email auth data
      await AsyncStorage.removeItem(EMAIL_AUTH_USER_KEY);
      await AsyncStorage.removeItem(EMAIL_AUTH_TOKEN_KEY);
    }
    this.currentUser = null;
    this.initPromise = null;
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
