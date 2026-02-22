/**
 * API Service - Handles all communication with the backend
 * 
 * Features:
 * - HYBRID AUTH: Supabase user ID (if configured) OR device ID (fallback)
 * - Retry logic with exponential backoff
 * - Offline detection and handling
 * - Rate limit (429) response handling
 * - Web compatible (no native-only dependencies)
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import { API_CONFIG, getActiveBaseUrl, switchToFallback, isTunnelActive, resetToLocal } from '../config/api';
import { authService } from './AuthService';

// ============================================
// TYPES
// ============================================

export interface Pin {
  id: number;
  content: string;
  created_at: string;
  expires_at: string;
  likes: number;
  dislikes: number;
  is_active: boolean;
}

export interface DiscoveredPin {
  id: number;
  content: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  likes: number;
  dislikes: number;
  reports: number;
  passes_by: number;
  is_suppressed: boolean;
  is_community?: boolean;
  expires_at: string;
}

export interface DiscoverResponse {
  pins: DiscoveredPin[];
  count: number;
  message: string;
}

export interface CreatePinRequest {
  content: string;
  lat: number;
  lon: number;
  is_community?: boolean;
  duration_hours?: number; // 1–168 hours; defaults to 24 on backend
}

export interface LikeResponse {
  id: number;
  likes: number;
  dislikes: number;
  reports: number;
  is_suppressed: boolean;
  expires_at: string;
  extended: boolean;
  message: string;
}

export interface UserStats {
  liked_count: number;
  disliked_count: number;
  pins_created: number;
  pins_discovered: number;
  communities_created: number;
  message: string;
}

export interface PinStatsResponse {
  id: number;
  likes: number;
  dislikes: number;
  passes_by: number;
  is_active: boolean;
  expires_at: string;
  expired: boolean; // True when pin timer hit zero
}

export interface CommunityStats {
  total_community_pins: number;
  user_community_pins: number;
  message: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
  isRateLimited: boolean;
  isOffline: boolean;
  retryAfter?: number;
}

// ============================================
// DEVICE ID MANAGEMENT
// ============================================

const DEVICE_ID_KEY = 'serendipity_device_id';

/**
 * Get item from storage (works on web and native)
 */
function getStorageItem(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    // For native, we'll just use a memory-based fallback
    return null;
  } catch {
    return null;
  }
}

/**
 * Set item in storage (works on web and native)
 */
function setStorageItem(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create a unique device ID
 * This ID is used for rate limiting and interaction tracking
 */
function getDeviceId(): string {
  // Try to get existing device ID from storage
  let deviceId = getStorageItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate a new device ID
    deviceId = generateUUID();
    
    // Persist the device ID
    setStorageItem(DEVICE_ID_KEY, deviceId);
    console.log('🆔 New device ID generated:', deviceId.substring(0, 8) + '...');
  }
  
  return deviceId;
}

// ============================================
// RETRY LOGIC
// ============================================

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if we should retry the request
 */
function shouldRetry(error: AxiosError, retryCount: number): boolean {
  if (retryCount >= MAX_RETRIES) return false;
  
  // Don't retry client errors (except timeout and network errors)
  if (error.response) {
    const status = error.response.status;
    // Retry server errors (5xx) and rate limits (429)
    return status >= 500 || status === 429;
  }
  
  // Retry network errors and timeouts
  return error.code === 'ECONNABORTED' || error.message.includes('Network Error');
}

// ============================================
// API SERVICE CLASS
// ============================================

class ApiService {
  private client: AxiosInstance;
  private userId: string;
  private authInitialized: boolean = false;

  constructor() {
    // Initialize with device ID synchronously (AuthService will upgrade if Supabase is configured)
    this.userId = getDeviceId();

    this.client = axios.create({
      baseURL: getActiveBaseUrl(),
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        // Required to bypass localtunnel's interstitial page
        'bypass-tunnel-reminder': 'true',
      },
    });

    // Initialize auth asynchronously (upgrades to Supabase if available)
    this._initAuth();

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Always use the current active URL (handles fallback switching)
        config.baseURL = getActiveBaseUrl();
        
        // Add user ID header (works for both Supabase and device ID)
        if (this.userId) {
          config.headers['X-Device-ID'] = this.userId;
          // Also send auth type for backend to know
          config.headers['X-Auth-Type'] = authService.getAuthType();
        }
        
        // Always include bypass header for tunnel URLs
        config.headers['bypass-tunnel-reminder'] = 'true';
        
        console.log(`📡 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.status}`);
        return response;
      },
      (error: AxiosError) => {
        console.error('❌ Response Error:', error.message);
        return Promise.reject(this.transformError(error));
      }
    );
  }

  /**
   * Initialize authentication asynchronously
   * Upgrades from device ID to Supabase if configured
   */
  private async _initAuth(): Promise<void> {
    if (this.authInitialized) return;
    
    try {
      const user = await authService.initialize();
      this.userId = user.id;
      this.authInitialized = true;
      console.log(`🔐 Auth initialized: ${user.authType} (${user.id.substring(0, 8)}...)`);
    } catch (error) {
      console.log('📱 Auth init failed, using device ID:', error);
      // Keep using device ID (already set in constructor)
    }
  }

  /**
   * Transform Axios error into a friendly ApiError
   */
  private transformError(error: AxiosError): ApiError {
    const isOffline = !error.response && (
      error.message.includes('Network Error') ||
      error.code === 'ECONNABORTED'
    );

    const statusCode = error.response?.status || 0;
    const isRateLimited = statusCode === 429;
    
    let message = 'An unexpected error occurred';
    let retryAfter: number | undefined;

    if (isOffline) {
      if (error.code === 'ECONNABORTED') {
        message = 'Connection timed out. The backend server may be down or the URL is wrong.';
      } else {
        message = 'Cannot reach the backend. Set EXPO_PUBLIC_RAILWAY_URL in mobile/.env to your Railway URL.';
      }
    } else if (isRateLimited) {
      message = 'Too many requests. Please slow down!';
      // Extract retry-after header if present
      const retryHeader = error.response?.headers['retry-after'];
      if (retryHeader) {
        retryAfter = parseInt(retryHeader, 10);
      }
    } else if (error.response?.data) {
      const data = error.response.data as any;
      message = data.detail || data.message || message;
    }

    return {
      message,
      statusCode,
      isRateLimited,
      isOffline,
      retryAfter,
    };
  }

  /**
   * Execute request with retry logic + automatic URL fallback
   * If primary URL fails, switches to fallback and retries
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    retryCount = 0,
    hasTriedFallback = false
  ): Promise<T> {
    try {
      // Periodically try to reset to local URL (faster)
      resetToLocal();
      return await requestFn();
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // If we get a 503 or network error, try the fallback URL first
      const is503 = axiosError.response?.status === 503;
      const isNetworkError = !axiosError.response && (
        axiosError.message.includes('Network Error') ||
        axiosError.code === 'ECONNABORTED'
      );
      
      if ((is503 || isNetworkError) && !hasTriedFallback) {
        const newUrl = switchToFallback();
        console.log(`🔄 Primary URL failed, switching to fallback: ${newUrl}`);
        return this.executeWithRetry(requestFn, 0, true);
      }
      
      if (shouldRetry(axiosError, retryCount)) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`🔄 Retrying request in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return this.executeWithRetry(requestFn, retryCount + 1, hasTriedFallback);
      }
      
      throw error;
    }
  }

  /**
   * Health check - verify API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get(API_CONFIG.ENDPOINTS.HEALTH);
      return response.data.success === true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Discover pins within 50 meters of current location
   */
  async discoverPins(lat: number, lon: number): Promise<DiscoverResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<DiscoverResponse>(
        API_CONFIG.ENDPOINTS.DISCOVER,
        {
          params: { lat, lon },
        }
      );
      return response.data;
    });
  }

  /**
   * Create a new pin at the current location
   */
  async createPin(data: CreatePinRequest): Promise<Pin> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<Pin>(
        API_CONFIG.ENDPOINTS.PIN,
        data
      );
      return response.data;
    });
  }

  /**
   * Like a pin
   */
  async likePin(pinId: number): Promise<LikeResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<LikeResponse>(
        API_CONFIG.ENDPOINTS.LIKE(pinId)
      );
      return response.data;
    });
  }

  /**
   * Dislike a pin
   */
  async dislikePin(pinId: number): Promise<LikeResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<LikeResponse>(
        API_CONFIG.ENDPOINTS.DISLIKE(pinId)
      );
      return response.data;
    });
  }

  /**
   * Report a pin for safety concerns (spam, scam, inappropriate)
   */
  async reportPin(pinId: number): Promise<LikeResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.post<LikeResponse>(
        `/pin/${pinId}/report`
      );
      return response.data;
    });
  }

  /**
   * Get all pins (development only)
   */
  async getAllPins(): Promise<Pin[]> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<Pin[]>(API_CONFIG.ENDPOINTS.ALL_PINS);
      return response.data;
    });
  }

  /**
   * Get user statistics (liked/disliked/created counts)
   */
  async getUserStats(): Promise<UserStats> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<UserStats>('/user/stats');
      return response.data;
    });
  }

  /**
   * Get community statistics (total and user's community pins)
   */
  async getCommunityStats(): Promise<CommunityStats> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<CommunityStats>('/community/stats');
      return response.data;
    });
  }

  /**
   * Silently record that a user walked within 20m of a pin but never opened it.
   * Called by LocationService when the user exits the 20m zone without interacting.
   * Fire-and-forget: errors are swallowed so it never interrupts the user.
   */
  async recordPassBy(pinId: number): Promise<void> {
    try {
      await this.client.post(`/pin/${pinId}/passby`);
    } catch {
      // Intentionally silent — pass-by is a background metric
    }
  }

  /**
   * Fetch live stats for a specific pin (Diary sync button).
   * The server enforces a 30-second cooldown per (device, pin) pair and returns
   * an `expired` flag if the pin's timer just hit zero.
   */
  async getPinStats(pinId: number): Promise<PinStatsResponse> {
    return this.executeWithRetry(async () => {
      const response = await this.client.get<PinStatsResponse>(`/pin/${pinId}/stats`);
      return response.data;
    });
  }

  /**
   * Check if an error indicates offline status
   */
  isOfflineError(error: unknown): boolean {
    return (error as ApiError).isOffline === true;
  }

  /**
   * Check if an error indicates rate limiting
   */
  isRateLimitError(error: unknown): boolean {
    return (error as ApiError).isRateLimited === true;
  }

  /**
   * Get the user/device ID (for display/debugging)
   */
  getDeviceIdPreview(): string {
    if (!this.userId) return 'Not initialized';
    return `${this.userId.substring(0, 8)}...`;
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
