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
  Alert,
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
import { MiyabiColors, MiyabiSpacing, MiyabiShadows } from '../styles/miyabi';
import { reverseGeocode, forwardGeocode, GeocodeResult } from '../services/LocationIQService';

// AsyncStorage key for persisting explored circles across sessions
const FOG_STORAGE_KEY = 'serendipity_fog_circles';
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

const { width, height } = Dimensions.get('window');

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
const getDirectionGuidance = (bearing: number, heading: number): string => {
  // Calculate relative angle (-180 to 180)
  let relative = bearing - heading;
  if (relative > 180) relative -= 360;
  if (relative < -180) relative += 360;

  // Get compass direction
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  const compass = directions[index];

  // Get relative guidance
  let guidance;
  if (Math.abs(relative) < 20) {
    guidance = 'Straight ahead';
  } else if (Math.abs(relative) > 160) {
    guidance = 'Behind you';
  } else if (relative > 0) {
    guidance = relative < 90 ? 'On your right' : 'On your right (turn around)';
  } else {
    guidance = relative > -90 ? 'On your left' : 'On your left (turn around)';
  }

  return `📍 ${compass} • ${guidance}`;
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
}> = ({ pin, userLocation, heading, onClose, onLike, onDislike, onReport }) => {
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

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.bottomSheetHandle} />
      
      <View style={styles.bottomSheetHeader}>
        <View style={styles.bottomSheetDistance}>
          <Text style={styles.bottomSheetDistanceIcon}>📍</Text>
          <Text style={styles.bottomSheetDistanceText}>
            {Math.round(pin.distance_meters)}m away
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.bottomSheetClose}>
          <Text style={styles.bottomSheetCloseText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Guidance */}
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
              heading
            )}
          </Text>
        </View>
      )}

      <ScrollView style={styles.bottomSheetContent}>
        <Text style={styles.bottomSheetMessage}>{pin.content}</Text>
        
        <View style={styles.bottomSheetStats}>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>❤️</Text>
            <Text style={styles.statText}>{pin.likes} {t('radar.likes')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>🚩</Text>
            <Text style={styles.statText}>{pin.reports} {t('radar.reports')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>👣</Text>
            <Text style={styles.statText}>{pin.passes_by ?? 0} passed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>⏱️</Text>
            <Text style={styles.statText}>
              {t('radar.expires')} {new Date(pin.expires_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.bottomSheetActions}>
          <TouchableOpacity
            style={styles.likeButton}
            onPress={() => onLike(pin.id)}
          >
            <Text style={styles.likeButtonText}>❤️ {t('radar.like')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dislikeButton}
            onPress={() => onDislike(pin.id)}
          >
            <Text style={styles.dislikeButtonText}>💔 {t('radar.dislike')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => onReport(pin.id)}
          >
            <Text style={styles.reportButtonText}>🚩 Report</Text>
          </TouchableOpacity>
        </View>
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
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [selectedPin, setSelectedPin] = useState<DiscoveredPin | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  // Fog of war
  const [exploredCircles, setExploredCircles] = useState<ExploredCircle[]>([]);
  const lastFogCircleRef = useRef<ExploredCircle | null>(null);
  // Cluster bottom sheet (shows list of pins in a cluster)
  const [clusterPins, setClusterPins] = useState<DiscoveredPin[]>([]);
  const [clusterVisible, setClusterVisible] = useState(false);
  // Community filter — mirrors toggle in CommunityScreen via AsyncStorage
  const [communityFilterActive, setCommunityFilterActive] = useState(false);
  const dismissedPinIds = useRef<Set<number>>(new Set()).current;

  // LocationIQ search
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lon: number; label?: string } | null>(null);
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Initialize tracking + heading subscription on mount
  useEffect(() => {
    loadFogCircles();
    initializeTracking();
    checkApiConnection();

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
        // No location yet — try to get one
        (async () => {
          try {
            const coords = await locationService.getCurrentLocation();
            if (coords) {
              setLocation(coords);
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
    const connected = await apiService.healthCheck();
    setApiConnected(connected);
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
      // On pins discovered
      (pins) => {
        setDiscoveredPins((prev) => {
          // Merge new pins, avoiding duplicates AND dismissed pins
          const existingIds = new Set(prev.map((p) => p.id));
          const newPins = pins.filter(
            (p) => !existingIds.has(p.id) && !dismissedPinIds.has(p.id)
          );
          return [...newPins, ...prev];
        });
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
            setLastScanTime(new Date());
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
      setLastScanTime(new Date());
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
      setDiscoveredPins((prev) =>
        prev.map((p) =>
          p.id === pinId ? { ...p, likes: Math.max(0, p.likes - 1) } : p
        )
      );
      if (selectedPin?.id === pinId) {
        setSelectedPin({ ...selectedPin, likes: Math.max(0, selectedPin.likes - 1) });
      }
      if (apiService.isRateLimitError(e)) {
        setError('Too many likes! Slow down.');
      } else {
        setError('Failed to like pin. Please try again.');
      }
    }
  };

  const handleDislike = async (pinId: number) => {
    locationService.markPinInteracted(pinId);
    // Dislike the pin
    try {
      const result = await apiService.dislikePin(pinId);
      // Update the pin in the list with new counts
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
      // Update map pins
      if (location) {
        const updated = await convertToMapPins(
          updatedPins,
          location.latitude,
          location.longitude
        );
        setMapPins(updated);
      }
      // Close detail view
      setSelectedPin(null);
    } catch (e: any) {
      console.error('Dislike failed:', e);
      setError('Failed to dislike pin. Please try again.');
    }
  };

  const handleReport = async (pinId: number) => {
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
      Alert.alert(
        'Reported',
        response.is_suppressed 
          ? 'Pin reported and suppressed (too many reports)' 
          : `Pin reported (${response.reports} total reports)`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      console.error('Report failed:', e);
      if (apiService.isRateLimitError(e)) {
        setError('Too many reports! Slow down.');
      }
    }
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
      Alert.alert(
        '🔔 Unmuted',
        'You\'ll now receive notifications for this location again!',
        [{ text: 'OK' }]
      );
      
      console.log(`🔔 Pin ${pinIdNum} unmuted`);
    } catch (e) {
      console.error('Unmute failed:', e);
      Alert.alert('Error', 'Failed to unmute pin. Please try again.');
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
            <Text style={styles.rescanButtonText}>🔄</Text>
          )}
        </TouchableOpacity>
      </View>

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
      <BottomSheet
        pin={selectedPin}
        userLocation={location}
        heading={heading}
        onClose={() => setSelectedPin(null)}
        onLike={handleLike}
        onDislike={handleDislike}
        onReport={handleReport}
      />

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
              <Text style={styles.clusterTitle}>{clusterPins.length} messages here</Text>
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

      {/* Start Button (if not tracking) */}
      {!isSearching && (
        <TouchableOpacity
          style={styles.startButton}
          onPress={initializeTracking}
        >
          <Text style={styles.startButtonText}>🚀 {t('radar.startExploring') || 'Start Exploring'}</Text>
        </TouchableOpacity>
      )}
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

  // Refresh Button — matches hamburger style
  rescanButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: MiyabiColors.washi + 'F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...MiyabiShadows.md,
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: height * 0.6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
  },
  bottomSheetCloseText: {
    fontSize: 20,
    color: '#5F6368',
  },
  navigationBar: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  navigationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B5E20',
    textAlign: 'center',
  },
  bottomSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  bottomSheetMessage: {
    fontSize: 16,
    color: '#202124',
    lineHeight: 24,
    marginBottom: 16,
  },
  bottomSheetStats: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  statText: {
    fontSize: 13,
    color: '#5F6368',
  },
  bottomSheetActions: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 20,
  },
  likeButton: {
    flex: 1,
    backgroundColor: '#87CEEB', // Sky blue (discovery theme)
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  likeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  dislikeButton: {
    flex: 1,
    backgroundColor: '#FFE4E1',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  dislikeButtonText: {
    color: '#DC143C',
    fontSize: 15,
    fontWeight: '600',
  },
  reportButton: {
    flex: 1,
    backgroundColor: '#FF6B6B', // Red for safety reports
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
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
    backgroundColor: MiyabiColors.washi + 'F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...MiyabiShadows.md,
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
});

export default RadarScreen;
