/**
 * Diary Screen
 * 
 * Personal serendipity diary with vertical timeline UI
 * - Displays user's visited pins chronologically
 * - Visual timeline with custom icons (mikan, lantern)
 * - Shows rating (Good/Normal/Bad) for each visit
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { DiaryService, DiaryEntry, DiaryRating } from '../services/DiaryService';
import apiService, { UserStats, PinStatsResponse } from '../services/ApiService';
import { authService } from '../services/AuthService';
import { ProfileIconRenderer } from '../components/ProfileIcons';
import { SimpleConfirmDialog } from '../components/SimpleConfirmDialog';
import { useTranslation } from 'react-i18next';
import {
  MiyabiColors,
  MiyabiSpacing,
  MiyabiBorderRadius,
  MiyabiStyles,
  MiyabiTypography,
  MiyabiShadows,
  MiyabiIcons,
  getRatingColor,
  getRatingIcon,
  formatJapaneseDate,
  formatTime,
} from '../styles/miyabi';

const DIARY_CACHE_KEY = 'serendipity_diary_cache';
const STATS_CACHE_KEY = 'serendipity_user_stats_cache';
const SYNC_COOLDOWN_MS = 30_000; // 30 seconds per-pin cooldown

// ── Inline SVG stat-card icons ────────────────────────────────────────────────

const IconHeart: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = '#769171' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </Svg>
);

const IconEyeOff: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = '#E6B422' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <Path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <Path d="M6.51 6.51A10 10 0 0 0 1 12s4 8 11 8a10 10 0 0 0 5.49-1.51" />
    <Line x1="2" y1="2" x2="22" y2="22" />
    <Circle cx="12" cy="12" r="3" />
  </Svg>
);

const IconMapPin: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = '#5A8AAA' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <Circle cx="12" cy="10" r="3" />
  </Svg>
);

const IconTorii: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = '#C85250' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    {/* Left post */}
    <Line x1="6" y1="22" x2="6" y2="7" />
    {/* Right post */}
    <Line x1="18" y1="22" x2="18" y2="7" />
    {/* Top curved kasagi beam */}
    <Path d="M2 8 Q12 3 22 8" />
    {/* Shimaki (second flat beam) */}
    <Line x1="4" y1="12" x2="20" y2="12" />
    {/* Nuki (lower crossbar between posts) */}
    <Line x1="5" y1="16" x2="19" y2="16" />
  </Svg>
);

// Compass SVG for the empty state
const IconCompass: React.FC<{ size?: number; color?: string }> = ({ size = 64, color = '#A3B89E' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4"
    strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
  </Svg>
);

const DiaryScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  // Current authenticated user (for profile header)
  const [currentUser, setCurrentUser] = useState<{ username?: string; profileIcon?: string } | null>(null);
  // State
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Per-pin sync cooldown: pinId → timestamp of last sync
  const [syncCooldowns, setSyncCooldowns] = useState<Record<number, number>>({});
  // Pins that server returned expired:true — slide to archived section
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());
  // Live stats pulled from server (overrides diary entry defaults)
  const [pinStats, setPinStats] = useState<Record<number, PinStatsResponse>>({});
  const [isOffline, setIsOffline] = useState(false);
  // Slide-out animations keyed by pin_id
  const slideAnims = useRef<Record<number, Animated.Value>>({}).current;

  // Themed dialog state (replaces Alert.alert)
  const dialogActionRef = useRef<(() => void) | null>(null);
  const [dialog, setDialog] = useState({ visible: false, title: '', message: '', confirmText: 'OK', cancelText: '', isDangerous: false });
  const showInfo = (title: string, message: string) => {
    dialogActionRef.current = null;
    setDialog({ visible: true, title, message, confirmText: 'OK', cancelText: '', isDangerous: false });
  };
  const showConfirm = (title: string, message: string, onConfirm: () => void, isDangerous = false) => {
    dialogActionRef.current = onConfirm;
    setDialog({ visible: true, title, message, confirmText: isDangerous ? 'Delete' : 'Confirm', cancelText: 'Cancel', isDangerous });
  };
  const dismissDialog = () => setDialog(d => ({ ...d, visible: false }));
  const handleDialogConfirm = () => { dismissDialog(); dialogActionRef.current?.(); };

  // ============================================
  // INITIALIZATION
  // ============================================

  useEffect(() => {
    loadCacheFirst();
    fetchUserStats();
    // Load the authenticated user for the profile header
    const user = authService.getUser();
    if (user) setCurrentUser({ username: user.username, profileIcon: user.profileIcon });
  }, []);

  // ── Cache-first: show diary immediately from AsyncStorage, then refresh from server ──
  const loadCacheFirst = async () => {
    let hasCache = false;
    try {
      const cached = await AsyncStorage.getItem(DIARY_CACHE_KEY);
      if (cached) {
        const parsed: DiaryEntry[] = JSON.parse(cached);
        setEntries(parsed);
        setIsLoading(false);            // show instantly from cache
        hasCache = true;
      }
    } catch (_) {}
    await fetchEntries(false);          // then update in background
    if (!hasCache) setIsLoading(false); // no cache + network done → stop spinner
  };

  const fetchUserStats = async () => {
    try {
      const stats = await apiService.getUserStats();
      setUserStats(stats);
      await AsyncStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats));
      setIsOffline(false);
    } catch (error) {
      // Offline: load cached stats
      try {
        const cached = await AsyncStorage.getItem(STATS_CACHE_KEY);
        if (cached) setUserStats(JSON.parse(cached));
      } catch (_) {}
      setIsOffline(true);
    }
  };

  const fetchEntries = async (showSpinner = true) => {
    try {
      if (showSpinner) setIsLoading(true);
      const data = await DiaryService.fetchEntries(100);
      setEntries(data);
      await AsyncStorage.setItem(DIARY_CACHE_KEY, JSON.stringify(data));
      setIsOffline(false);
    } catch (error) {
      setIsOffline(true);
      // keep whatever is already in state (from cache or previous fetch)
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchEntries(false), fetchUserStats()]);
    setIsRefreshing(false);
  };

  // ── Per-pin server sync with 30-second client-side cooldown ──
  const syncPin = async (pinId: number) => {
    const now = Date.now();
    const lastSync = syncCooldowns[pinId] ?? 0;
    if (now - lastSync < SYNC_COOLDOWN_MS) return; // still cooling down

    setSyncCooldowns(prev => ({ ...prev, [pinId]: now }));
    try {
      const stats = await apiService.getPinStats(pinId);
      setPinStats(prev => ({ ...prev, [pinId]: stats }));
      setIsOffline(false);

      if (stats.expired) {
        // Ensure anim ref exists then slide out
        if (!slideAnims[pinId]) slideAnims[pinId] = new Animated.Value(1);
        setArchivedIds(prev => new Set(prev).add(pinId));
        Animated.timing(slideAnims[pinId], { toValue: 0, duration: 400, useNativeDriver: true }).start();
      }
    } catch (_) {
      setIsOffline(true);
      // keep old numbers, show offline indicator
    }
  };

  const isSyncCoolingDown = (pinId: number) => {
    const last = syncCooldowns[pinId];
    if (!last) return false;
    return Date.now() - last < SYNC_COOLDOWN_MS;
  };

  // ============================================
  // ACTIONS
  // ============================================

  const handleDeleteEntry = (entryId: number) => {
    showConfirm(
      t('diary.deleteEntryTitle'),
      t('diary.deleteEntryMsg'),
      async () => {
        try {
          await DiaryService.deleteEntry(entryId);
          await fetchEntries();
          showInfo(t('diary.deletedEntry'), t('diary.deletedEntryMsg'));
        } catch (error: any) {
          console.error('❌ Failed to delete entry:', error);
          showInfo(t('common.error'), error.message || t('diary.deleteError'));
        }
      },
      true
    );
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  /**
   * Get icon for pin type (basic heuristic based on content)
   */
  const getPinIcon = (content?: string): string => {
    if (!content) return MiyabiIcons.circle;
    
    const lower = content.toLowerCase();
    
    // Food-related keywords
    if (
      lower.includes('food') ||
      lower.includes('ramen') ||
      lower.includes('sushi') ||
      lower.includes('restaurant') ||
      lower.includes('cafe') ||
      lower.includes('みかん') ||
      lower.includes('食べ物') ||
      lower.includes('ラーメン')
    ) {
      return MiyabiIcons.mikan;
    }
    
    // History/culture keywords
    if (
      lower.includes('shrine') ||
      lower.includes('temple') ||
      lower.includes('history') ||
      lower.includes('culture') ||
      lower.includes('神社') ||
      lower.includes('寺') ||
      lower.includes('歴史')
    ) {
      return MiyabiIcons.lantern;
    }
    
    // Default
    return MiyabiIcons.sakura;
  };

  /**
   * Group entries by date
   */
  const groupEntriesByDate = (entries: DiaryEntry[]) => {
    const groups: { [date: string]: DiaryEntry[] } = {};
    
    entries.forEach((entry) => {
      const date = new Date(entry.visit_date);
      const dateKey = formatJapaneseDate(date);
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(entry);
    });
    
    return groups;
  };

  // ============================================
  // RENDER COMPONENTS
  // ============================================

  const renderTimelineEntry = (entry: DiaryEntry, isLast: boolean) => {
    const date = new Date(entry.visit_date);
    const icon = getPinIcon(entry.pin_content);
    const live = pinStats[entry.pin_id];
    const ratingColor = getRatingColor(entry.rating);
    const ratingIcon = getRatingIcon(entry.rating);
    const isArchived = archivedIds.has(entry.pin_id);
    const cooling = isSyncCoolingDown(entry.pin_id);
    const remaining = syncCooldowns[entry.pin_id]
      ? Math.max(0, Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - syncCooldowns[entry.pin_id])) / 1000))
      : 0;

    if (!slideAnims[entry.pin_id]) slideAnims[entry.pin_id] = new Animated.Value(1);

    return (
      <Animated.View
        key={entry.id}
        style={[styles.timelineEntry, isArchived && { opacity: slideAnims[entry.pin_id] }]}
      >
        {/* Left: Time */}
        <View style={styles.timelineLeft}>
          <Text style={styles.timelineTime}>{formatTime(date)}</Text>
        </View>
        
        {/* Center: Timeline visual */}
        <View style={styles.timelineCenter}>
          <View style={[styles.timelineNode, { backgroundColor: isArchived ? '#BDBDBD' : ratingColor }]}>
            <Text style={styles.timelineNodeIcon}>{isArchived ? '🗄️' : icon}</Text>
          </View>
          {!isLast && <View style={styles.timelineLine} />}
        </View>
        
        {/* Right: Content card */}
        <TouchableOpacity
          style={styles.timelineRight}
          onLongPress={() => handleDeleteEntry(entry.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.entryCard, { borderLeftColor: isArchived ? '#9E9E9E' : ratingColor }]}>
            <View style={styles.entryHeader}>
              <Text style={[styles.entryTitle, isArchived && styles.archivedTitle]} numberOfLines={2}>
                {entry.pin_content || `Pin #${entry.pin_id}`}
              </Text>
              {isArchived ? (
                <View style={styles.expiredBadge}><Text style={styles.expiredBadgeText}>⏱️ {t('diary.expired')}</Text></View>
              ) : (
                <View style={[styles.ratingBadge, { backgroundColor: ratingColor }]}>
                  <Text style={styles.ratingBadgeIcon}>{ratingIcon}</Text>
                  <Text style={styles.ratingBadgeText}>{entry.rating}</Text>
                </View>
              )}
            </View>
            
            {/* Live stats row */}
            {live && !isArchived && (
              <View style={styles.liveRow}>
                <Text style={styles.liveStat}>❤️ {live.likes}</Text>
                <Text style={styles.liveStat}>👎 {live.dislikes}</Text>
                <Text style={styles.liveStat}>👣 {live.passes_by}</Text>
              </View>
            )}

            {entry.notes && (
              <Text style={styles.entryNotes}>{entry.notes}</Text>
            )}
            
            {entry.pin_location && (
              <Text style={styles.entryLocation}>
                📍 {entry.pin_location.lat.toFixed(5)}, {entry.pin_location.lng.toFixed(5)}
              </Text>
            )}

            {/* Per-pin sync button */}
            {!isArchived && (
              <TouchableOpacity
                style={[styles.syncBtn, cooling && styles.syncBtnCooling]}
                onPress={() => syncPin(entry.pin_id)}
                disabled={cooling}
              >
                <Text style={styles.syncBtnTxt}>
                  {cooling ? `↻ ${remaining}s` : `↻ ${t('diary.sync')}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderDateSection = (dateKey: string, entries: DiaryEntry[]) => {
    return (
      <View key={dateKey} style={styles.dateSection}>
        <View style={styles.dateSectionHeader}>
          <View style={styles.dateSectionLine} />
          <Text style={styles.dateSectionText}>{dateKey}</Text>
          <View style={styles.dateSectionLine} />
        </View>
        
        {entries.map((entry, index) =>
          renderTimelineEntry(entry, index === entries.length - 1)
        )}
      </View>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          {/* Hamburger visible even during loading */}
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.openDrawer()}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{t('diary.headerTitle')}</Text>
            <Text style={styles.headerSubtitle}>{t('diary.headerSubtitle')}</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>📔 {t('diary.loadingDiary')}</Text>
        </View>
      </View>
    );
  }

  const groupedEntries = groupEntriesByDate(entries);
  const dateKeys = Object.keys(groupedEntries);

  return (
    <View style={styles.container}>
      {/* Header with integrated hamburger */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => navigation.openDrawer()}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('diary.headerTitle')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.headerSubtitle}>
              {t('diary.discoveries', { count: entries.length })}
            </Text>
            {isOffline && (
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineBadgeText}>📵 {t('diary.offline')}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Timeline */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={MiyabiColors.bamboo}
          />
        }
      >
        {/* ── Explorer Profile Header ── */}
        {currentUser && (
          <View style={styles.profileHeader}>
            {/* Avatar: user's chosen SVG icon */}
            <View style={styles.profileAvatar}>
              <ProfileIconRenderer
                iconId={currentUser.profileIcon ?? 'strawhat'}
                size={36}
                color={MiyabiColors.bamboo}
              />
            </View>
            {/* Name + tagline */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileUsername}>
                {currentUser.username ?? 'Explorer'}
              </Text>
              <Text style={styles.profileTagline}>Active Explorer</Text>
            </View>
          </View>
        )}

        {/* User Stats Cards */}
        {userStats && (
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              {/* Liked */}
              <View style={[styles.statCard, { backgroundColor: '#EDF7ED' }]}>
                <IconHeart size={22} color="#769171" />
                <Text style={styles.statCardValue}>{userStats.liked_count}</Text>
                <Text style={styles.statCardLabel}>{t('diary.liked')}</Text>
              </View>
              {/* Hidden (formerly Disliked) */}
              <View style={[styles.statCard, { backgroundColor: '#FFF8E1' }]}>
                <IconEyeOff size={22} color="#C99A1A" />
                <Text style={styles.statCardValue}>{userStats.disliked_count}</Text>
                <Text style={styles.statCardLabel}>{t('diary.hidden')}</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              {/* Created (pins) */}
              <View style={[styles.statCard, { backgroundColor: '#E8F1F7' }]}>
                <IconMapPin size={22} color="#5A8AAA" />
                <Text style={styles.statCardValue}>{userStats.pins_created}</Text>
                <Text style={styles.statCardLabel}>{t('diary.created')}</Text>
              </View>
              {/* Communities */}
              <View style={[styles.statCard, { backgroundColor: '#FAEAEA' }]}>
                <IconTorii size={22} color="#C85250" />
                <Text style={styles.statCardValue}>{userStats.communities_created}</Text>
                <Text style={styles.statCardLabel}>{t('diary.communities')}</Text>
              </View>
            </View>
          </View>
        )}
        {entries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <IconCompass size={64} color={MiyabiColors.bambooLight} />
            </View>
            <Text style={styles.emptyText}>Your Log is Empty</Text>
            <Text style={styles.emptySubtext}>
              {'Step into the fog and uncover your first pin\nto start your journey.'}
            </Text>
          </View>
        ) : (
          <>
            {dateKeys.map((dateKey) =>
              renderDateSection(dateKey, groupedEntries[dateKey].filter(e => !archivedIds.has(e.pin_id)))
            )}
            
            {/* Archived section */}
            {archivedIds.size > 0 && (
              <View style={styles.archivedSection}>
                <View style={styles.dateSectionHeader}>
                  <View style={styles.dateSectionLine} />
                  <Text style={[styles.dateSectionText, { color: '#9E9E9E' }]}>🗄️ {t('diary.archived')}</Text>
                  <View style={styles.dateSectionLine} />
                </View>
                {entries
                  .filter(e => archivedIds.has(e.pin_id))
                  .map((e, i, arr) => renderTimelineEntry(e, i === arr.length - 1))
                }
              </View>
            )}
            
            <View style={styles.timelineEnd}>
              <Text style={styles.timelineEndText}>— {t('diary.timelineEnd')} —</Text>
            </View>
          </>
        )}
      </ScrollView>

      <SimpleConfirmDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        isDangerous={dialog.isDangerous}
        onConfirm={handleDialogConfirm}
        onCancel={dismissDialog}
      />
    </View>
  );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MiyabiColors.washi,
  },
  
  // Header
  header: {
    backgroundColor: MiyabiColors.cardBackground,
    paddingTop: MiyabiSpacing.xl + 20,
    paddingBottom: MiyabiSpacing.md,
    paddingHorizontal: MiyabiSpacing.md,
    ...MiyabiShadows.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...MiyabiStyles.heading,
    marginBottom: 4,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSubtitle: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.bamboo,
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...MiyabiStyles.body,
    color: MiyabiColors.sumiLight,
  },
  
  // Scroll
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: MiyabiSpacing.md,
    paddingBottom: MiyabiSpacing.xxl,
  },

  // Explorer Profile Header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.lg,
    padding: MiyabiSpacing.md,
    marginBottom: MiyabiSpacing.lg,
    ...MiyabiShadows.sm,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: MiyabiBorderRadius.md,
    backgroundColor: MiyabiColors.bambooLight + '25',
    borderWidth: 1.5,
    borderColor: MiyabiColors.bambooLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: MiyabiSpacing.md,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileUsername: {
    fontSize: MiyabiTypography.fontSize.xl,
    fontWeight: MiyabiTypography.fontWeight.bold,
    color: MiyabiColors.sumi,
    letterSpacing: 0.1,
  },
  profileTagline: {
    fontSize: MiyabiTypography.fontSize.sm,
    color: MiyabiColors.bamboo,
    marginTop: 3,
    letterSpacing: 0.4,
    fontWeight: MiyabiTypography.fontWeight.medium,
  },
  statsContainer: {
    marginBottom: MiyabiSpacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: MiyabiSpacing.sm,
    marginBottom: MiyabiSpacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: MiyabiBorderRadius.md,
    paddingVertical: MiyabiSpacing.md,
    paddingHorizontal: MiyabiSpacing.sm,
    alignItems: 'center',
    ...MiyabiShadows.sm,
  },
  statCardValue: {
    fontSize: MiyabiTypography.fontSize.xl,
    fontWeight: MiyabiTypography.fontWeight.bold,
    color: MiyabiColors.sumi,
    marginTop: 6,
  },
  statCardLabel: {
    fontSize: MiyabiTypography.fontSize.xs,
    color: MiyabiColors.sumiLight,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  
  // Date Section
  dateSection: {
    marginBottom: MiyabiSpacing.lg,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: MiyabiSpacing.md,
  },
  dateSectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: MiyabiColors.divider,
  },
  dateSectionText: {
    ...MiyabiStyles.caption,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: MiyabiColors.bamboo,
    marginHorizontal: MiyabiSpacing.sm,
  },
  
  // Timeline Entry
  timelineEntry: {
    flexDirection: 'row',
    marginBottom: MiyabiSpacing.md,
  },
  
  // Left: Time
  timelineLeft: {
    width: 60,
    alignItems: 'flex-end',
    paddingRight: MiyabiSpacing.sm,
    paddingTop: 4,
  },
  timelineTime: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
  },
  
  // Center: Visual line
  timelineCenter: {
    width: 44,
    alignItems: 'center',
  },
  timelineNode: {
    width: 44,
    height: 44,
    borderRadius: MiyabiBorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: MiyabiColors.washi,
    ...MiyabiShadows.md,
  },
  timelineNodeIcon: {
    fontSize: 20,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: MiyabiColors.divider,
    marginTop: 4,
  },
  
  // Right: Content
  timelineRight: {
    flex: 1,
    paddingLeft: MiyabiSpacing.sm,
    paddingTop: 4,
  },
  entryCard: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.md,
    borderLeftWidth: 4,
    ...MiyabiShadows.sm,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: MiyabiSpacing.sm,
  },
  entryTitle: {
    ...MiyabiStyles.body,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    flex: 1,
    marginRight: MiyabiSpacing.sm,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: MiyabiBorderRadius.full,
    paddingHorizontal: MiyabiSpacing.sm,
    paddingVertical: 4,
  },
  ratingBadgeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  ratingBadgeText: {
    fontSize: MiyabiTypography.fontSize.xs,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  entryNotes: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    fontStyle: 'italic',
    marginBottom: MiyabiSpacing.xs,
  },
  entryLocation: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiFaded,
    fontSize: MiyabiTypography.fontSize.xs,
  },
  
  // Timeline End
  timelineEnd: {
    alignItems: 'center',
    paddingVertical: MiyabiSpacing.lg,
  },
  timelineEndText: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiFaded,
  },
  
  // Offline badge
  offlineBadge: { backgroundColor: '#FF7043', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  offlineBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },

  // Per-pin sync button
  syncBtn: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#E3F2FD', borderRadius: 8 },
  syncBtnCooling: { backgroundColor: '#F5F5F5' },
  syncBtnTxt: { fontSize: 11, color: '#4285F4', fontWeight: '700' },

  // Live stats row
  liveRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 2 },
  liveStat: { fontSize: 11, color: '#5F6368', fontWeight: '600' },

  // Expired/archived
  archivedTitle: { color: '#9E9E9E', textDecorationLine: 'line-through' },
  expiredBadge: { backgroundColor: '#E0E0E0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  expiredBadgeText: { fontSize: 10, color: '#757575', fontWeight: '700' },
  archivedSection: { marginTop: 24 },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: MiyabiSpacing.xxl * 2,
  },
  emptyIconWrap: {
    marginBottom: MiyabiSpacing.lg,
    opacity: 0.7,
  },
  emptyText: {
    ...MiyabiStyles.subheading,
    color: MiyabiColors.sumi,
    marginBottom: MiyabiSpacing.sm,
    letterSpacing: 0.2,
  },
  emptySubtext: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: MiyabiSpacing.lg,
  },
  
  // Hamburger Menu (integrated in header)
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MiyabiColors.bambooLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  menuIcon: {
    fontSize: 16,
    color: MiyabiColors.bamboo,
    fontWeight: '600',
  },
});

export default DiaryScreen;
