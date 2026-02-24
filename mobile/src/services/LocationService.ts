/**
 * Location Service - Handles GPS tracking and location-based discovery
 * 
 * The "Serendipity" Logic with Spaced Repetition:
 * - Uses watchPositionAsync to track movement
 * - "Heartbeat" every 10 seconds or 20 meters sends coordinates to backend
 * - Implements spaced repetition: "Good" = 7 days, "Bad" = Muted
 * - Sequential notification delivery with 0.8s "jackpot" delay
 * - Interactive notification buttons (Good/Bad)
 */
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { API_CONFIG } from '../config/api';
import apiService, { DiscoveredPin } from './ApiService';
import pinPreferencesService from './PinPreferencesService';

// Notification category identifier
const PIN_CATEGORY_ID = 'pin-discovery';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export type LocationCallback = (location: LocationCoords) => void;
export type DiscoveryCallback = (pins: DiscoveredPin[]) => void;
export type ErrorCallback = (error: string) => void;

class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastLocation: LocationCoords | null = null;
  // Last position that was actually processed (used for 3m drift gate)
  private lastProcessedLocation: LocationCoords | null = null;
  private lastHeartbeatTime: number = 0;
  private onLocationUpdate: LocationCallback | null = null;
  private onPinsDiscovered: DiscoveryCallback | null = null;
  private onError: ErrorCallback | null = null;
  private isTracking: boolean = false;
  // Track notified pins to prevent spam within same session
  private notifiedPinIds: Set<number> = new Set();
  // Notification response subscription
  private notificationSubscription: Notifications.Subscription | null = null;
  // Pass-by zone tracking: pinId -> entered zone but not yet interacted or exited
  private pinsInPassByZone: Set<number> = new Set();
  // Pins the user has interacted with (opened bottom sheet, liked, etc.) so we skip pass-by
  private interactedPinIds: Set<number> = new Set();

  /**
   * Expose the most recently received GPS position.
   * Drop screen uses this for an instant lock when tracking is already running.
   */
  /** Call this from RadarScreen when the user opens/likes/dislikes/reports a pin */
  markPinInteracted(pinId: number): void {
    this.interactedPinIds.add(pinId);
    this.pinsInPassByZone.delete(pinId); // No longer tracking for pass-by
  }

  /**
   * Request location permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // Request foreground permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        console.log('❌ Foreground location permission denied');
        return false;
      }

      console.log('✅ Location permissions granted');
      return true;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Request notification permissions and set up categories
   */
  async requestNotificationPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status !== 'granted') {
        console.log('❌ Notification permission denied');
        return false;
      }

      // Set up notification categories with action buttons
      await this.setupNotificationCategories();
      
      // Set up notification response listener
      await this.setupNotificationResponseListener();

      console.log('✅ Notification permissions granted with categories');
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Set up notification categories with Good/Bad action buttons
   */
  private async setupNotificationCategories(): Promise<void> {
    try {
      await Notifications.setNotificationCategoryAsync(PIN_CATEGORY_ID, [
        {
          identifier: 'good',
          buttonTitle: '👍 Good',
          options: {
            opensAppToForeground: false, // Don't open app
          },
        },
        {
          identifier: 'bad',
          buttonTitle: '👎 Bad',
          options: {
            opensAppToForeground: false, // Don't open app
          },
        },
      ]);
      console.log('📱 Notification categories configured');
    } catch (error) {
      console.error('Error setting up notification categories:', error);
    }
  }

  /**
   * Set up listener for notification button responses
   */
  private async setupNotificationResponseListener(): Promise<void> {
    // Remove existing subscription if any
    if (this.notificationSubscription) {
      this.notificationSubscription.remove();
    }

    this.notificationSubscription = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const { notification, actionIdentifier } = response;
        const pinId = notification.request.content.data?.pinId as number;

        if (!pinId) return;

        console.log(`📲 User tapped "${actionIdentifier}" on pin ${pinId}`);

        if (actionIdentifier === 'good') {
          // Mark as Good: Notify again in 7 days
          await pinPreferencesService.markGood(pinId);
          
          // Show brief confirmation
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '👍 Marked Good',
              body: "We'll remind you if you're here next week!",
              sound: false,
            },
            trigger: { seconds: 1, type: 'timeInterval' as any, repeats: false },
          });
        } else if (actionIdentifier === 'bad') {
          // Mark as Bad: Mute permanently
          await pinPreferencesService.markBad(pinId);
          
          // Show brief confirmation
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '👎 Marked Bad',
              body: "You won't see notifications for this spot again.",
              sound: false,
            },
            trigger: { seconds: 1, type: 'timeInterval' as any, repeats: false },
          });
        }
      }
    );
  }

  /**
   * Get current location once.
   *
   * Strategy (fastest-first):
   *  0. Return the live-tracking position immediately if RadarScreen tracking is running.
   *  1. Return last-known position if fresh enough (≤ 30 s old, ≤ 100 m accuracy).
   *  2. Race getCurrentPositionAsync (Balanced accuracy) against a 6-second timeout.
   *     If GPS wins → great.  If timeout fires → return last-known (even if slightly stale).
   *  3. IP-based city-level fallback as last resort.
   *
   * This prevents the "Waiting for GPS" spinner from hanging indefinitely on the Drop screen.
   */
  async getCurrentLocation(): Promise<LocationCoords | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      // ── Step 0: Live tracking position (instant, most accurate) ─────────────
      // If the Radar screen is already tracking, lastLocation is updated every
      // 2 seconds. Use it immediately rather than waiting for a new GPS fix.
      if (this.lastLocation) {
        console.log('📍 Using live tracking position (instant)');
        return this.lastLocation;
      }

      // ── Step 1: Try last-known (instant, no satellite wait) ──────────────────
      try {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 30_000,          // accept if measured within the last 30 s
          requiredAccuracy: 100,   // must be ≤ 100 m
        });
        if (last) {
          console.log('📍 Using last-known location (instant)');
          return {
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            accuracy: last.coords.accuracy,
          };
        }
      } catch (_) { /* last-known unavailable on this device/OS — continue */ }

      // ── Step 2: Race GPS vs. 6-second timeout ────────────────────────────────
      const gpsPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // faster than High; ~10-30 m accuracy
      });
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 6_000)
      );

      const result = await Promise.race([gpsPromise, timeoutPromise]);

      if (result) {
        return {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
        };
      }

      // ── Step 3: GPS timed out — try last-known without freshness constraints ──
      console.warn('⚠️ GPS timeout — using stale last-known position');
      try {
        const stale = await Location.getLastKnownPositionAsync({});
        if (stale) {
          return {
            latitude: stale.coords.latitude,
            longitude: stale.coords.longitude,
            accuracy: stale.coords.accuracy,
          };
        }
      } catch (_) {}

      // ── Step 4: IP fallback (city-level) ─────────────────────────────────────
      try {
        const ipLoc = await this.getIpLocation();
        if (ipLoc) return ipLoc;
      } catch (e) {
        console.error('IP fallback failed:', e);
      }
      return null;
    } catch (error) {
      console.error('Error getting current location:', error);
      // Try an IP-based fallback (approximate, good for initial map centering)
      try {
        const ipLoc = await this.getIpLocation();
        if (ipLoc) return ipLoc;
      } catch (e) {
        console.error('IP fallback failed:', e);
      }
      return null;
    }
  }

  /**
   * Approximate location using IP-based geolocation service.
   * This is a graceful fallback when native geolocation is unavailable (e.g., web without permission).
   */
  async getIpLocation(): Promise<LocationCoords | null> {
    try {
      const res = await fetch('https://ipapi.co/json');
      if (!res.ok) {
        console.warn('IP geolocation request failed with status', res.status);
        return null;
      }

      const data = await res.json();
      if (!data || !data.latitude || !data.longitude) return null;

      return {
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        accuracy: null,
      };
    } catch (error) {
      console.error('Error fetching IP location:', error);
      return null;
    }
  }

  /**
   * Start continuous location tracking
   */
  async startTracking(
    onLocation: LocationCallback,
    onDiscovery: DiscoveryCallback,
    onError: ErrorCallback
  ): Promise<boolean> {
    if (this.isTracking) {
      console.log('Already tracking location');
      return true;
    }

    const hasLocationPermission = await this.requestPermissions();
    const hasNotificationPermission = await this.requestNotificationPermissions();

    if (!hasLocationPermission) {
      onError('Location permission is required to discover messages');
      return false;
    }

    if (!hasNotificationPermission) {
      console.log('⚠️ Notifications disabled - pins will still be discovered');
    }

    this.onLocationUpdate = onLocation;
    this.onPinsDiscovered = onDiscovery;
    this.onError = onError;

    try {
      // Start watching position
      this.watchSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000, // Update every 2 seconds for near real-time tracking
          distanceInterval: 10, // Or every 10 meters (reduced from 20m)
        },
        this.handleLocationUpdate.bind(this)
      );

      // Start heartbeat timer for regular checks
      this.heartbeatInterval = setInterval(
        () => this.performHeartbeat(),
        API_CONFIG.HEARTBEAT_INTERVAL
      );

      this.isTracking = true;
      console.log('🛰️ Location tracking started');
      return true;
    } catch (error) {
      console.error('Error starting location tracking:', error);
      onError('Failed to start location tracking');
      return false;
    }
  }

  /**
   * Stop location tracking
   */
  stopTracking(): void {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.notificationSubscription) {
      this.notificationSubscription.remove();
      this.notificationSubscription = null;
    }

    this.isTracking = false;
    this.onLocationUpdate = null;
    this.onPinsDiscovered = null;
    this.onError = null;

    console.log('🛑 Location tracking stopped');
  }

  /**
   * Handle location updates from the watcher
   */
  private handleLocationUpdate(location: Location.LocationObject): void {
    const coords: LocationCoords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
    };

    // GPS ACCURACY FILTER: Reject poor quality fixes
    if (coords.accuracy && coords.accuracy > 20) {
      console.log(`⚠️ Rejecting low accuracy fix: ${coords.accuracy.toFixed(1)}m (threshold: 20m)`);
      return;
    }

    // GPS DRIFT GATE: Ignore movements smaller than 3m to prevent avatar jitter
    // from clearing extra fog or triggering spurious heartbeats.
    if (this.lastProcessedLocation) {
      const moved = this.calculateDistance(
        this.lastProcessedLocation.latitude,
        this.lastProcessedLocation.longitude,
        coords.latitude,
        coords.longitude,
      );
      if (moved < 3) {
        // Still update lastLocation so we always have the freshest raw reading,
        // but do NOT update lastProcessedLocation or fire callbacks.
        this.lastLocation = coords;
        return;
      }
    }

    this.lastLocation = coords;
    this.lastProcessedLocation = coords;

    // Notify callback
    if (this.onLocationUpdate) {
      this.onLocationUpdate(coords);
    }

    // Check if we should do a heartbeat based on distance
    this.performHeartbeat();
  }

  /**
   * Perform a "heartbeat" - check for nearby pins with spaced repetition
   */
  private async performHeartbeat(): Promise<void> {
    if (!this.lastLocation) return;

    const now = Date.now();
    const timeSinceLastHeartbeat = now - this.lastHeartbeatTime;
    if (timeSinceLastHeartbeat < 5000) return;
    this.lastHeartbeatTime = now;

    try {
      console.log('💓 Heartbeat - checking for nearby pins...');

      const response = await apiService.discoverPins(
        this.lastLocation.latitude,
        this.lastLocation.longitude
      );

      // --- PASS-BY ZONE MANAGEMENT ---
      // Build a set of pin IDs currently within 20m
      const pinsWithin20m = new Set<number>(
        response.pins
          .filter(p => p.distance_meters <= 20)
          .map(p => p.id)
      );

      // Detect pins that WERE in the zone but are now > 22m away (exited zone)
      for (const pinId of this.pinsInPassByZone) {
        if (!pinsWithin20m.has(pinId)) {
          // User exited the zone without ever interacting — fire pass-by silently
          if (!this.interactedPinIds.has(pinId)) {
            apiService.recordPassBy(pinId); // fire-and-forget
            console.log(`👣 Pass-by recorded for pin ${pinId}`);
          }
          this.pinsInPassByZone.delete(pinId);
        }
      }

      // Add newly-entered pins to the zone
      for (const pinId of pinsWithin20m) {
        if (!this.pinsInPassByZone.has(pinId) && !this.interactedPinIds.has(pinId)) {
          this.pinsInPassByZone.add(pinId);
        }
      }
      // --- END PASS-BY ZONE MANAGEMENT ---

      if (response.pins.length > 0) {
        console.log(`✨ Discovered ${response.pins.length} pin(s)!`);

        if (this.onPinsDiscovered) {
          this.onPinsDiscovered(response.pins);
        }

        const notifiablePins: DiscoveredPin[] = [];

        for (const pin of response.pins) {
          if (this.notifiedPinIds.has(pin.id)) continue;
          const shouldNotify = await pinPreferencesService.shouldNotify(pin.id);
          if (shouldNotify) {
            notifiablePins.push(pin);
            this.notifiedPinIds.add(pin.id);
          }
        }

        if (notifiablePins.length > 0) {
          await this.sendSequentialNotifications(notifiablePins);
        }
      }
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }

  /**
   * Send sequential notifications with 0.8s delay ("jackpot" effect)
   * Creates excitement by delivering one notification at a time
   */
  private async sendSequentialNotifications(pins: DiscoveredPin[]): Promise<void> {
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];
      const delay = i * 0.8; // 800ms between each notification
      
      // Schedule notification with delay
      setTimeout(async () => {
        await this.sendDiscoveryNotification(pin, i === 0);
      }, delay * 1000);
    }
  }

  /**
   * Send a single discovery notification with action buttons
   */
  private async sendDiscoveryNotification(pin: DiscoveredPin, isFirst: boolean = true): Promise<void> {
    try {
      // Check if this is a returning visit
      const pref = await pinPreferencesService.getPreference(pin.id);
      const isRevisit = pref !== null;
      
      const title = isRevisit ? '🔄 We meet again!' : '✨ Message Discovered!';
      const body = `${Math.round(pin.distance_meters)}m away: "${pin.content.substring(0, 50)}${pin.content.length > 50 ? '...' : ''}"`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { pinId: pin.id },
          sound: isFirst, // Only first notification makes sound
          categoryIdentifier: PIN_CATEGORY_ID, // Enable action buttons
        },
        trigger: null, // Immediate notification
      });

      // Update last seen date
      await pinPreferencesService.updateLastSeen(pin.id);
      
      console.log(`📬 Notification sent for pin ${pin.id} ${isRevisit ? '(revisit)' : '(new)'}`);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  /**
   * Calculate distance between two coordinates in meters
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Get last known location
   */
  getLastLocation(): LocationCoords | null {
    return this.lastLocation;
  }
}

// Export singleton instance
export const locationService = new LocationService();
export default locationService;
