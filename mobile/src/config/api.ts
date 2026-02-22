/**
 * API Configuration
 * 
 * Smart URL Resolution:
 * - LOCAL_URL: Used when phone is on same WiFi as your computer (fast, direct)
 * - TUNNEL_URL: Used when phone is on mobile data (public URL via localtunnel)
 * - Auto-fallback: If local fails, automatically tries tunnel and vice versa
 */
import { Platform } from 'react-native';

// ============================================
// SERVER URLS - Update these when they change
// ============================================

// Railway backend — the permanent public URL. Hardcoded as a safe fallback so
// production builds always reach the server regardless of env var availability.
// EAS cloud builds don't read local .env files, so we must hardcode the default.
const RAILWAY_URL = 'https://web-production-63809.up.railway.app';

// Permanent Railway backend URL — env var overrides hardcoded default if set.
const TUNNEL_URL = process.env.EXPO_PUBLIC_RAILWAY_URL || RAILWAY_URL;

// Your computer's local IP — only used when explicitly set via env var for local dev.
const LOCAL_URL = process.env.EXPO_PUBLIC_API_URL || RAILWAY_URL;

// ============================================
// SMART URL SELECTION
// ============================================

// Always default to Railway (public backend) so the app works on any network.
// LOCAL_URL is only preferred when EXPO_PUBLIC_API_URL is explicitly set to a
// local address AND we're not on a production build.
const isLocalDev = !!(process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.includes('192.168'));

// Track which URL is currently working
let activeBaseUrl: string = isLocalDev ? LOCAL_URL : TUNNEL_URL;
let lastFailedUrl: string | null = null;
let lastFailTime: number = 0;

/**
 * Get the primary base URL
 * Tries local first (faster), falls back to tunnel
 */
const getBaseUrl = (): string => {
  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }
  return activeBaseUrl;
};

/**
 * Get the fallback URL (the one we're NOT currently using)
 */
export const getFallbackUrl = (): string => {
  return activeBaseUrl === LOCAL_URL ? TUNNEL_URL : LOCAL_URL;
};

/**
 * Switch to fallback URL when current one fails
 * Returns the new URL to try
 */
export const switchToFallback = (): string => {
  const fallback = getFallbackUrl();
  console.log(`🔄 Switching API from ${activeBaseUrl} to ${fallback}`);
  lastFailedUrl = activeBaseUrl;
  lastFailTime = Date.now();
  activeBaseUrl = fallback;
  return activeBaseUrl;
};

/**
 * Reset to try Railway URL again (call periodically)
 * Only resets if enough time has passed since last failure
 */
export const resetToLocal = (): void => {
  const COOLDOWN = 60000; // 1 minute cooldown
  if (lastFailedUrl === TUNNEL_URL && Date.now() - lastFailTime > COOLDOWN) {
    activeBaseUrl = TUNNEL_URL;
    lastFailedUrl = null;
  }
};

/**
 * Get the current active base URL
 */
export const getActiveBaseUrl = (): string => activeBaseUrl;

/**
 * Check if current URL is the tunnel
 */
export const isTunnelActive = (): boolean => activeBaseUrl === TUNNEL_URL;

export const API_CONFIG = {
  BASE_URL: getBaseUrl(),
  LOCAL_URL,
  TUNNEL_URL,
  ENDPOINTS: {
    DISCOVER: '/discover',
    PIN: '/pin',
    LIKE: (id: number) => `/pin/${id}/like`,
    DISLIKE: (id: number) => `/pin/${id}/dislike`,
    ALL_PINS: '/pins/all',
    HEALTH: '/health',
  },
  DISCOVERY_RADIUS: 50,
  HEARTBEAT_INTERVAL: 10000,
  DISTANCE_THRESHOLD: 20,
};
