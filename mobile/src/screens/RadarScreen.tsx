/**
 * Radar Screen - The Home Screen
 * 
 * Pokemon Go Style Real-time Map:
 * - Interactive vector map with MapLibre and OpenFreeMap
 * - Real GPS tracking with 50m discovery radius
 * - Minimalistic pin markers
 * - Detailed bottom sheet for selected pins
 * - List/Map view toggle
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Dimensions,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { COMMUNITY_FILTER_KEY } from './CommunityScreen';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import locationService, { LocationCoords } from '../services/LocationService';
import apiService, { DiscoveredPin } from '../services/ApiService';
import pinPreferencesService from '../services/PinPreferencesService';
import { BasicMap, ExploredCircle } from '../components';
import { SimpleConfirmDialog } from '../components/SimpleConfirmDialog';
import { MiyabiColors, MiyabiSpacing, MiyabiShadows } from '../styles/miyabi';
import { reverseGeocode, forwardGeocode, GeocodeResult } from '../services/LocationIQService';

// AsyncStorage key for persisting explored circles across sessions
const FOG_STORAGE_KEY = 'serendipity_fog_circles';
// AsyncStorage key for persisting per-pin interaction state (like/dislike/report)
const INTERACTIONS_KEY = 'serendipity_pin_interactions';
// Minimum distance (metres) between consecutive fog circles
const FOG_CIRCLE_STRIDE = 15;

// How close two fog-circle centres can be before we skip adding a duplicate
const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  type: 'text' | 'photo';
  content?: string;
  likes?: number;
  dislikes?: number;
  reports?: number;
  is_suppressed?: boolean;  // Visual suppression (reports > likes * 2)
  is_community?: boolean;  // Community pin flag
  distance?: number;
  isMuted?: boolean; // For greyed out display (personal hide)
}

const { height } = Dimensions.get('window');

/**
 * Calculate bearing (azimuth) from point A to point B
 * Returns angle in degrees (0-360) where 0 is North
 */
const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  const bearing = ((θ * 180) / Math.PI + 360) % 360;
  return bearing;
};

/**
 * Convert bearing to compass direction and relative guidance
 * @param bearing - absolute bearing to destination (0-360)
 * @param heading - current device heading (0-360)
 */
const getDirectionGuidance = (bearing: number, heading: number, t: (key: string) => string): string => {
  // Calculate relative angle (-180 to 180)
  let relative = bearing - heading;
  if (relative > 180) relative -= 360;
  if (relative < -180) relative += 360;

  // Get compass direction using i18n keys
  const dirKeys = ['dirN', 'dirNE', 'dirE', 'dirSE', 'dirS', 'dirSW', 'dirW', 'dirNW'];
  const index = Math.round(bearing / 45) % 8;
  const compass = t(`radar.${dirKeys[index]}`);

  // Get relative guidance using i18n keys
  let guidanceKey: string;
  if (Math.abs(relative) < 20) {
    guidanceKey = 'radar.dirStraight';
  } else if (Math.abs(relative) > 160) {
    guidanceKey = 'radar.dirBehind';
  } else if (relative > 0) {
    guidanceKey = relative < 90 ? 'radar.dirRight' : 'radar.dirRightTurn';
  } else {
    guidanceKey = relative > -90 ? 'radar.dirLeft' : 'radar.dirLeftTurn';
  }

  return `📍 ${compass} • ${t(guidanceKey)}`;
};

// Convert DiscoveredPins to MapPins for BasicMap
// Uses actual lat/lon coordinates from backend (absolute positioning)
const convertToMapPins = async (pins: DiscoveredPin[], userLat: number, userLon: number): Promise<MapPin[]> => {
  const mapPins = await Promise.all(pins.map(async pin => {
    // Check if pin is muted (personal hide)
    const isMuted = await pinPreferencesService.isMuted(pin.id);
    
    return {
      id: String(pin.id),
      latitude: pin.latitude,
      longitude: pin.longitude,
      type: 'text' as const,
      content: pin.content,
      likes: pin.likes,
      dislikes: pin.dislikes,
      reports: pin.reports,
      is_suppressed: pin.is_suppressed,
      is_community: pin.is_community,
      distance: pin.distance_meters,
      isMuted,
    };
  }));
  
  return mapPins;
};

// Bottom Sheet Detail Component
const BottomSheet: React.FC<{
  pin: DiscoveredPin | null;
  userLocation: LocationCoords | null;
  heading: number;
  onClose: () => void;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onReport: (id: number) => void;
  onDelete?: (id: number) => void;
  userInteraction?: 'liked' | 'disliked' | 'reported' | null;
}> = ({ pin, userLocation, heading, onClose, onLike, onDislike, onReport, onDelete, userInteraction }) => {
  const { t } = useTranslation();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (pin) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [pin]);

  if (!pin) return null;

  const expiresDate = new Date(pin.expires_at);
  const expiresStr = expiresDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.bottomSheetHandle} />

      {/* Header: badge + close */}
      <View style={styles.bottomSheetHeader}>
        <View style={styles.bsHeaderLeft}>
          {pin.is_community && (
            <View style={styles.communityBadge}>
              <Text style={styles.communityBadgeText}>★ {t('radar.communityBadge')}</Text>
            </View>
          )}
          <View style={styles.distanceChip}>
            <Text style={styles.distanceChipText}>📍 {Math.round(pin.distance_meters)}m</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.bottomSheetClose}>
          <Text style={styles.bottomSheetCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation compass bar */}
      {userLocation && pin.latitude !== undefined && pin.longitude !== undefined && (
        <View style={styles.navigationBar}>
          <Text style={styles.navigationText}>
            {getDirectionGuidance(
              calculateBearing(
                userLocation.latitude,
                userLocation.longitude,
                pin.latitude,
                pin.longitude
              ),
              heading,
              t
            )}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.bottomSheetContent}
        contentContainerStyle={styles.bottomSheetContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Message */}
        <Text style={styles.bottomSheetMessage}>{pin.content}</Text>

        {/* Stats — 2×2 grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statChip}>
            <Text style={styles.statChipIcon}>❤️</Text>
            <Text style={styles.statChipText}>{pin.likes} {t('radar.likes')}</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipIcon}>👣</Text>
            <Text style={styles.statChipText}>{pin.passes_by ?? 0} {t('radar.passed')}</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipIcon}>🚩</Text>
            <Text style={styles.statChipText}>{pin.reports} {t('radar.reports')}</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statChipIcon}>⏳</Text>
            <Text style={styles.statChipText} numberOfLines={1}>{t('radar.expires')} {expiresStr}</Text>
          </View>
        </View>

        {/* Actions row 1: Like + Dislike */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.likeButton, userInteraction === 'liked' && { backgroundColor: '#1B5E20' }, (userInteraction === 'disliked' || userInteraction === 'reported') && { opacity: 0.4 }]}
            onPress={() => onLike(pin.id)}
            activeOpacity={0.8}
            disabled={userInteraction === 'disliked' || userInteraction === 'reported'}
          >
            <Text style={styles.likeButtonText}>❤️ {t('radar.like')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dislikeButton, userInteraction === 'disliked' && { backgroundColor: '#FFCDD2', borderColor: '#EF9A9A' }, (userInteraction === 'liked' || userInteraction === 'reported') && { opacity: 0.4 }]}
            onPress={() => onDislike(pin.id)}
            activeOpacity={0.8}
            disabled={userInteraction === 'liked' || userInteraction === 'reported'}
          >
            <Text style={styles.dislikeButtonText}>💔 {t('radar.dislike')}</Text>
          </TouchableOpacity>
        </View>

        {/* Actions row 2: Report (full width) */}
        <TouchableOpacity
          style={[styles.reportButton, userInteraction === 'reported' && { backgroundColor: '#FFE0B2', borderColor: '#FFCC80' }, (userInteraction === 'liked' || userInteraction === 'disliked') && { opacity: 0.4 }]}
          onPress={() => onReport(pin.id)}
          activeOpacity={0.8}
          disabled={userInteraction === 'liked' || userInteraction === 'disliked'}
        >
          <Text style={styles.reportButtonText}>🚩 {t('radar.reportBtn')}</Text>
        </TouchableOpacity>

        {/* Delete — only for own pins */}
        {pin.is_own_pin && onDelete && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onDelete(pin.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteButtonText}>🗑️ {t('radar.deleteBtn')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </Animated.View>
  );
};

// ── Helpers shared with CommunityHubSheet ────────────────────────────────────
const COMMUNITY_HUB_COLORS = [
  '#7B1FA2', '#1565C0', '#00695C', '#AD1457', '#E65100',
  '#4527A0', '#2E7D32', '#283593', '#BF360C', '#006064',
];
function computeZoneKey(lat: number, lon: number): string {
  const n = Math.abs(Math.round(lat * 1000) * 31 + Math.round(lon * 1000) * 17) % 65536;
  return n.toString(16).toUpperCase().padStart(4, '0');
}
function hubZoneColor(lat: number, lon: number): string {
  const key = computeZoneKey(lat, lon);
  return COMMUNITY_HUB_COLORS[parseInt(key, 16) % COMMUNITY_HUB_COLORS.length];
}

// ── Community Hub Sheet — shown when a community pin is tapped ────────────────
const CommunityHubSheet: React.FC<{
  pin: DiscoveredPin | null;
  zonePins: DiscoveredPin[];
  userLocation: LocationCoords | null;
  heading: number;
  onClose: () => void;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
  onReport: (id: number) => void;
  onDelete?: (id: number) => void;
  userInteraction?: 'liked' | 'disliked' | 'reported' | null;
}> = ({ pin, zonePins, userLocation, heading, onClose, onLike, onDislike, onReport, onDelete, userInteraction }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'board' | 'members'>('board');
  const [chatMsg, setChatMsg] = useState('');
  const [chatLog, setChatLog] = useState<{ text: string }[]>([]);
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (pin) {
      setActiveTab('board');
      setChatLog([]);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [pin]);

  if (!pin) return null;

  const color       = hubZoneColor(pin.latitude, pin.longitude);
  const zoneKey     = computeZoneKey(pin.latitude, pin.longitude);
  const pulse       = Math.max(pin.passes_by ?? 0, pin.likes);
  const within200   = (pin.distance_meters ?? Infinity) <= 200;
  const trending    = [...zonePins].sort((a, b) => b.likes - a.likes);

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    setChatLog(prev => [...prev, { text: chatMsg.trim() }]);
    setChatMsg('');
  };

  const expiresDate = new Date(pin.expires_at);
  const expiresStr  = expiresDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bottomSheetHandle} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.bottomSheetHeader, { borderBottomWidth: 2, borderBottomColor: color }]}>
        <View style={styles.bsHeaderLeft}>
          <View style={[styles.communityBadge, { backgroundColor: color }]}>
            <Text style={styles.communityBadgeText}>★ {t('hub.zone')} {zoneKey.slice(0, 2)}</Text>
          </View>
          <View style={styles.distanceChip}>
            <Text style={styles.distanceChipText}>📍 {Math.round(pin.distance_meters)}m</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.bottomSheetClose}>
          <Text style={styles.bottomSheetCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pulse row (headcount) ───────────────────────────────────────── */}
      <View style={[styles.communityPulse, { backgroundColor: color + '18' }]}>
        <View style={styles.pulseLeft}>
          <Text style={styles.pulseIcon}>🔥</Text>
          <Text style={styles.pulseText}>{pulse} {pulse === 1 ? t('hub.visitedOne') : t('hub.visitedMany')}</Text>
        </View>
        <View style={[styles.pulseDot, { backgroundColor: within200 ? '#4CAF50' : '#9E9E9E' }]} />
        <Text style={[styles.pulseStatus, { color: within200 ? '#4CAF50' : '#9E9E9E' }]}>
          {within200 ? t('hub.inRange') : t('hub.outRange')}
        </Text>
      </View>

      {/* ── Navigation compass bar ──────────────────────────────────────── */}
      {userLocation && (
        <View style={styles.navigationBar}>
          <Text style={styles.navigationText}>
            {getDirectionGuidance(
              calculateBearing(userLocation.latitude, userLocation.longitude, pin.latitude, pin.longitude),
              heading,
              t
            )}
          </Text>
        </View>
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <View style={styles.communityTabBar}>
        {(['board', 'members'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.communityTab, activeTab === tab && { borderBottomColor: color, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.communityTabText, activeTab === tab && { color }]}>
              {tab === 'board' ? `📋 ${t('hub.boardTab')}` : `👥 ${t('hub.membersTab')}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.bottomSheetContent}
        contentContainerStyle={styles.bottomSheetContentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ══════════ BOARD TAB ══════════ */}
        {activeTab === 'board' && (
          <>
            {/* Pin text */}
            <Text style={styles.bottomSheetMessage}>{pin.content}</Text>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statChip}>
                <Text style={styles.statChipIcon}>❤️</Text>
                <Text style={styles.statChipText}>{pin.likes} {t('radar.likes')}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipIcon}>👣</Text>
                <Text style={styles.statChipText}>{pin.passes_by ?? 0} {t('radar.passed')}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipIcon}>📌</Text>
                <Text style={styles.statChipText}>{t('hub.zonePins', { count: zonePins.length })}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipIcon}>⏳</Text>
                <Text style={styles.statChipText} numberOfLines={1}>{t('radar.expires')} {expiresStr}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.likeButton, userInteraction === 'liked' && { backgroundColor: '#1B5E20' }, (userInteraction === 'disliked' || userInteraction === 'reported') && { opacity: 0.4 }]}
                onPress={() => onLike(pin.id)}
                activeOpacity={0.8}
                disabled={userInteraction === 'disliked' || userInteraction === 'reported'}
              >
                <Text style={styles.likeButtonText}>❤️ {t('radar.like')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkInButton, { backgroundColor: within200 ? color : '#E0E0E0' }]}
                disabled={!within200}
                activeOpacity={0.8}
              >
                <Text style={[styles.checkInButtonText, { color: within200 ? '#FFF' : '#9E9E9E' }]}>
                  {within200 ? `✓ ${t('hub.checkedIn')}` : `📍 ${t('hub.checkIn')}`}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.reportButton, userInteraction === 'reported' && { backgroundColor: '#FFE0B2', borderColor: '#FFCC80' }, (userInteraction === 'liked' || userInteraction === 'disliked') && { opacity: 0.4 }]}
              onPress={() => onReport(pin.id)}
              activeOpacity={0.8}
              disabled={userInteraction === 'liked' || userInteraction === 'disliked'}
            >
              <Text style={styles.reportButtonText}>🚩 {t('radar.reportBtn')}</Text>
            </TouchableOpacity>
            {pin.is_own_pin && onDelete && (
              <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(pin.id)} activeOpacity={0.8}>
                <Text style={styles.deleteButtonText}>🗑️ {t('radar.deleteBtn')}</Text>
              </TouchableOpacity>
            )}

            {/* Zone Board: other pins from nearby */}
            {trending.filter(p => p.id !== pin.id).length > 0 && (
              <>
                <Text style={[styles.boardSectionTitle, { marginTop: 16 }]}>📋 {t('hub.zoneBoard')}</Text>
                {trending.filter(p => p.id !== pin.id).slice(0, 5).map(p => (
                  <View key={p.id} style={[styles.boardCard, { borderLeftColor: color }]}>
                    <Text style={styles.boardCardContent} numberOfLines={2}>{p.content}</Text>
                    <Text style={styles.boardCardMeta}>❤️ {p.likes}  👣 {p.passes_by ?? 0}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Live Chat */}
            <Text style={[styles.boardSectionTitle, { marginTop: 16 }]}>💬 {t('hub.liveChat')}</Text>
            {!within200 ? (
              <View style={styles.chatLockNote}>
                <Text style={styles.chatLockText}>🔒 {t('hub.chatLocked')}</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.chatLog} nestedScrollEnabled>
                  {chatLog.length === 0 ? (
                    <Text style={styles.chatEmptyText}>No messages yet — say hi! 👋</Text>
                  ) : (
                    chatLog.map((m, i) => (
                      <View key={i} style={styles.chatBubble}>
                        <Text style={styles.chatBubbleText}>{m.text}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>
                <View style={styles.chatInputRow}>
                  <TextInput
                    style={styles.chatInput}
                    value={chatMsg}
                    onChangeText={setChatMsg}
                    placeholder={t('hub.chatPlaceholder')}
                    placeholderTextColor="#B39DDB"
                    returnKeyType="send"
                    onSubmitEditing={sendChat}
                  />
                  <TouchableOpacity
                    style={[styles.chatSendBtn, { backgroundColor: color }]}
                    onPress={sendChat}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.chatSendBtnText}>↑</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        {/* ══════════ MEMBERS TAB ══════════ */}
        {activeTab === 'members' && (
          <>
            <Text style={styles.boardSectionTitle}>🏆 {t('hub.topContribs')}</Text>
            <Text style={styles.memberAnonNote}>{t('hub.anonNote')}</Text>

            {trending.length === 0 ? (
              <View style={styles.emptyMembersCard}>
                <Text style={styles.emptyMembersText}>{t('hub.noContribs')}</Text>
              </View>
            ) : (
              trending.slice(0, 5).map((p, i) => {
                const avatarColor = COMMUNITY_HUB_COLORS[(parseInt(zoneKey, 16) + i + 1) % COMMUNITY_HUB_COLORS.length];
                return (
                  <View key={p.id} style={styles.memberRow}>
                    {/* Hex avatar */}
                    <View style={styles.memberAvatarWrap}>
                      {[0, 60, 120].map(deg => (
                        <View
                          key={deg}
                          style={[
                            styles.memberAvatarLayer,
                            {
                              backgroundColor: avatarColor,
                              transform: [{ rotate: `${deg}deg` }],
                            },
                          ]}
                        />
                      ))}
                      <Text style={styles.memberAvatarLabel}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.memberPreview} numberOfLines={1}>{p.content}</Text>
                      <Text style={styles.memberMeta}>❤️ {p.likes}  👣 {p.passes_by ?? 0}</Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Check-in / See who's here banner */}
            <View style={[styles.checkInBanner, { borderColor: color }]}>
              <Text style={styles.checkInBannerTitle}>📍 {t('hub.checkInTitle')}</Text>
              <Text style={styles.checkInBannerSub}>
                {within200
                  ? t('hub.inRangeSub')
                  : t('hub.outRangeSub', { distance: Math.round(pin.distance_meters) })}
              </Text>
              {within200 && (
                <View style={[styles.checkInActiveBadge, { backgroundColor: color }]}>
                  <Text style={styles.checkInActiveBadgeText}>✓ {t('hub.activeInZone')}</Text>
                </View>
              )}
            </View>

            {/* Dislike + report */}
            <TouchableOpacity
              style={[styles.dislikeButton, userInteraction === 'disliked' && { backgroundColor: '#FFCDD2', borderColor: '#EF9A9A' }, (userInteraction === 'liked' || userInteraction === 'reported') && { opacity: 0.4 }]}
              onPress={() => onDislike(pin.id)}
              activeOpacity={0.8}
              disabled={userInteraction === 'liked' || userInteraction === 'reported'}
            >
              <Text style={styles.dislikeButtonText}>💔 {t('radar.dislike')}</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </Animated.View>
  );
};

// Main Radar Screen
const RadarScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  const [isSearching, setIsSearching] = useState(false);
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [discoveredPins, setDiscoveredPins] = useState<DiscoveredPin[]>([]);
  const [mapPins, setMapPins] = useState<MapPin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPin, setSelectedPin] = useState<DiscoveredPin | null>(null);
  const [heading, setHeading] = useState<number>(0);
  // Fog of war
  const [exploredCircles, setExploredCircles] = useState<ExploredCircle[]>([]);
  const lastFogCircleRef = useRef<ExploredCircle | null>(null);
  // Cluster bottom sheet (shows list of pins in a cluster)
  const [clusterPins, setClusterPins] = useState<DiscoveredPin[]>([]);
  const [clusterVisible, setClusterVisible] = useState(false);
  // Community filter — mirrors toggle in CommunityScreen via AsyncStorage
  const [communityFilterActive, setCommunityFilterActive] = useState(false);
  const dismissedPinIds = useRef<Set<number>>(new Set()).current;
  // Per-pin interaction tracking: liked | disliked | reported | null
  const [pinInteractions, setPinInteractions] = useState<Record<number, 'liked' | 'disliked' | 'reported' | null>>({});

  // Community Hub: pins in the same zone (≤ 100m) as the selected community pin
  const [zonePins, setZonePins] = useState<DiscoveredPin[]>([]);
  useEffect(() => {
    if (selectedPin?.is_community) {
      setZonePins(
        discoveredPins.filter(p =>
          p.is_community &&
          haversineMeters(selectedPin.latitude, selectedPin.longitude, p.latitude, p.longitude) <= 100
        )
      );
    } else {
      setZonePins([]);
    }
  }, [selectedPin, discoveredPins]);

  // LocationIQ search
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lon: number; label?: string } | null>(null);
  // Increment to tell BasicMap to animate rotation back to 0°
  const [resetMapToken, setResetMapToken] = useState(0);
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

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

  // Turn off the community-only map filter and persist the change
  const turnOffCommunityFilter = async () => {
    setCommunityFilterActive(false);
    try { await AsyncStorage.setItem(COMMUNITY_FILTER_KEY, 'false'); } catch (_) {}
  };

  // Save a pin interaction to state + AsyncStorage
  const saveInteraction = async (pinId: number, type: 'liked' | 'disliked' | 'reported' | null) => {
    const next = { ...pinInteractions, [pinId]: type };
    setPinInteractions(next);
    try { await AsyncStorage.setItem(INTERACTIONS_KEY, JSON.stringify(next)); } catch (_) {}
  };

  // Initialize tracking + heading subscription on mount
  useEffect(() => {
    loadFogCircles();
    initializeTracking();
    checkApiConnection();
    // Load persisted pin interactions
    AsyncStorage.getItem(INTERACTIONS_KEY).then(raw => {
      if (raw) setPinInteractions(JSON.parse(raw));
    }).catch(() => {});

    let headingSub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        headingSub = await Location.watchHeadingAsync((h) => {
          if (h.trueHeading >= 0) setHeading(h.trueHeading);
          else if (h.magHeading >= 0) setHeading(h.magHeading);
        });
      } catch (e) {
        console.warn('Heading unavailable', e);
      }
    })();

    return () => {
      locationService.stopTracking();
      headingSub?.remove();
    };
  }, []);

  // Persist fog circles to AsyncStorage whenever they change
  useEffect(() => {
    if (exploredCircles.length > 0) {
      AsyncStorage.setItem(FOG_STORAGE_KEY, JSON.stringify(exploredCircles)).catch(() => {});
    }
  }, [exploredCircles]);

  const loadFogCircles = async () => {
    try {
      const raw = await AsyncStorage.getItem(FOG_STORAGE_KEY);
      if (raw) {
        const circles: ExploredCircle[] = JSON.parse(raw);
        setExploredCircles(circles);
        if (circles.length > 0) lastFogCircleRef.current = circles[circles.length - 1];
      }
    } catch { /* non-critical */ }
  };

  /** Add a fog circle when user moves more than FOG_CIRCLE_STRIDE metres */
  const maybeAddFogCircle = useCallback((coords: LocationCoords) => {
    const last = lastFogCircleRef.current;
    if (!last || haversineMeters(last.lat, last.lon, coords.latitude, coords.longitude) >= FOG_CIRCLE_STRIDE) {
      const newCircle: ExploredCircle = { lat: coords.latitude, lon: coords.longitude };
      lastFogCircleRef.current = newCircle;
      setExploredCircles(prev => [...prev, newCircle]);
      // Non-blocking reverse geocode: attach place name to the circle once resolved
      reverseGeocode(coords.latitude, coords.longitude).then(name => {
        if (name) {
          setExploredCircles(prev =>
            prev.map(c =>
              c.lat === newCircle.lat && c.lon === newCircle.lon
                ? { ...c, placeName: name }
                : c
            )
          );
        }
      });
    }
  }, []);

  // Re-check location when screen regains focus (fixes map not loading after app restart)
  useFocusEffect(
    useCallback(() => {
      if (!location) {
        // No location yet — try to get one and discover pins
        (async () => {
          try {
            const coords = await locationService.getCurrentLocation();
            if (coords) {
              setLocation(coords);
              // Auto-discover pins on first load
              try {
                const response = await apiService.discoverPins(coords.latitude, coords.longitude);
                setDiscoveredPins(response.pins);
              } catch (e: any) {
                console.error('Initial discover failed:', e);
              }
            }
          } catch (e) {
            console.warn('Focus location check failed:', e);
          }
        })();
      }
      // Re-read community filter from AsyncStorage every time this screen is shown
      AsyncStorage.getItem(COMMUNITY_FILTER_KEY)
        .then(v => setCommunityFilterActive(v === 'true'))
        .catch(() => {});
    }, [location])
  );

  // Update map pins when discovered pins, location, or community filter changes
  useEffect(() => {
    const visible = communityFilterActive
      ? discoveredPins.filter(p => p.is_community)
      : discoveredPins;
    if (location && visible.length > 0) {
      convertToMapPins(visible, location.latitude, location.longitude)
        .then(setMapPins)
        .catch(err => console.error('Error converting pins:', err));
    } else {
      setMapPins([]);
    }
  }, [discoveredPins, location, communityFilterActive]);

  const checkApiConnection = async () => {
    await apiService.healthCheck();
  };

  const initializeTracking = async () => {
    setIsSearching(true);
    setError(null);

    const success = await locationService.startTracking(
      // On location update
      (coords) => {
        setLocation(coords);
        maybeAddFogCircle(coords);
      },
      // On pins discovered — replace list each heartbeat so expired pins disappear
      // automatically; dismissed pins are filtered out via the ref.
      (pins) => {
        setDiscoveredPins(pins.filter((p) => !dismissedPinIds.has(p.id)));
      },
      // On error
      (err) => {
        setError(err);
        setIsSearching(false);
      }
    );

    if (!success) {
      // If tracking couldn't start (permissions denied or native not available),
      // attempt an IP-based approximate location so the map can still render.
      try {
        const approx = await locationService.getCurrentLocation();
        if (approx) setLocation(approx);
      } catch (e) {
        console.warn('Approximate location unavailable', e);
      }
      setIsSearching(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setResetMapToken(prev => prev + 1);  // reset map rotation to 0°
    await checkApiConnection();
    
    // If we don't have location yet, try to get it first
    if (!location) {
      try {
        const coords = await locationService.getCurrentLocation();
        if (coords) {
          setLocation(coords);
          // Fly camera to user location
          setFlyToLocation({ lat: coords.latitude, lon: coords.longitude });
          // Now try to discover pins with this location
          try {
            const response = await apiService.discoverPins(
              coords.latitude,
              coords.longitude
            );
            setDiscoveredPins(response.pins);
          } catch (e: any) {
            console.error('Discover failed:', e);
          }
        } else {
          setError(t('radar.gettingLocation') || 'Unable to get location. Please check location permissions.');
        }
      } catch (e) {
        console.error('Location failed:', e);
        setError(t('radar.gettingLocation') || 'Unable to get location.');
      }
      setRefreshing(false);
      return;
    }
    
    // Fly camera to user's current location
    setFlyToLocation({ lat: location.latitude, lon: location.longitude });
    
    setDiscoveredPins([]);
    try {
      const response = await apiService.discoverPins(
        location.latitude,
        location.longitude
      );
      setDiscoveredPins(response.pins);
    } catch (e: any) {
      console.error('Refresh failed:', e);
      if (apiService.isOfflineError(e)) {
        setError(e.message || t('radar.errorNoInternet') || 'Cannot reach server. Check EXPO_PUBLIC_RAILWAY_URL in mobile/.env');
      } else if (apiService.isRateLimitError(e)) {
        setError(t('radar.errorRateLimit') || 'Slow down! Too many requests. Wait a moment.');
      } else {
        setError(e.message || t('radar.errorRefresh') || 'Failed to refresh. Please try again.');
      }
    }
    
    setRefreshing(false);
  };

  const handleLike = async (pinId: number) => {
    // Interaction lock: check if user already rated this pin
    const current = pinInteractions[pinId];
    if (current === 'liked') {
      // Toggle off (undo like) — decrement counter optimistically
      saveInteraction(pinId, null);
      setDiscoveredPins(prev => prev.map(p => p.id === pinId ? { ...p, likes: Math.max(0, p.likes - 1) } : p));
      if (selectedPin?.id === pinId) {
        setSelectedPin(prev => prev ? { ...prev, likes: Math.max(0, prev.likes - 1) } : prev);
      }
      return;
    }
    if (current === 'disliked' || current === 'reported') {
      showInfo(t('radar.alreadyInteracted'), t('radar.alreadyInteractedMsg'));
      return;
    }
    saveInteraction(pinId, 'liked');
    locationService.markPinInteracted(pinId);
    // Optimistic update - update UI immediately
    const optimisticUpdate = (pins: DiscoveredPin[]) =>
      pins.map((p) =>
        p.id === pinId ? { ...p, likes: p.likes + 1 } : p
      );
    
    setDiscoveredPins(optimisticUpdate);
    if (selectedPin?.id === pinId) {
      setSelectedPin({ ...selectedPin, likes: selectedPin.likes + 1 });
    }
    
    try {
      const response = await apiService.likePin(pinId);
      // Confirm with server data
      setDiscoveredPins((prev) =>
        prev.map((p) =>
          p.id === pinId ? { ...p, likes: response.likes } : p
        )
      );
      if (selectedPin?.id === pinId) {
        setSelectedPin({ ...selectedPin, likes: response.likes });
      }
    } catch (e: any) {
      console.error('Like failed:', e);
      // Revert optimistic update on error
      saveInteraction(pinId, null);
      setDiscoveredPins((prev) =>
        prev.map((p) =>
          p.id === pinId ? { ...p, likes: Math.max(0, p.likes - 1) } : p
        )
      );
      if (selectedPin?.id === pinId) {
        setSelectedPin({ ...selectedPin, likes: Math.max(0, selectedPin.likes - 1) });
      }
      if (apiService.isRateLimitError(e)) {
        setError(t('radar.tooManyLikes'));
      } else {
        setError(t('radar.likeFailed'));
      }
    }
  };

  const handleDislike = async (pinId: number) => {
    // Interaction lock
    const current = pinInteractions[pinId];
    if (current === 'disliked') { saveInteraction(pinId, null); return; }
    if (current === 'liked' || current === 'reported') {
      showInfo(t('radar.alreadyInteracted'), t('radar.alreadyInteractedMsg'));
      return;
    }
    saveInteraction(pinId, 'disliked');
    locationService.markPinInteracted(pinId);
    // Dislike the pin
    try {
      const result = await apiService.dislikePin(pinId);
      const updatedPins = discoveredPins.map((pin) => {
        if (pin.id === pinId) {
          return {
            ...pin,
            dislikes: result.dislikes,
            likes: result.likes,
            is_suppressed: result.is_suppressed,
          };
        }
        return pin;
      });
      setDiscoveredPins(updatedPins);
      if (location) {
        const updated = await convertToMapPins(updatedPins, location.latitude, location.longitude);
        setMapPins(updated);
      }
      setSelectedPin(null);
    } catch (e: any) {
      console.error('Dislike failed:', e);
      saveInteraction(pinId, null);
      setError(t('radar.dislikeFailed'));
    }
  };

  const handleReport = (pinId: number) => {
    // Interaction lock
    const current = pinInteractions[pinId];
    if (current === 'reported') { saveInteraction(pinId, null); return; }
    if (current === 'liked' || current === 'disliked') {
      showInfo(t('radar.alreadyInteracted'), t('radar.alreadyInteractedMsg'));
      return;
    }
    // Show confirmation dialog immediately — no async blocking before the modal
    showConfirm(
      t('radar.reportBtn') || 'Report this pin',
      'Report this pin as inappropriate or harmful?',
      async () => {
        saveInteraction(pinId, 'reported');
        locationService.markPinInteracted(pinId);
        // Optimistic update - increment reports and check suppression immediately
        const optimisticUpdate = (pins: DiscoveredPin[]) =>
          pins.map((p) => {
            if (p.id === pinId) {
              const newReports = p.reports + 1;
              const newSuppressed = newReports > p.likes * 2;
              return { ...p, reports: newReports, is_suppressed: newSuppressed };
            }
            return p;
          });
        
        setDiscoveredPins(optimisticUpdate);
        if (selectedPin?.id === pinId) {
          const newReports = selectedPin.reports + 1;
          const newSuppressed = newReports > selectedPin.likes * 2;
          setSelectedPin({ ...selectedPin, reports: newReports, is_suppressed: newSuppressed });
        }
        
        try {
          const response = await apiService.reportPin(pinId);
          // Confirm with server data
          setDiscoveredPins((prev) =>
            prev.map((p) =>
              p.id === pinId 
                ? { ...p, reports: response.reports, is_suppressed: response.is_suppressed } 
                : p
            )
          );
          // Update map pins to reflect suppression
          if (location) {
            const updated = await convertToMapPins(
              discoveredPins.map(p => p.id === pinId ? { ...p, reports: response.reports, is_suppressed: response.is_suppressed } : p),
              location.latitude,
              location.longitude
            );
            setMapPins(updated);
          }
          if (selectedPin?.id === pinId) {
            setSelectedPin({ ...selectedPin, reports: response.reports, is_suppressed: response.is_suppressed });
          }
          // Show feedback
          showInfo(
            t('radar.reported'),
            response.is_suppressed 
              ? t('radar.pinReportedSuppressed')
              : t('radar.pinReportedCount', { count: response.reports })
          );
        } catch (e: any) {
          console.error('Report failed:', e);
          if (apiService.isRateLimitError(e)) {
            setError(t('radar.tooManyReports'));
          }
        }
      }
    );
  };

  const handleDelete = (pinId: number) => {
    showConfirm(
      t('radar.deleteBtn'),
      'Are you sure you want to permanently delete this pin?',
      async () => {
        const previousPins = discoveredPins;
        setSelectedPin(null);
        setDiscoveredPins(prev => prev.filter(p => p.id !== pinId));
        showInfo(t('radar.deleted'), t('radar.pinDeletedSuccess'));
        try {
          await apiService.deletePin(pinId);
        } catch (e: any) {
          setDiscoveredPins(previousPins);
          console.error('Delete failed:', e);
          if (e.statusCode === 403) {
            showInfo('Error', t('radar.pinDeletedErrorOwn'));
          } else {
            showInfo('Error', t('radar.pinDeletedFail'));
          }
        }
      },
      true
    );
  };

  // Handle unmuting a pin (tap on grey marker)
  const handleUnmutePinPress = async (pinId: string) => {
    try {
      const pinIdNum = parseInt(pinId, 10);
      await pinPreferencesService.unmute(pinIdNum);
      
      // Re-convert pins to update map display
      if (location) {
        const updated = await convertToMapPins(discoveredPins, location.latitude, location.longitude);
        setMapPins(updated);
      }
      
      // Show brief feedback
      showInfo('🔔 Unmuted', "You'll now receive notifications for this location again!");
      
      console.log(`🔔 Pin ${pinIdNum} unmuted`);
    } catch (e) {
      console.error('Unmute failed:', e);
      showInfo('Error', 'Failed to unmute pin. Please try again.');
    }
  };

  // Handle map pin selection
  const handleMapPinSelect = useCallback((pinId: string) => {
    const pinIdNum = parseInt(pinId, 10);
    locationService.markPinInteracted(pinIdNum);
    const pin = discoveredPins.find(p => String(p.id) === pinId);
    if (pin) {
      setSelectedPin(pin);
    }
  }, [discoveredPins]);

  // Handle cluster press — show list of pins in the cluster
  const handleClusterPress = useCallback((pinIds: string[]) => {
    const pins = discoveredPins.filter(p => pinIds.includes(String(p.id)));
    if (pins.length > 0) {
      pinIds.forEach(id => locationService.markPinInteracted(parseInt(id, 10)));
      setClusterPins(pins);
      setClusterVisible(true);
    }
  }, [discoveredPins]);

  // ─── LocationIQ search handlers ──────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    const results = await forwardGeocode(searchQuery);
    setSearchResults(results);
    setSearchLoading(false);
  };

  const handleSearchSelect = (result: GeocodeResult) => {
    setFlyToLocation({ lat: result.lat, lon: result.lon, label: result.shortName });
    setSearchBarOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar — exactly 3 icons: Hamburger | Search | Refresh */}
      <View style={styles.topBar}>
        {/* Hamburger Menu Button - Left */}
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => navigation.openDrawer()}
        >
          <Text style={styles.menuButtonText}>☰</Text>
        </TouchableOpacity>

        {/* Search Button — Center */}
        <TouchableOpacity style={styles.searchButton} onPress={() => setSearchBarOpen(true)}>
          <Text style={styles.searchButtonText}>🔍</Text>
        </TouchableOpacity>

        {/* Refresh Button - Right */}
        <TouchableOpacity
          style={[styles.rescanButton, refreshing && styles.rescanButtonDisabled]}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={MiyabiColors.bamboo} />
          ) : (
            <Text style={styles.rescanButtonText}>◎</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Community-only filter banner — visible whenever the map is filtered to community pins only */}
      {communityFilterActive && (
        <TouchableOpacity
          style={styles.communityFilterBanner}
          onPress={turnOffCommunityFilter}
          activeOpacity={0.85}
        >
          <Text style={styles.communityFilterBannerText}>
            ★ {t('radar.communityFilterActive')}  ·  {t('radar.communityFilterTapOff')}
          </Text>
        </TouchableOpacity>
      )}

      {/* LocationIQ Place Search Overlay */}
      {searchBarOpen && (
        <View style={styles.searchOverlay}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search place or address..."
              placeholderTextColor="#aaa"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={() => { setSearchBarOpen(false); setSearchQuery(''); setSearchResults([]); }} style={styles.searchCloseBtn}>
              <Text style={styles.searchCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          {searchLoading && <ActivityIndicator style={{ marginTop: 8 }} color={MiyabiColors.bamboo} />}
          {searchResults.map((r, i) => (
            <TouchableOpacity key={i} style={styles.searchResult} onPress={() => handleSearchSelect(r)}>
              <Text style={styles.searchResultText} numberOfLines={2}>{r.displayName}</Text>
            </TouchableOpacity>
          ))}
          {!searchLoading && searchResults.length === 0 && searchQuery.trim().length > 0 && (
            <Text style={styles.searchNoResults}>No results found</Text>
          )}
        </View>
      )}

      {/* Map Container - Full Screen */}
      <View style={styles.mapContainer}>
        {/* Basic Map (No API Key) */}
        {location && (
          <BasicMap
            userLocation={location}
            pins={mapPins}
            onPinPress={(pinId) => { handleMapPinSelect(pinId); }}
            onClusterPress={handleClusterPress}
            onMutedPinPress={handleUnmutePinPress}
            discoveryRadius={50}
            compassHeading={heading}
            exploredCircles={exploredCircles}
            flyToLocation={flyToLocation}
            resetRotationToken={resetMapToken}
          />
        )}

        {/* Fallback when no location */}
        {!location && (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderIcon}>🗺️</Text>
            <Text style={styles.mapPlaceholderText}>{t('radar.gettingLocation') || 'Getting your location...'}</Text>
            <TouchableOpacity
              style={styles.retryLocationButton}
              onPress={() => {
                setError(null);
                initializeTracking();
              }}
            >
              <Text style={styles.retryLocationText}>🔄 {t('radar.retry') || 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error Overlay */}
        {error && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorCard}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.errorButton} onPress={handleRefresh}>
                <Text style={styles.errorButtonText}>{t('radar.retry') || 'Retry'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Bottom Sheet for Selected Pin */}
      {selectedPin?.is_community ? (
        <CommunityHubSheet
          pin={selectedPin}
          zonePins={zonePins}
          userLocation={location}
          heading={heading}
          onClose={() => setSelectedPin(null)}
          onLike={handleLike}
          onDislike={handleDislike}
          onReport={handleReport}
          onDelete={handleDelete}
          userInteraction={pinInteractions[selectedPin?.id ?? 0] ?? null}
        />
      ) : (
        <BottomSheet
          pin={selectedPin}
          userLocation={location}
          heading={heading}
          onClose={() => setSelectedPin(null)}
          onLike={handleLike}
          onDislike={handleDislike}
          onReport={handleReport}
          onDelete={handleDelete}
          userInteraction={selectedPin ? (pinInteractions[selectedPin.id] ?? null) : null}
        />
      )}

      {/* Cluster Bottom Sheet — slides up with a list of all pins in the tapped cluster */}
      <Modal
        visible={clusterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setClusterVisible(false)}
      >
        <View style={styles.clusterOverlay}>
          <View style={styles.clusterSheet}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.clusterHeader}>
              <Text style={styles.clusterTitle}>{clusterPins.length} {t('radar.clusterMessages')}</Text>
              <TouchableOpacity onPress={() => setClusterVisible(false)} style={styles.bottomSheetClose}>
                <Text style={styles.bottomSheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={clusterPins}
              keyExtractor={p => String(p.id)}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.clusterItem}
                  onPress={() => { setClusterVisible(false); setSelectedPin(item); }}
                >
                  <Text style={styles.clusterItemText} numberOfLines={3}>{item.content}</Text>
                  <Text style={styles.clusterItemMeta}>❤️ {item.likes}  👣 {item.passes_by ?? 0}  {Math.round(item.distance_meters)}m</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Drop Pin FAB — bottom-center, visible while exploring */}
      {!selectedPin && (
        <TouchableOpacity
          style={styles.dropFab}
          onPress={() => navigation.navigate('Drop')}
          activeOpacity={0.85}
        >
          <Text style={styles.dropFabIcon}>📍</Text>
        </TouchableOpacity>
      )}

      {/* Start Button (if not tracking) */}
      {!isSearching && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={initializeTracking}
        >
          <Text style={styles.startButtonText}>🚀 {t('radar.startExploring') || 'Start Exploring'}</Text>
        </TouchableOpacity>
      )}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MiyabiColors.washi,
  },
  
  // Top Bar with Hamburger, Status, and Rescan
  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },

  // Hamburger Menu Button
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: MiyabiColors.washi + 'F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...MiyabiShadows.md,
  },
  menuButtonText: {
    fontSize: 16,
    color: MiyabiColors.bamboo,
    fontWeight: '600',
  },

  // Refresh Button — transparent glass
  rescanButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescanButtonDisabled: {
    opacity: 0.5,
  },
  rescanButtonText: {
    fontSize: 16,
    color: MiyabiColors.bamboo,
  },
  
  // Map Container
  mapContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#E8F4F8', // Soft pastel blue
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4F8', // Soft pastel blue
  },
  mapPlaceholderIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#5F6368',
    fontWeight: '500',
  },
  retryLocationButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: MiyabiColors.bambooLight + '30',
    borderRadius: 20,
  },
  retryLocationText: {
    fontSize: 14,
    color: MiyabiColors.bamboo,
    fontWeight: '600',
  },

  // Error Overlay
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 15,
    color: '#202124',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: height * 0.65,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 15,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DADCE0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  bsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  communityBadge: {
    backgroundColor: '#EDE7F6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  communityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6A1B9A',
  },
  distanceChip: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  distanceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E7D32',
  },
  bottomSheetDistance: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomSheetDistanceIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  bottomSheetDistanceText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
  },
  bottomSheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F3F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  bottomSheetCloseText: {
    fontSize: 16,
    color: '#5F6368',
    fontWeight: '600',
  },
  navigationBar: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  navigationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1B5E20',
    textAlign: 'center',
  },
  bottomSheetContent: {
    flex: 1,
  },
  bottomSheetContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  bottomSheetMessage: {
    fontSize: 16,
    color: '#202124',
    lineHeight: 24,
    marginBottom: 14,
  },
  // 2x2 stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: '48%',
  },
  statChipIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  statChipText: {
    fontSize: 12,
    color: '#5F6368',
    fontWeight: '500',
    flexShrink: 1,
  },
  // kept for backward compat but unused:
  bottomSheetStats: { flexDirection: 'row', marginBottom: 16 },
  statItem: { flexDirection: 'row', alignItems: 'center' },
  statIcon: { fontSize: 16, marginRight: 6 },
  statText: { fontSize: 13, color: '#5F6368' },
  bottomSheetActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  likeButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  likeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  dislikeButton: {
    flex: 1,
    backgroundColor: '#FFE4E1',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  dislikeButtonText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '700',
  },
  reportButton: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  reportButtonText: {
    color: '#E65100',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Start Button
  startButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: '#FFB6C1',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#FFB6C1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Drop Pin FAB — transparent, compact
  dropFab: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  dropFabIcon: {
    fontSize: 20,
  },
  dropFabLabel: {
    display: 'none',
  },

  // Cluster bottom sheet
  clusterOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  clusterSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: height * 0.6,
  },
  clusterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  clusterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
  },
  clusterItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  clusterItemText: {
    fontSize: 15,
    color: '#202124',
    lineHeight: 22,
    marginBottom: 4,
  },
  clusterItemMeta: {
    fontSize: 12,
    color: '#5F6368',
  },

  // ─── LocationIQ Search ───────────────────────────────────────────────────────
  searchButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    fontSize: 16,
    color: MiyabiColors.bamboo,
  },
  searchOverlay: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 10,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: 320,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 10,
  },
  searchCloseBtn: {
    padding: 6,
  },
  searchCloseBtnText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
  searchResult: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchResultText: {
    color: '#e0e0e0',
    fontSize: 13,
    lineHeight: 18,
  },
  searchNoResults: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 10,
  },

  // ─── Community Hub Sheet ──────────────────────────────────────────────────
  communityPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 6,
  },
  pulseLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  pulseIcon: { fontSize: 18 },
  pulseText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', flex: 1 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  pulseStatus: { fontSize: 11, fontWeight: '700' },

  communityTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginHorizontal: 16,
    marginBottom: 4,
  },
  communityTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  communityTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9E9E9E',
  },

  checkInButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkInButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },

  boardSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  boardCard: {
    backgroundColor: '#F5F0FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  boardCardContent: {
    fontSize: 13,
    color: '#1A1A1A',
    lineHeight: 18,
    marginBottom: 4,
  },
  boardCardMeta: {
    fontSize: 11,
    color: '#6D4C7E',
  },

  chatLockNote: {
    backgroundColor: '#F3F3F3',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  chatLockText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  chatLog: {
    backgroundColor: '#F5F0FF',
    borderRadius: 10,
    padding: 10,
    maxHeight: 120,
    marginBottom: 8,
  },
  chatEmptyText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    paddingVertical: 8,
  },
  chatBubble: {
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  chatBubbleText: {
    fontSize: 13,
    color: '#1A1A1A',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  chatInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#EDE7F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 13,
    color: '#1A1A1A',
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E5F5',
  },
  memberAvatarWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarLayer: {
    position: 'absolute',
    width: 20,
    height: 32,
    borderRadius: 4,
    opacity: 0.75,
  },
  memberAvatarLabel: {
    position: 'absolute',
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  memberPreview: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '500',
    marginBottom: 2,
  },
  memberMeta: {
    fontSize: 11,
    color: '#9C27B0',
    fontWeight: '600',
  },
  memberAnonNote: {
    fontSize: 11,
    color: '#9E9E9E',
    marginBottom: 12,
    fontStyle: 'italic',
  },

  emptyMembersCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyMembersText: {
    fontSize: 13,
    color: '#9E9E9E',
  },

  checkInBanner: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  checkInBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  checkInBannerSub: {
    fontSize: 12,
    color: '#6D4C7E',
    lineHeight: 18,
  },
  checkInActiveBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  checkInActiveBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Community-only filter active banner (shown on top of the map)
  communityFilterBanner: {
    position: 'absolute',
    top: 94,
    left: 24,
    right: 24,
    backgroundColor: '#6A1B9A',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    zIndex: 101,
    alignItems: 'center',
    ...MiyabiShadows.md,
  },
  communityFilterBannerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default RadarScreen;
