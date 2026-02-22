/**
 * LocationIQ Geocoding Service
 *
 * Phase 1 — Free tier, no credit card required.
 * Docs: https://locationiq.com/docs
 *
 * Two functions:
 *   reverseGeocode(lat, lon) → human-readable place name
 *   forwardGeocode(query)    → [{lat, lon, displayName}]
 */

const API_KEY =
  process.env.EXPO_PUBLIC_LOCATIONIQ_KEY ||
  'pk.2af8a240d843d05b6348bc0f131b76ad';

const BASE = 'https://us1.locationiq.com/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  /** Short neighbourhood / suburb / city name — used for fog-cloud labels */
  shortName: string;
}

// ─── In-memory cache (avoids hammering the free-tier limit) ──────────────────

const reverseCache = new Map<string, string>();
const forwardCache = new Map<string, GeocodeResult[]>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Round to 3 decimal places (~111 m) for cache bucketing */
const bucket = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Extract the shortest meaningful name from a LocationIQ reverse-geocode
 * response: neighbourhood → suburb → city_district → city → county
 */
const shortName = (addr: Record<string, string>): string => {
  return (
    addr.neighbourhood ||
    addr.suburb ||
    addr.city_district ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.county ||
    addr.state ||
    ''
  );
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Reverse geocode: GPS coords → human-readable place name.
 *
 * Used to label fog-of-war circles and discovery notifications.
 * Returns an empty string on error (non-blocking — never crashes the caller).
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string> {
  const key = `${bucket(lat)},${bucket(lon)}`;
  if (reverseCache.has(key)) return reverseCache.get(key)!;

  try {
    const url =
      `${BASE}/reverse.php` +
      `?key=${API_KEY}` +
      `&lat=${lat}` +
      `&lon=${lon}` +
      `&format=json` +
      `&addressdetails=1` +
      `&accept-language=en`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`LocationIQ reverse ${res.status}`);
    const json = await res.json();

    const name = shortName(json.address || {}) || json.display_name || '';
    reverseCache.set(key, name);
    return name;
  } catch (e) {
    console.warn('[LocationIQ] reverseGeocode failed silently:', e);
    return '';
  }
}

/**
 * Forward geocode: text query → list of candidate locations.
 *
 * Used by the Place Search bar to navigate the map camera.
 * Returns an empty array on error (non-blocking).
 */
export async function forwardGeocode(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (forwardCache.has(trimmed)) return forwardCache.get(trimmed)!;

  try {
    const url =
      `${BASE}/search.php` +
      `?key=${API_KEY}` +
      `&q=${encodeURIComponent(trimmed)}` +
      `&format=json` +
      `&addressdetails=1` +
      `&limit=5` +
      `&accept-language=en`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`LocationIQ forward ${res.status}`);
    const json: any[] = await res.json();

    const results: GeocodeResult[] = json.map((item) => ({
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name || '',
      shortName: shortName(item.address || {}),
    }));

    forwardCache.set(trimmed, results);
    return results;
  } catch (e) {
    console.warn('[LocationIQ] forwardGeocode failed silently:', e);
    return [];
  }
}
