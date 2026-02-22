/**
 * Pin Preferences Service - Local storage for user's pin interactions
 * 
 * Implements spaced repetition system:
 * - "Good" pins: Notify again after 7 days
 * - "Bad" pins: Muted permanently (until manually unmuted)
 * - Tracks last seen date and next notify date for each pin
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = 'serendipity_pin_preferences';

export interface PinPreference {
  pinId: number;
  lastSeenDate: string; // ISO date string
  nextNotifyDate: string | null; // ISO date string, null if muted
  isMuted: boolean; // true = "Bad", false = "Good"
  markedAt: string; // ISO date when user marked it
}

class PinPreferencesService {
  private preferences: Map<number, PinPreference> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize preferences from storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = new Map(
          parsed.map((pref: PinPreference) => [pref.pinId, pref])
        );
        console.log(`📚 Loaded ${this.preferences.size} pin preferences`);
      }
      this.initialized = true;
    } catch (error) {
      console.error('Error loading pin preferences:', error);
      this.preferences = new Map();
      this.initialized = true;
    }
  }

  /**
   * Save preferences to storage
   */
  private async save(): Promise<void> {
    try {
      const array = Array.from(this.preferences.values());
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(array));
    } catch (error) {
      console.error('Error saving pin preferences:', error);
    }
  }

  /**
   * Mark a pin as "Good" (Interesting) - notify again in 7 days
   */
  async markGood(pinId: number): Promise<void> {
    await this.initialize();
    
    const now = new Date();
    const nextNotify = new Date(now);
    nextNotify.setDate(nextNotify.getDate() + 7); // 7 days from now

    const preference: PinPreference = {
      pinId,
      lastSeenDate: now.toISOString(),
      nextNotifyDate: nextNotify.toISOString(),
      isMuted: false,
      markedAt: now.toISOString(),
    };

    this.preferences.set(pinId, preference);
    await this.save();
    console.log(`👍 Pin ${pinId} marked Good - next notify: ${nextNotify.toLocaleDateString()}`);
  }

  /**
   * Mark a pin as "Bad" (Not Interested) - mute permanently
   */
  async markBad(pinId: number): Promise<void> {
    await this.initialize();
    
    const now = new Date();
    const preference: PinPreference = {
      pinId,
      lastSeenDate: now.toISOString(),
      nextNotifyDate: null, // Null = never notify
      isMuted: true,
      markedAt: now.toISOString(),
    };

    this.preferences.set(pinId, preference);
    await this.save();
    console.log(`👎 Pin ${pinId} marked Bad - muted permanently`);
  }

  /**
   * Unmute a pin (resets to "Good" with immediate availability)
   */
  async unmute(pinId: number): Promise<void> {
    await this.initialize();
    
    const now = new Date();
    const preference: PinPreference = {
      pinId,
      lastSeenDate: now.toISOString(),
      nextNotifyDate: now.toISOString(), // Available immediately
      isMuted: false,
      markedAt: now.toISOString(),
    };

    this.preferences.set(pinId, preference);
    await this.save();
    console.log(`🔔 Pin ${pinId} unmuted - available now`);
  }

  /**
   * Check if a pin should trigger notification
   * Returns true if:
   * - Pin is not muted AND
   * - Next notify date has passed (or no preference exists)
   */
  async shouldNotify(pinId: number): Promise<boolean> {
    await this.initialize();
    
    const pref = this.preferences.get(pinId);
    
    // No preference = new pin, should notify
    if (!pref) {
      return true;
    }

    // Muted = never notify
    if (pref.isMuted) {
      return false;
    }

    // Check if cooldown has expired
    if (pref.nextNotifyDate) {
      const nextNotify = new Date(pref.nextNotifyDate);
      const now = new Date();
      const shouldNotify = now >= nextNotify;
      
      if (!shouldNotify) {
        const daysLeft = Math.ceil((nextNotify.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`⏰ Pin ${pinId} in cooldown - ${daysLeft} days remaining`);
      }
      
      return shouldNotify;
    }

    return true;
  }

  /**
   * Get preference for a pin
   */
  async getPreference(pinId: number): Promise<PinPreference | null> {
    await this.initialize();
    return this.preferences.get(pinId) || null;
  }

  /**
   * Check if a pin is muted
   */
  async isMuted(pinId: number): Promise<boolean> {
    await this.initialize();
    const pref = this.preferences.get(pinId);
    return pref?.isMuted || false;
  }

  /**
   * Get all preferences (for debugging)
   */
  async getAllPreferences(): Promise<PinPreference[]> {
    await this.initialize();
    return Array.from(this.preferences.values());
  }

  /**
   * Clear all preferences (for testing)
   */
  async clearAll(): Promise<void> {
    this.preferences.clear();
    await AsyncStorage.removeItem(PREFERENCES_KEY);
    console.log('🗑️ All pin preferences cleared');
  }

  /**
   * Update last seen date when user discovers a pin
   * (happens automatically on notification or map view)
   */
  async updateLastSeen(pinId: number): Promise<void> {
    await this.initialize();
    
    const pref = this.preferences.get(pinId);
    if (pref) {
      pref.lastSeenDate = new Date().toISOString();
      this.preferences.set(pinId, pref);
      await this.save();
    }
  }
}

// Export singleton instance
export const pinPreferencesService = new PinPreferencesService();
export default pinPreferencesService;
