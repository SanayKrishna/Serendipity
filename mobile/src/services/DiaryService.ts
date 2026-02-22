/**
 * Diary Service
 * 
 * Handles personal serendipity diary entries
 * - Add diary entry (rate a visited pin)
 * - Fetch user's diary (chronological timeline)
 * - Update/delete entries
 */

import { SUPABASE_CONFIG } from '../config/supabase';
import { authService } from './AuthService';

// ============================================
// TYPES
// ============================================

export type DiaryRating = 'Good' | 'Normal' | 'Bad';

export interface DiaryEntry {
  id: number;
  user_id: string;
  pin_id: number;
  rating: DiaryRating;
  visit_date: string;
  notes?: string;
  
  // Joined data from pins table (optional)
  pin_content?: string;
  pin_location?: {
    lat: number;
    lng: number;
  };
}

// ============================================
// DIARY SERVICE
// ============================================

class DiaryServiceClass {
  private supabase: any = null;

  /**
   * Initialize Supabase client (lazy)
   */
  private async getSupabase() {
    if (!this.supabase) {
      const { createClient } = await import('@supabase/supabase-js');
      this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }
    return this.supabase;
  }

  /**
   * Add a new diary entry
   * 
   * @param pinId - Pin ID that was visited
   * @param rating - User's rating (Good/Normal/Bad)
   * @param notes - Optional personal notes
   * @returns The created diary entry
   */
  async addEntry(
    pinId: number,
    rating: DiaryRating,
    notes?: string
  ): Promise<DiaryEntry | null> {
    try {
      const user = await authService.initialize();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const supabase = await this.getSupabase();
      
      // Set current user context for RLS
      await supabase.rpc('set_current_user', { user_device_id: user.id });

      const { data, error } = await supabase
        .from('user_diary')
        .insert({
          user_id: user.id,
          pin_id: pinId,
          rating,
          notes: notes || null,
          visit_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        // Handle duplicate entry (same pin on same day)
        if (error.code === '23505') {
          console.log('ℹ️ Diary entry already exists for this pin today');
          throw new Error('You already rated this pin today');
        }
        console.error('❌ Error adding diary entry:', error);
        throw error;
      }

      console.log('📔 Diary entry added:', data);
      return data;
    } catch (error) {
      console.error('❌ Failed to add diary entry:', error);
      throw error;
    }
  }

  /**
   * Fetch user's diary entries (with pin details)
   * 
   * @param limit - Maximum number of entries to fetch
   * @returns Array of diary entries with pin details
   */
  async fetchEntries(limit: number = 100): Promise<DiaryEntry[]> {
    try {
      const user = await authService.initialize();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const supabase = await this.getSupabase();
      
      // Set current user context for RLS
      await supabase.rpc('set_current_user', { user_device_id: user.id });

      // Fetch diary with joined pin data
      const { data, error } = await supabase
        .from('user_diary')
        .select(`
          *,
          pins:pin_id (
            id,
            content,
            geom
          )
        `)
        .eq('user_id', user.id)
        .order('visit_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching diary entries:', error);
        throw error;
      }

      // Transform the data to include pin details at top level
      const entries: DiaryEntry[] = (data || []).map((entry: any) => ({
        id: entry.id,
        user_id: entry.user_id,
        pin_id: entry.pin_id,
        rating: entry.rating,
        visit_date: entry.visit_date,
        notes: entry.notes,
        pin_content: entry.pins?.content,
        pin_location: entry.pins?.geom 
          ? this.parseGeometry(entry.pins.geom) 
          : undefined,
      }));

      console.log(`📔 Fetched ${entries.length} diary entries`);
      return entries;
    } catch (error) {
      console.error('❌ Failed to fetch diary entries:', error);
      return [];
    }
  }

  /**
   * Update a diary entry (rating or notes)
   * 
   * @param entryId - Diary entry ID
   * @param updates - Fields to update
   * @returns Updated entry
   */
  async updateEntry(
    entryId: number,
    updates: { rating?: DiaryRating; notes?: string }
  ): Promise<DiaryEntry | null> {
    try {
      const user = await authService.initialize();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const supabase = await this.getSupabase();
      
      // Set current user context for RLS
      await supabase.rpc('set_current_user', { user_device_id: user.id });

      const { data, error } = await supabase
        .from('user_diary')
        .update(updates)
        .eq('id', entryId)
        .eq('user_id', user.id)  // Ensure user owns this entry
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating diary entry:', error);
        throw error;
      }

      console.log('📝 Diary entry updated:', data);
      return data;
    } catch (error) {
      console.error('❌ Failed to update diary entry:', error);
      throw error;
    }
  }

  /**
   * Delete a diary entry
   * 
   * @param entryId - Diary entry ID
   */
  async deleteEntry(entryId: number): Promise<void> {
    try {
      const user = await authService.initialize();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const supabase = await this.getSupabase();
      
      // Set current user context for RLS
      await supabase.rpc('set_current_user', { user_device_id: user.id });

      const { error } = await supabase
        .from('user_diary')
        .delete()
        .eq('id', entryId)
        .eq('user_id', user.id);  // Ensure user owns this entry

      if (error) {
        console.error('❌ Error deleting diary entry:', error);
        throw error;
      }

      console.log('🗑️ Diary entry deleted');
    } catch (error) {
      console.error('❌ Failed to delete diary entry:', error);
      throw error;
    }
  }

  /**
   * Parse PostGIS geometry to lat/lng
   * Handles both GeoJSON and Well-Known Text (WKT) formats
   */
  private parseGeometry(geom: any): { lat: number; lng: number } | undefined {
    try {
      // If it's already a GeoJSON object
      if (geom.type === 'Point' && geom.coordinates) {
        return {
          lng: geom.coordinates[0],
          lat: geom.coordinates[1],
        };
      }
      
      // If it's a WKT string like "POINT(lng lat)"
      if (typeof geom === 'string' && geom.startsWith('POINT')) {
        const match = geom.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        if (match) {
          return {
            lng: parseFloat(match[1]),
            lat: parseFloat(match[2]),
          };
        }
      }
      
      return undefined;
    } catch (error) {
      console.error('❌ Failed to parse geometry:', error);
      return undefined;
    }
  }
}

export const DiaryService = new DiaryServiceClass();
