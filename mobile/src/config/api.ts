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

// Your computer's local IP — reads EXPO_PUBLIC_API_URL from .env first
const LOCAL_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.32:8000';

// Permanent Railway backend URL — no need to update after each restart.
// Set EXPO_PUBLIC_RAILWAY_URL in mobile/.env to your Railway service domain.
// Falls back to the old localtunnel only if the env var is absent.
const TUNNEL_URL = process.env.EXPO_PUBLIC_RAILWAY_URL || 'https://few-trains-care.loca.lt';

// ============================================
// SMART URL SELECTION
// ============================================

// If Railway URL is explicitly configured, prefer it as the default so the
// app works immediately on any network (mobile data, different WiFi, etc.).
// Only fall back to LOCAL_URL if Railway is not configured.
const hasRailwayUrl = !!process.env.EXPO_PUBLIC_RAILWAY_URL;

// Track which URL is currently working
let activeBaseUrl: string = hasRailwayUrl ? TUNNEL_URL : LOCAL_URL;
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
 * Reset to try local URL again (call periodically)
 * Only resets if enough time has passed since last failure
 */
export const resetToLocal = (): void => {
  const COOLDOWN = 60000; // 1 minute cooldown
  if (lastFailedUrl === LOCAL_URL && Date.now() - lastFailTime > COOLDOWN) {
    activeBaseUrl = LOCAL_URL;
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
