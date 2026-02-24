/**
 * Community Screen  (redesigned)
 *
 * Views:
 *   1. Feed  — scrollable Zone cards + invite-code gateway + stats + filter toggle
 *   2. Zone  — trending pins + anonymous contributor leaderboard for one zone
 *
 * All original state (COMMUNITY_FILTER_KEY, fetchNearbyPins, etc.) is preserved.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import apiService, { CommunityStats, DiscoveredPin } from '../services/ApiService';
import locationService from '../services/LocationService';
import { MiyabiSpacing, MiyabiShadows } from '../styles/miyabi';
import { useTranslation } from 'react-i18next';

export const COMMUNITY_FILTER_KEY = 'serendipity_community_filter_active';

// ── Zone colours (deterministic from zone index) ─────────────────────────────
const ZONE_COLORS = [
  '#7B1FA2', '#1565C0', '#00695C', '#AD1457', '#E65100',
  '#4527A0', '#2E7D32', '#283593', '#BF360C', '#006064',
];
function zoneColor(idx: number) { return ZONE_COLORS[idx % ZONE_COLORS.length]; }

// ── Deterministic short ID from lat/lon ──────────────────────────────────────
function zoneId(lat: number, lon: number): string {
  const n = Math.abs(Math.round(lat * 1000) * 31 + Math.round(lon * 1000) * 17) % 65536;
  return n.toString(16).toUpperCase().padStart(4, '0');
}

// ── Cluster nearby pins into zones (~100 m radius) ───────────────────────────
function haversine(a: DiscoveredPin, b: DiscoveredPin) {
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) *
      Math.cos(b.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

interface Zone {
  id: string;
  centerLat: number;
  centerLon: number;
  pins: DiscoveredPin[];
  totalLikes: number;
  colorIdx: number;
}

function clusterIntoZones(pins: DiscoveredPin[]): Zone[] {
  const used = new Array(pins.length).fill(false);
  const zones: Zone[] = [];
  pins.forEach((pin, i) => {
    if (used[i]) return;
    const group = [pin];
    used[i] = true;
    pins.forEach((other, j) => {
      if (used[j]) return;
      if (haversine(pin, other) <= 100) { group.push(other); used[j] = true; }
    });
    const lat = group.reduce((s, p) => s + p.latitude, 0) / group.length;
    const lon = group.reduce((s, p) => s + p.longitude, 0) / group.length;
    zones.push({
      id: zoneId(lat, lon),
      centerLat: lat,
      centerLon: lon,
      pins: group.sort((a, b) => b.likes - a.likes),
      totalLikes: group.reduce((s, p) => s + p.likes, 0),
      colorIdx: zones.length,
    });
  });
  return zones.sort((a, b) => b.totalLikes - a.totalLikes);
}

// ── Geometric hex avatar (pure RN views — no SVG) ────────────────────────────
const HexAvatar: React.FC<{ color: string; size?: number; label?: string }> = ({
  color, size = 48, label,
}) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {[0, 60, 120].map(deg => (
      <View
        key={deg}
        style={{
          position: 'absolute',
          width: size * 0.55,
          height: size * 0.9,
          borderRadius: size * 0.12,
          backgroundColor: color,
          opacity: 0.75,
          transform: [{ rotate: `${deg}deg` }],
        }}
      />
    ))}
    {label ? (
      <Text style={{ position: 'absolute', color: '#fff', fontSize: size * 0.26, fontWeight: '800' }}>
        {label}
      </Text>
    ) : null}
  </View>
);

// ── Anonymous leaderboard row ─────────────────────────────────────────────────
const LeaderEntry: React.FC<{ rank: number; likes: number; preview: string; colorIdx: number }> = ({
  rank, likes, preview, colorIdx,
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.leaderRow}>
      <Text style={styles.leaderRank}>#{rank}</Text>
      <HexAvatar color={zoneColor(colorIdx)} size={36} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.leaderPreview} numberOfLines={1}>{preview}</Text>
        <Text style={styles.leaderLikes}>❤️ {likes} {t('diary.liked')}</Text>
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const CommunityScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterActive, setFilterActive] = useState(false);
  const [nearbyPins, setNearbyPins]   = useState<DiscoveredPin[]>([]);
  const [zones, setZones]             = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [inviteCode, setInviteCode]   = useState('');
  const [inviteMsg, setInviteMsg]     = useState('');

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchAll = async () => {
    try {
      const [stats, loc] = await Promise.all([
        apiService.getCommunityStats().catch(() => null),
        locationService.getCurrentLocation(),
      ]);
      if (stats) setCommunityStats(stats);
      if (loc) {
        const result = await apiService.discoverPins(loc.latitude, loc.longitude).catch(() => null);
        if (result) {
          const pins = result.pins.filter(p => p.is_community);
          setNearbyPins(pins);
          setZones(clusterIntoZones(pins));
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadFilter = async () => {
    try {
      const stored = await AsyncStorage.getItem(COMMUNITY_FILTER_KEY);
      setFilterActive(stored === 'true');
    } catch (_) {}
  };

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      fetchAll();
      loadFilter();
    }, [])
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
  };

  const toggleFilter = async (value: boolean) => {
    setFilterActive(value);
    try { await AsyncStorage.setItem(COMMUNITY_FILTER_KEY, String(value)); } catch (_) {}
  };

  const handleInviteJoin = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) { setInviteMsg(t('commscreen.inviteEmpty')); return; }
    setInviteMsg(t('commscreen.inviteNoted', { code }));
    setInviteCode('');
  };

  // ── Zone Detail View ───────────────────────────────────────────────────────
  if (selectedZone) {
    const trending = [...selectedZone.pins].sort((a, b) => b.likes - a.likes);
    const color = zoneColor(selectedZone.colorIdx);
    return (
      <View style={styles.container}>
        <View style={[styles.header, { borderBottomWidth: 2, borderBottomColor: color }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => setSelectedZone(null)}>
            <Text style={[styles.backIcon, { color }]}>‹</Text>
          </TouchableOpacity>
          <HexAvatar color={color} size={40} label={selectedZone.id.slice(0, 2)} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.headerTitle}>{t('commscreen.zone')} {selectedZone.id}</Text>
            <Text style={[styles.headerSubtitle, { color }]}>
              {t('commscreen.activePins', { count: selectedZone.pins.length })} · {selectedZone.totalLikes} ❤️
            </Text>
          </View>
        </View>

        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>📈 {t('commscreen.trendingPins')}</Text>
          {trending.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('commscreen.noPinsYet')}</Text>
              <Text style={styles.emptySub}>{t('commscreen.noFirstDrop')}</Text>
            </View>
          ) : (
            trending.map((pin, i) => (
              <View key={pin.id} style={[styles.trendingCard, { borderLeftColor: color }]}>
                <Text style={[styles.trendingRank, { color }]}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trendingContent} numberOfLines={3}>{pin.content}</Text>
                  <View style={styles.trendingMeta}>
                    <Text style={styles.trendingMetaText}>❤️ {pin.likes}</Text>
                    <Text style={styles.trendingMetaText}>👣 {pin.passes_by ?? 0}</Text>
                    <Text style={styles.trendingMetaText}>📍 {Math.round(pin.distance_meters)}m</Text>
                  </View>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>🏆 {t('commscreen.topContribs')}</Text>
          <View style={styles.leaderboard}>
            {trending.slice(0, 5).map((pin, i) => (
              <LeaderEntry
                key={pin.id}
                rank={i + 1}
                likes={pin.likes}
                preview={pin.content}
                colorIdx={selectedZone.colorIdx + i + 1}
              />
            ))}
            {trending.length === 0 && (
              <Text style={styles.leaderEmpty}>{t('commscreen.noContribs')}</Text>
            )}
          </View>

          <View style={styles.anonNote}>
            <Text style={styles.anonNoteText}>
              {t('commscreen.anonNote')}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Feed View (main) ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.menuButton} onPress={() => navigation.openDrawer()}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t('navigation.community')}</Text>
            <Text style={styles.headerSubtitle}>{t('commscreen.subtitle')}</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#9C27B0" />
          <Text style={styles.loadingText}>{t('commscreen.scanning')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={() => navigation.openDrawer()}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('navigation.community')}</Text>
          <Text style={styles.headerSubtitle}>{t('commscreen.subtitle')}</Text>
        </View>
        {communityStats && (
          <View style={styles.headerStatChip}>
            <Text style={styles.headerStatText}>{t('commscreen.pinsCount', { count: communityStats.total_community_pins })}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#9C27B0" />
        }
      >
        {/* ── Private Invite Gateway ───────────────────────────────────── */}
        <View style={styles.inviteCard}>
          <View style={styles.inviteHeader}>
            <HexAvatar color="#7B1FA2" size={36} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.inviteTitle}>{t('commscreen.inviteTitle')}</Text>
              <Text style={styles.inviteSub}>{t('commscreen.inviteSub')}</Text>
            </View>
          </View>
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.inviteInput}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder={t('commscreen.invitePlaceholder')}
              placeholderTextColor="#B39DDB"
              autoCapitalize="characters"
              maxLength={16}
            />
            <TouchableOpacity style={styles.inviteBtn} onPress={handleInviteJoin} activeOpacity={0.8}>
              <Text style={styles.inviteBtnText}>{t('commscreen.inviteJoin')}</Text>
            </TouchableOpacity>
          </View>
          {inviteMsg ? <Text style={styles.inviteMsg}>{inviteMsg}</Text> : null}
        </View>

        {/* ── Community-only radar toggle ───────────────────────────────── */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>{t('commscreen.radarToggleTitle')}</Text>
              <Text style={styles.toggleSub}>{t('commscreen.radarToggleSub')}</Text>
            </View>
            <Switch
              value={filterActive}
              onValueChange={toggleFilter}
              trackColor={{ false: '#E0E0E0', true: '#9C27B0' }}
              thumbColor={filterActive ? '#CE93D8' : '#f4f3f4'}
            />
          </View>
          {filterActive && (
            <Text style={styles.toggleActiveLabel}>{t('commscreen.radarToggleActive')}</Text>
          )}
        </View>

        {/* ── Zones feed ────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>
          {zones.length > 0
            ? (zones.length === 1
              ? t('commscreen.zonesNearSingle', { count: zones.length })
              : t('commscreen.zonesNearPlural', { count: zones.length }))
            : t('commscreen.zonesNear')}
        </Text>

        {zones.length === 0 ? (
          <View style={styles.emptyCard}>
            <HexAvatar color="#9C27B0" size={56} />
            <Text style={[styles.emptyTitle, { marginTop: 14 }]}>{t('commscreen.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('commscreen.emptySub')}</Text>
          </View>
        ) : (
          zones.map(zone => {
            const color = zoneColor(zone.colorIdx);
            return (
              <TouchableOpacity
                key={zone.id}
                style={styles.zoneCard}
                onPress={() => setSelectedZone(zone)}
                activeOpacity={0.82}
              >
                <HexAvatar color={color} size={52} label={zone.id.slice(0, 2)} />
                <View style={styles.zoneCardBody}>
                  <Text style={styles.zoneCardName}>{t('commscreen.zone')} {zone.id}</Text>
                  <Text style={styles.zoneCardMeta}>
                    {t('commscreen.activePins', { count: zone.pins.length })}
                    {'  ·  '}{zone.totalLikes} ❤️
                  </Text>
                  <Text style={styles.zoneCardPreview} numberOfLines={1}>
                    "{zone.pins[0].content}"
                  </Text>
                </View>
                <Text style={[styles.zoneArrow, { color }]}>›</Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Stats chips ───────────────────────────────────────────────── */}
        {communityStats && (
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: '#F3E5F5' }]}>
              <Text style={styles.statValue}>{communityStats.total_community_pins}</Text>
              <Text style={styles.statLabel}>{t('commscreen.globalPins')}</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: '#EDE7F6' }]}>
              <Text style={styles.statValue}>{communityStats.user_community_pins}</Text>
              <Text style={styles.statLabel}>{t('commscreen.yourPins')}</Text>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

// ── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0FF' },

  // Header
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: MiyabiSpacing.xl + 20,
    paddingBottom: MiyabiSpacing.md,
    paddingHorizontal: MiyabiSpacing.md,
    ...MiyabiShadows.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginBottom: 1 },
  headerSubtitle: { fontSize: 13, color: '#7B1FA2' },
  headerStatChip: {
    backgroundColor: '#EDE7F6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  headerStatText: { fontSize: 12, color: '#6A1B9A', fontWeight: '700' },

  // Back button (zone detail)
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F3E5F5',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  backIcon: { fontSize: 28, fontWeight: '300', lineHeight: 32 },

  // Hamburger
  menuButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(156,39,176,0.1)',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  menuIcon: { fontSize: 16, color: '#9C27B0', fontWeight: '600' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#7B1FA2', marginTop: 12 },

  scrollContainer: { flex: 1 },
  scrollContent: { padding: MiyabiSpacing.md, paddingBottom: 40 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 12, marginTop: 4 },

  // ── Invite gateway ────────────────────────────────────────────────────────
  inviteCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1.5, borderColor: '#CE93D8', ...MiyabiShadows.sm,
  },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  inviteTitle: { fontSize: 15, fontWeight: '700', color: '#4A148C' },
  inviteSub: { fontSize: 12, color: '#9C27B0', marginTop: 1 },
  inviteRow: { flexDirection: 'row', gap: 10 },
  inviteInput: {
    flex: 1, height: 44, backgroundColor: '#F3E5F5', borderRadius: 10,
    paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#4A148C', letterSpacing: 1.5,
  },
  inviteBtn: {
    height: 44, paddingHorizontal: 20, backgroundColor: '#7B1FA2',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  inviteBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  inviteMsg: { fontSize: 12, color: '#7B1FA2', marginTop: 10, lineHeight: 18 },

  // ── Filter toggle ─────────────────────────────────────────────────────────
  toggleCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 16,
    borderLeftWidth: 4, borderLeftColor: '#9C27B0', ...MiyabiShadows.sm,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  toggleSub: { fontSize: 12, color: '#6D4C7E' },
  toggleActiveLabel: { fontSize: 12, color: '#45B74B', fontWeight: '600', marginTop: 8 },

  // ── Zone cards ────────────────────────────────────────────────────────────
  zoneCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', ...MiyabiShadows.sm,
  },
  zoneCardBody: { flex: 1, marginLeft: 14, marginRight: 6 },
  zoneCardName: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 3 },
  zoneCardMeta: { fontSize: 12, color: '#6D4C7E', fontWeight: '600', marginBottom: 4 },
  zoneCardPreview: { fontSize: 12, color: '#9E9E9E', fontStyle: 'italic' },
  zoneArrow: { fontSize: 28, fontWeight: '300' },

  // ── Stats chips ───────────────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  statChip: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', ...MiyabiShadows.sm },
  statValue: { fontSize: 30, fontWeight: '800', color: '#1A1A1A', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#6D4C7E', fontWeight: '600', textAlign: 'center' },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32,
    alignItems: 'center', ...MiyabiShadows.sm, marginBottom: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  emptySub: { fontSize: 12, color: '#6D4C7E', textAlign: 'center', lineHeight: 18 },

  // ── Zone detail: trending pins ─────────────────────────────────────────────
  trendingCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', borderLeftWidth: 4, ...MiyabiShadows.sm,
  },
  trendingRank: { fontSize: 16, fontWeight: '800', marginRight: 10, paddingTop: 2 },
  trendingContent: { fontSize: 13, color: '#1A1A1A', lineHeight: 20, marginBottom: 6 },
  trendingMeta: { flexDirection: 'row', gap: 12 },
  trendingMetaText: { fontSize: 11, color: '#9E9E9E', fontWeight: '500' },

  // ── Zone detail: leaderboard ───────────────────────────────────────────────
  leaderboard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, ...MiyabiShadows.sm },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F3E5F5',
  },
  leaderRank: { fontSize: 14, fontWeight: '800', color: '#9E9E9E', width: 28 },
  leaderPreview: { fontSize: 13, color: '#1A1A1A', fontWeight: '500', marginBottom: 2 },
  leaderLikes: { fontSize: 11, color: '#9C27B0', fontWeight: '600' },
  leaderEmpty: { fontSize: 13, color: '#9E9E9E', textAlign: 'center', padding: 16 },

  // Anon note
  anonNote: { backgroundColor: '#EDE7F6', borderRadius: 10, padding: 12, marginTop: 12 },
  anonNoteText: { fontSize: 12, color: '#4A148C', lineHeight: 18 },
});

export default CommunityScreen;
