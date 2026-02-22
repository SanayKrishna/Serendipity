import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import MapView, { UrlTile, Marker, Camera, PROVIDER_DEFAULT } from 'react-native-maps';
import Svg, { Circle, Polygon, Line, Ellipse, Path } from 'react-native-svg';

interface Pin {
  id: string;
  latitude: number;
  longitude: number;
  type: 'text' | 'photo';
  content?: string;
  is_community?: boolean;
  distance?: number;
}

interface PokemonGoMapProps {
  userLocation: {
    latitude: number;
    longitude: number;
  } | null;
  pins: Pin[];
  onMapPress?: (latitude: number, longitude: number) => void;
  onPinPress?: (pinId: string) => void;
  onMenuPress?: () => void;
  onDropPin?: () => void;
  heading?: number;
  discoveryRadius?: number;
}

// ============================================
// HAVERSINE DISTANCE CALCULATOR
// ============================================
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

export const PokemonGoMap: React.FC<PokemonGoMapProps> = ({
  userLocation,
  pins,
  onPinPress,
  onMenuPress,
  onDropPin,
  heading = 0,
  discoveryRadius = 50,
}) => {
  const mapRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isMapReady, setIsMapReady] = useState(false);
  const [discoveredPins, setDiscoveredPins] = useState<Set<string>>(new Set());
  const lastNotifiedPin = useRef<string | null>(null);
  
  // ============================================
  // FREE-ROAM: Breakable Auto-Follow System
  // ============================================
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const lastCameraUpdateTime = useRef(0);
  const userInteractedRef = useRef(false);

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ============================================
  // AUTO-FOLLOW CAMERA (Only when following)
  // ============================================
  useEffect(() => {
    if (!userLocation || !mapRef.current || !isMapReady) return;
    if (!isFollowingUser) return; // Don't move camera if user is exploring

    const now = Date.now();
    // Throttle camera updates to prevent shaking (max 1 per second)
    if (now - lastCameraUpdateTime.current < 1000) return;
    lastCameraUpdateTime.current = now;

    const camera: any = {
      center: {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      },
      pitch: 60, // 3D view
      heading: heading, // Compass rotation
      altitude: 400,
      zoom: 18,
    };

    // Smooth camera animation
    mapRef.current.animateCamera(camera, { duration: 1000 });
  }, [userLocation, heading, isMapReady, isFollowingUser]);

  // ============================================
  // DETECT USER INTERACTION: Break Auto-Follow
  // ============================================
  const handleMapPanDrag = () => {
    if (isFollowingUser) {
      setIsFollowingUser(false);
      userInteractedRef.current = true;
    }
  };

  // ============================================
  // RE-CENTER: Go back to GPS tracking
  // ============================================
  const handleRecenter = () => {
    if (!userLocation || !mapRef.current) return;
    
    setIsFollowingUser(true);
    userInteractedRef.current = false;
    
    const camera: any = {
      center: {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      },
      pitch: 60,
      heading: heading,
      altitude: 400,
      zoom: 18,
    };
    
    mapRef.current.animateCamera(camera, { duration: 800 });
  };

  // ============================================
  // 50M DISCOVERY SYSTEM + NOTIFICATIONS
  // ============================================
  useEffect(() => {
    if (!userLocation) return;

    pins.forEach((pin) => {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        pin.latitude,
        pin.longitude
      );

      // Discovery: User walks within 50m
      if (distance <= discoveryRadius && !discoveredPins.has(pin.id)) {
        setDiscoveredPins((prev) => new Set([...prev, pin.id]));
        
        // Show notification only once per pin
        if (lastNotifiedPin.current !== pin.id) {
          lastNotifiedPin.current = pin.id;
          Alert.alert(
            '📍 New Secret Found!',
            `You discovered a hidden message ${Math.round(distance)}m away!`,
            [{ text: 'View', onPress: () => onPinPress?.(pin.id) }]
          );
        }
      }
    });
  }, [userLocation, pins, discoveryRadius, discoveredPins]);

  return (
    <View style={styles.container}>
      {/* ============================================ */}
      {/* REACT-NATIVE-MAPS: Free-Roam Navigation */}
      {/* ============================================ */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        onMapReady={() => setIsMapReady(true)}
        
        // FREE-ROAM: Enable all gestures
        scrollEnabled={true}
        rotateEnabled={true}
        pitchEnabled={true}
        zoomEnabled={true}
        
        // Detect user interaction to break auto-follow
        onPanDrag={handleMapPanDrag}
        onRegionChangeComplete={handleMapPanDrag}
        
        toolbarEnabled={false}
        
        // Initial camera (3D perspective)
        initialCamera={{
          center: userLocation || { latitude: 35.6762, longitude: 139.6503 },
          pitch: 60,
          heading: 0,
          altitude: 400,
          zoom: 18,
        }}
        
        // Clean "Game Board" style
        mapType="standard"
        showsUserLocation={false} // We use custom marker
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsIndoors={false}
        showsBuildings={true} // 3D buildings
      >
        {/* ============================================ */}
        {/* OpenStreetMap Tiles (FREE) */}
        {/* ============================================ */}
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
          zIndex={-1}
        />

        {/* ============================================ */}
        {/* USER AVATAR: Stickman Marker at GPS Location */}
        {/* ============================================ */}
        {userLocation && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.8 }}
            flat={true}
            rotation={heading}
            tracksViewChanges={false}
          >
            <View style={styles.avatarMarker}>
              <Svg width={40} height={50} viewBox="0 0 56 70">
                {/* Head */}
                <Circle cx={28} cy={14} r={9} fill="#FFD700" stroke="#333" strokeWidth={2}/>
                {/* Eyes */}
                <Circle cx={25} cy={13} r={1.5} fill="#333"/>
                <Circle cx={31} cy={13} r={1.5} fill="#333"/>
                {/* Smile */}
                <Path d="M24 17 Q28 20 32 17" stroke="#333" strokeWidth={1.5} fill="none" strokeLinecap="round"/>
                {/* Body */}
                <Line x1={28} y1={23} x2={28} y2={42} stroke="#333" strokeWidth={3} strokeLinecap="round"/>
                {/* Arms */}
                <Line x1={28} y1={30} x2={18} y2={36} stroke="#333" strokeWidth={2.5} strokeLinecap="round"/>
                <Line x1={28} y1={30} x2={38} y2={36} stroke="#333" strokeWidth={2.5} strokeLinecap="round"/>
                {/* Legs */}
                <Line x1={28} y1={42} x2={20} y2={55} stroke="#333" strokeWidth={2.5} strokeLinecap="round"/>
                <Line x1={28} y1={42} x2={36} y2={55} stroke="#333" strokeWidth={2.5} strokeLinecap="round"/>
                {/* Shirt */}
                <Ellipse cx={28} cy={33} rx={6} ry={8} fill="#87CEEB" stroke="#333" strokeWidth={1.5} opacity={0.9}/>
              </Svg>
              {/* Shadow */}
              <View style={styles.avatarShadow} />
              
              {/* Discovery Radius Ring */}
              <Animated.View
                style={[
                  styles.discoveryRingMarker,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              />
            </View>
          </Marker>
        )}

        {/* ============================================ */}
        {/* PIN MARKERS: Based on USER GPS (not map center) */}
        {/* ============================================ */}
        {userLocation && pins.map((pin) => {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            pin.latitude,
            pin.longitude
          );

          // Hide pins beyond 100m (even if user pans map far away)
          if (distance > 100) return null;

          const isDiscovered = discoveredPins.has(pin.id);
          const isSuperClose = distance < discoveryRadius;

          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              onPress={() => onPinPress?.(pin.id)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={styles.pinContainer}>
                <View style={[
                  styles.pinIcon,
                  isDiscovered && styles.pinDiscovered,
                  isSuperClose && styles.pinSuperClose,
                  pin.is_community && styles.pinCommunity
                ]}>
                  <Text style={styles.pinEmoji}>
                    {isDiscovered ? (pin.is_community ? '👥' : '📍') : '❓'}
                  </Text>
                </View>
                {isSuperClose && (
                  <View style={styles.superCloseLabel}>
                    <Text style={styles.superCloseLabelText}>Super Close!</Text>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* ============================================ */}
      {/* TOP LEFT: Hamburger Menu */}
      {/* ============================================ */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => {
          if (onMenuPress) {
            onMenuPress();
          } else {
            Alert.alert('Menu', 'Menu functionality coming soon!');
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.menuButtonInner}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </View>
      </TouchableOpacity>

      {/* ============================================ */}
      {/* TOP RIGHT: Compass (Shows direction) */}
      {/* ============================================ */}
      <View style={styles.compassButton}>
        <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
          <Svg width={48} height={48} viewBox="0 0 48 48">
            <Circle cx={24} cy={24} r={22} fill="#FFF" opacity={0.95} />
            <Circle cx={24} cy={24} r={22} fill="none" stroke="#D0D0D0" strokeWidth={2} />
            {/* North pointer (red) */}
            <Polygon points="24,6 20,22 24,19 28,22" fill="#FF4444" />
            {/* South pointer (grey) */}
            <Polygon points="24,42 20,26 24,29 28,26" fill="#999" />
          </Svg>
        </View>
      </View>

      {/* ============================================ */}
      {/* RIGHT SIDE: GPS Re-Center Button */}
      {/* (Only show when NOT following user) */}
      {/* ============================================ */}
      {!isFollowingUser && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={handleRecenter}
          activeOpacity={0.7}
        >
          <Svg width={32} height={32} viewBox="0 0 32 32">
            {/* GPS Arrow Icon */}
            <Circle cx={16} cy={16} r={14} fill="#4285F4" />
            <Polygon points="16,8 12,18 16,16 20,18" fill="#FFF" />
            <Circle cx={16} cy={20} r={2} fill="#FFF" />
          </Svg>
        </TouchableOpacity>
      )}

      {/* ============================================ */}
      {/* BOTTOM CENTER: DROP Button */}
      {/* ============================================ */}
      <TouchableOpacity
        style={styles.dropButton}
        onPress={() => {
          if (onDropPin && userLocation) {
            onDropPin();
            Alert.alert('📍 Pin Dropped!', `Placed at your current location`);
          }
        }}
        activeOpacity={0.8}
      >
        <View style={styles.dropButtonInner}>
          <Text style={styles.dropButtonIcon}>{'📌'}</Text>
          <Text style={styles.dropButtonText}>DROP</Text>
        </View>
      </TouchableOpacity>

      {/* Loading overlay */}
      {!isMapReady && (
        <View style={styles.loadingOverlay}>
          <Animated.View
            style={[
              styles.radarPulse,
              { transform: [{ scale: pulseAnim }] }
            ]}
          />
          <Text style={styles.loadingText}>Discovering Your World...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F4F8',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // ============================================
  // AVATAR MARKER (moves with GPS on map)
  // ============================================
  avatarMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarShadow: {
    position: 'absolute',
    bottom: -8,
    width: 28,
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 14,
  },
  discoveryRingMarker: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(165, 201, 232, 0.5)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(165, 201, 232, 0.08)',
  },

  // ============================================
  // PIN MARKERS
  // ============================================
  pinContainer: {
    alignItems: 'center',
  },
  pinIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFB6C1',
    borderWidth: 3,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  pinDiscovered: {
    backgroundColor: '#87CEEB',
  },
  pinSuperClose: {
    backgroundColor: '#FFD700',
    borderColor: '#FF6347',
  },
  pinCommunity: {
    backgroundColor: '#4285F4',
    borderColor: '#1E88E5',
  },
  pinEmoji: {
    fontSize: 20,
  },
  superCloseLabel: {
    position: 'absolute',
    top: -30,
    backgroundColor: '#FFF9E6',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  superCloseLabelText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FF6347',
  },

  // ============================================
  // UI CONTROLS
  // ============================================
  
  // TOP LEFT: Hamburger Menu
  menuButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 100,
  },
  menuButtonInner: {
    width: 22,
    height: 16,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 22,
    height: 2.5,
    backgroundColor: '#333',
    borderRadius: 2,
  },

  // TOP RIGHT: Compass
  compassButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 100,
  },

  // RIGHT SIDE: GPS Re-Center Button
  recenterButton: {
    position: 'absolute',
    right: 16,
    bottom: 140,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },

  // BOTTOM CENTER: DROP Button
  dropButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100,
  },
  dropButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropButtonIcon: {
    fontSize: 24,
  },
  dropButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 2,
    letterSpacing: 1,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(232, 244, 248, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  radarPulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#A5C9E8',
    backgroundColor: 'rgba(165, 201, 232, 0.15)',
  },
  loadingText: {
    marginTop: 30,
    fontSize: 20,
    color: '#4A6B8A',
    fontWeight: '700',
  },
});

export default PokemonGoMap;
