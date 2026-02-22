/**
 * Community Screen
 * 
 * Community overview showing stats:
 * - Total community pins across the platform
 * - User's own community pins
 * - Visual stats cards with Miyabi styling
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import apiService, { CommunityStats, DiscoveredPin } from '../services/ApiService';
import locationService from '../services/LocationService';
import {
  MiyabiColors,
  MiyabiSpacing,
  MiyabiBorderRadius,
  MiyabiStyles,
  MiyabiTypography,
  MiyabiShadows,
} from '../styles/miyabi';

export const COMMUNITY_FILTER_KEY = 'serendipity_community_filter_active';

const CommunityScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  
  // State
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Community filter toggle — persisted across screens via AsyncStorage
  const [filterActive, setFilterActive] = useState(false);
  // Nearby community pins fetched at current location
  const [nearbyPins, setNearbyPins] = useState<DiscoveredPin[]>([]);

  // ============================================
  // INITIALIZATION
  // ============================================

  useEffect(() => {
    fetchCommunityStats();
    loadFilter();
    fetchNearbyPins();
  }, []);

  const loadFilter = async () => {
    try {
      const stored = await AsyncStorage.getItem(COMMUNITY_FILTER_KEY);
      setFilterActive(stored === 'true');
    } catch (_) {}
  };

  const toggleFilter = async (value: boolean) => {
    setFilterActive(value);
    try { await AsyncStorage.setItem(COMMUNITY_FILTER_KEY, String(value)); } catch (_) {}
  };

  const fetchNearbyPins = async () => {
    try {
      const loc = await locationService.getCurrentLocation();
      if (!loc) return;
      const result = await apiService.discoverPins(loc.latitude, loc.longitude);
      setNearbyPins(result.pins.filter(p => p.is_community));
    } catch (_) {
      setNearbyPins([]);
    }
  };

  const fetchCommunityStats = async () => {
    try {
      setIsLoading(true);
      const stats = await apiService.getCommunityStats();
      setCommunityStats(stats);
    } catch (error) {
      // keep whatever we have
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchCommunityStats(), fetchNearbyPins()]);
    setIsRefreshing(false);
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.openDrawer()}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{t('community.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('community.subtitle')}</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>🏘️ {t('common.loading')}</Text>
        </View>
      </View>
    );
  }

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
          <Text style={styles.headerTitle}>{t('community.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('community.subtitle')}</Text>
        </View>
      </View>

      {/* Community Content */}
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
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroIcon}>🏘️</Text>
          <Text style={styles.heroTitle}>{t('community.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('community.heroSubtitle')}</Text>
        </View>

        {/* Community Filter Toggle */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterTitle}>📺 Community-only radar</Text>
              <Text style={styles.filterSub}>Hides personal pins on the map</Text>
            </View>
            <Switch
              value={filterActive}
              onValueChange={toggleFilter}
              trackColor={{ false: '#E0E0E0', true: '#7B1FA2' }}
              thumbColor={filterActive ? '#CE93D8' : '#f4f3f4'}
            />
          </View>
          {filterActive && (
            <Text style={styles.filterActive}>✅ Community filter active — Radar shows community pins only</Text>
          )}
        </View>

        {/* Nearby community pins */}
        <View style={styles.nearbySection}>
          <Text style={styles.nearbySectionTitle}>📡 Signals nearby</Text>
          {nearbyPins.length === 0 ? (
            <View style={styles.emptyNearby}>
              <Text style={styles.emptyNearbyIcon}>🌊</Text>
              <Text style={styles.emptyNearbyText}>No community signals nearby</Text>
              <Text style={styles.emptyNearbySub}>Drop a pin with the community toggle to start one!</Text>
            </View>
          ) : (
            nearbyPins.slice(0, 5).map(pin => (
              <View key={pin.id} style={styles.nearbyItem}>
                <Text style={styles.nearbyItemContent} numberOfLines={2}>{pin.content}</Text>
                <Text style={styles.nearbyItemMeta}>❤️ {pin.likes}  👣 {pin.passes_by}</Text>
              </View>
            ))
          )}
        </View>

        {/* Stats Cards */}
        {communityStats && (
          <View style={styles.statsSection}>
            {/* Total Community Pins */}
            <View style={[styles.statCard, styles.statCardPrimary]}>
              <View style={styles.statCardIconContainer}>
                <Text style={styles.statCardBigIcon}>🌍</Text>
              </View>
              <Text style={styles.statCardValue}>{communityStats.total_community_pins}</Text>
              <Text style={styles.statCardLabel}>{t('community.totalCommunityPins')}</Text>
            </View>

            {/* User's Community Pins */}
            <View style={[styles.statCard, styles.statCardSecondary]}>
              <View style={styles.statCardIconContainer}>
                <Text style={styles.statCardBigIcon}>📌</Text>
              </View>
              <Text style={styles.statCardValue}>{communityStats.user_community_pins}</Text>
              <Text style={styles.statCardLabel}>{t('community.yourCommunityPins')}</Text>
            </View>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>💡</Text>
            <Text style={styles.infoTitle}>{t('community.infoTitle')}</Text>
            <Text style={styles.infoText}>{t('community.infoText')}</Text>
          </View>
        </View>

        {/* Community Guide */}
        <View style={styles.guideSection}>
          <Text style={styles.guideSectionTitle}>{t('community.howItWorks')}</Text>
          
          <View style={styles.guideItem}>
            <View style={styles.guideNumberBadge}>
              <Text style={styles.guideNumber}>1</Text>
            </View>
            <View style={styles.guideTextContainer}>
              <Text style={styles.guideItemTitle}>{t('community.step1Title')}</Text>
              <Text style={styles.guideItemText}>{t('community.step1Text')}</Text>
            </View>
          </View>

          <View style={styles.guideItem}>
            <View style={styles.guideNumberBadge}>
              <Text style={styles.guideNumber}>2</Text>
            </View>
            <View style={styles.guideTextContainer}>
              <Text style={styles.guideItemTitle}>{t('community.step2Title')}</Text>
              <Text style={styles.guideItemText}>{t('community.step2Text')}</Text>
            </View>
          </View>

          <View style={styles.guideItem}>
            <View style={styles.guideNumberBadge}>
              <Text style={styles.guideNumber}>3</Text>
            </View>
            <View style={styles.guideTextContainer}>
              <Text style={styles.guideItemTitle}>{t('community.step3Title')}</Text>
              <Text style={styles.guideItemText}>{t('community.step3Text')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
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

  // Community filter toggle card
  filterCard: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.md,
    marginBottom: MiyabiSpacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#7B1FA2',
    ...MiyabiShadows.sm,
  },
  filterRow: { flexDirection: 'row', alignItems: 'center' },
  filterTitle: { fontSize: 15, fontWeight: '700', color: MiyabiColors.sumi, marginBottom: 2 },
  filterSub:   { fontSize: 12, color: MiyabiColors.sumiLight },
  filterActive:{ fontSize: 12, color: '#45B74B', fontWeight: '600', marginTop: 8 },

  // Nearby community signals
  nearbySection: { marginBottom: MiyabiSpacing.lg },
  nearbySectionTitle: { ...MiyabiStyles.subheading, marginBottom: MiyabiSpacing.sm },
  emptyNearby: { alignItems: 'center', paddingVertical: 32, backgroundColor: MiyabiColors.cardBackground, borderRadius: MiyabiBorderRadius.md, ...MiyabiShadows.sm },
  emptyNearbyIcon: { fontSize: 40, marginBottom: 10 },
  emptyNearbyText: { fontSize: 16, fontWeight: '700', color: MiyabiColors.sumi, marginBottom: 4 },
  emptyNearbySub:  { fontSize: 12, color: MiyabiColors.sumiLight, textAlign: 'center', paddingHorizontal: 20 },
  nearbyItem: { backgroundColor: MiyabiColors.cardBackground, borderRadius: MiyabiBorderRadius.sm, padding: MiyabiSpacing.sm, marginBottom: MiyabiSpacing.xs, ...MiyabiShadows.sm, borderLeftWidth: 3, borderLeftColor: '#CE93D8' },
  nearbyItemContent: { fontSize: 13, color: MiyabiColors.sumi, marginBottom: 4 },
  nearbyItemMeta: { fontSize: 11, color: MiyabiColors.sumiLight },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    paddingVertical: MiyabiSpacing.xl,
    marginBottom: MiyabiSpacing.lg,
  },
  heroIcon: {
    fontSize: 64,
    marginBottom: MiyabiSpacing.md,
  },
  heroTitle: {
    ...MiyabiStyles.heading,
    textAlign: 'center',
    marginBottom: MiyabiSpacing.xs,
  },
  heroSubtitle: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    textAlign: 'center',
  },

  // Stats Section
  statsSection: {
    flexDirection: 'row',
    gap: MiyabiSpacing.md,
    marginBottom: MiyabiSpacing.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: MiyabiBorderRadius.lg,
    padding: MiyabiSpacing.lg,
    alignItems: 'center',
    ...MiyabiShadows.md,
  },
  statCardPrimary: {
    backgroundColor: '#F3E5F5',
  },
  statCardSecondary: {
    backgroundColor: '#E8F5E9',
  },
  statCardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: MiyabiSpacing.sm,
  },
  statCardBigIcon: {
    fontSize: 28,
  },
  statCardValue: {
    fontSize: 36,
    fontWeight: '800' as any,
    color: MiyabiColors.sumi,
    marginBottom: 4,
  },
  statCardLabel: {
    fontSize: MiyabiTypography.fontSize.sm,
    color: MiyabiColors.sumiLight,
    textAlign: 'center',
  },

  // Info Section
  infoSection: {
    marginBottom: MiyabiSpacing.lg,
  },
  infoCard: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.lg,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: MiyabiColors.bamboo,
    ...MiyabiShadows.sm,
  },
  infoIcon: {
    fontSize: 32,
    marginBottom: MiyabiSpacing.sm,
  },
  infoTitle: {
    ...MiyabiStyles.subheading,
    marginBottom: MiyabiSpacing.xs,
  },
  infoText: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Guide Section
  guideSection: {
    marginBottom: MiyabiSpacing.lg,
  },
  guideSectionTitle: {
    ...MiyabiStyles.subheading,
    marginBottom: MiyabiSpacing.md,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.md,
    marginBottom: MiyabiSpacing.sm,
    ...MiyabiShadows.sm,
  },
  guideNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MiyabiColors.bamboo,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: MiyabiSpacing.md,
    marginTop: 2,
  },
  guideNumber: {
    fontSize: MiyabiTypography.fontSize.base,
    fontWeight: '700' as any,
    color: '#FFFFFF',
  },
  guideTextContainer: {
    flex: 1,
  },
  guideItemTitle: {
    ...MiyabiStyles.body,
    fontWeight: '600' as any,
    marginBottom: 4,
  },
  guideItemText: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    lineHeight: 18,
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

export default CommunityScreen;
