/**
 * Broadcast Service
 * 
 * Handles community broadcasts (admin announcements)
 * - Fetch broadcasts (public, real-time)
 * - Post broadcast (admin-only)
 * - Real-time subscription via Supabase channels
 */

import { SUPABASE_CONFIG } from '../config/supabase';
import { authService } from './AuthService';

// ============================================
// TYPES
// ============================================

export interface Broadcast {
  id: number;
  community_id: string;
  admin_id: string;
  content: string;
  image_url?: string;
  created_at: string;
}

export interface BroadcastSubscription {
  unsubscribe: () => void;
}

// ============================================
// BROADCAST SERVICE
// ============================================

class BroadcastServiceClass {
  private supabase: any = null;
  private channel: any = null;

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
   * Fetch all broadcasts (latest first)
   */
  async fetchBroadcasts(limit: number = 50): Promise<Broadcast[]> {
    try {
      const supabase = await this.getSupabase();
      
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching broadcasts:', error);
        throw error;
      }

      console.log(`📻 Fetched ${data?.length || 0} broadcasts`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to fetch broadcasts:', error);
      return [];
    }
  }

  /**
   * Post a new broadcast (admin-only)
   * 
   * @param content - Broadcast message
   * @param imageUrl - Optional image URL
   * @returns The created broadcast
   */
  async postBroadcast(content: string, imageUrl?: string): Promise<Broadcast | null> {
    try {
      const user = await authService.initialize();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const supabase = await this.getSupabase();
      
      // Set current user context for RLS
      await supabase.rpc('set_current_user', { user_device_id: user.id });

      const { data, error } = await supabase
        .from('broadcasts')
        .insert({
          admin_id: user.id,
          content,
          image_url: imageUrl || null,
          community_id: 'default',
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error posting broadcast:', error);
        throw error;
      }

      console.log('📢 Broadcast posted successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Failed to post broadcast:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time broadcast updates
   * 
   * @param onNewBroadcast - Callback when new broadcast is inserted
   * @returns Subscription object with unsubscribe method
   */
  async subscribeTobroadcasts(
    onNewBroadcast: (broadcast: Broadcast) => void
  ): Promise<BroadcastSubscription> {
    try {
      const supabase = await this.getSupabase();

      // Create a channel for real-time updates
      this.channel = supabase
        .channel('broadcasts-channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'broadcasts',
          },
          (payload: any) => {
            console.log('📻 New broadcast received:', payload.new);
            onNewBroadcast(payload.new as Broadcast);
          }
        )
        .subscribe((status: string) => {
          console.log('📡 Broadcast subscription status:', status);
        });

      return {
        unsubscribe: () => {
          if (this.channel) {
            console.log('🔌 Unsubscribing from broadcasts');
            supabase.removeChannel(this.channel);
            this.channel = null;
          }
        },
      };
    } catch (error) {
      console.error('❌ Failed to subscribe to broadcasts:', error);
      throw error;
    }
  }

  /**
   * Check if current user is an admin
   */
  async checkIsAdmin(): Promise<boolean> {
    try {
      const user = await authService.initialize();
      if (!user?.id) {
        return false;
      }

      const supabase = await this.getSupabase();
      
      const { data, error } = await supabase
        .from('devices')
        .select('role')
        .eq('device_id', user.id)
        .single();

      if (error) {
        console.error('❌ Error checking admin status:', error);
        return false;
      }

      const isAdmin = data?.role === 'admin';
      console.log(`🔑 User ${user.id} is admin: ${isAdmin}`);
      return isAdmin;
    } catch (error) {
      console.error('❌ Failed to check admin status:', error);
      return false;
    }
  }
}

export const BroadcastService = new BroadcastServiceClass();
