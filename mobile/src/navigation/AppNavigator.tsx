/**
 * App Navigator - Auth + Drawer Navigation
 * 
 * Auth Stack (if not logged in):
 * - Sign Up
 * - Login
 * 
 * Main Drawer (if logged in):
 * - Radar (Home) - Discover nearby messages
 * - Drop (Create) - Leave a message
 * - Community - Broadcast channel (admin can post)
 * - Diary - Personal discovery timeline
 * - Settings - Language and preferences
 */
import React, { useEffect, useState, useRef, createContext } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Dimensions, Easing } from 'react-native';
import Svg, { Path, Rect, Circle as SvgCircle } from 'react-native-svg';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';

import RadarScreen from '../screens/RadarScreen';
import DropScreen from '../screens/DropScreen';
import CommunityScreen from '../screens/CommunityScreen';
import DiaryScreen from '../screens/DiaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SignUpScreen from '../screens/SignUpScreen';
import LoginScreen from '../screens/LoginScreen';
import { AppLogo } from '../components/AppLogo';
import { MiyabiColors, MiyabiSpacing, MiyabiBorderRadius, MiyabiShadows } from '../styles/miyabi';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/AuthService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

/** Auth context — lets any screen trigger a global logout without navigation.navigate */
export const AuthContext = createContext<{
  logout: () => Promise<void>;
}>({ logout: async () => {} });

// Custom Drawer Content with refined design
const CustomDrawerContent = (props: any) => {
  return (
    <DrawerContentScrollView {...props} style={styles.drawerContainer}>
      {/* Clean centred header — matches washi drawer background */}
      <View style={styles.drawerHeader}>
        <AppLogo size="medium" />
      </View>
      
      {/* Navigation Items */}
      <View style={styles.navSection}>
        <DrawerItemList {...props} />
      </View>
      
      {/* Footer */}
      <View style={styles.drawerFooter}>
        <View style={styles.footerDivider} />
        <Text style={styles.drawerFooterText}>Serendipity • v1.0.0</Text>
      </View>
    </DrawerContentScrollView>
  );
};

// Main Drawer Navigator (after authentication)
const DrawerNavigator: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerPosition: 'left',
        drawerType: 'slide',
        overlayColor: 'rgba(0, 0, 0, 0.4)',
        drawerStyle: styles.drawer,
        drawerActiveTintColor: MiyabiColors.bamboo,
        drawerInactiveTintColor: MiyabiColors.sumiLight,
        drawerLabelStyle: styles.drawerLabel,
        drawerItemStyle: styles.drawerItem,
        drawerActiveBackgroundColor: MiyabiColors.bamboo + '15',
      }}
    >
      <Drawer.Screen
        name="Radar"
        component={RadarScreen}
        options={{
          title: t('navigation.radar'),
          drawerIcon: () => <Text style={styles.drawerIcon}>🗺️</Text>,
        }}
      />
      <Drawer.Screen
        name="Drop"
        component={DropScreen}
        options={{
          title: t('navigation.dropPin'),
          drawerIcon: () => <Text style={styles.drawerIcon}>📍</Text>,
        }}
      />
      <Drawer.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          title: t('navigation.community'),
          drawerIcon: () => <Text style={styles.drawerIcon}>👥</Text>,
        }}
      />
      <Drawer.Screen
        name="Diary"
        component={DiaryScreen}
        options={{
          title: t('navigation.diary'),
          drawerIcon: () => <Text style={styles.drawerIcon}>📔</Text>,
        }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('navigation.settings'),
          drawerIcon: () => <Text style={styles.drawerIcon}>⚙️</Text>,
        }}
      />
    </Drawer.Navigator>
  );
};

const AppNavigator: React.FC = () => {
  const { t } = useTranslation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');

  // ── Seika Reveal animation values (pure Animated — no native deps) ──────
  // Phase 1: Cloud bank covers screen
  // Phase 2: Clouds part from center (translateX left/right halves)
  // Phase 3: Torii gate fades in + scales up
  // Phase 4: Text + particles appear
  // Phase 5: Everything fades out
  const seikaOverlay = useRef(new Animated.Value(0)).current;     // 0→1 fade in, hold, 1→0 fade out
  const cloudLeftX = useRef(new Animated.Value(0)).current;       // 0 → -SCREEN_W*0.6
  const cloudRightX = useRef(new Animated.Value(0)).current;      // 0 → +SCREEN_W*0.6
  const toriiScale = useRef(new Animated.Value(0.3)).current;     // 0.3 → 1
  const toriiOpacity = useRef(new Animated.Value(0)).current;     // 0 → 1
  const textOpacity = useRef(new Animated.Value(0)).current;      // 0 → 1

  // Drifting cloud wisps (6 animated layers for depth)
  const cloudWisps = useRef(
    Array.from({ length: 6 }, (_, i) => ({
      anim: new Animated.Value(0),
      y: SCREEN_H * 0.15 + (i * SCREEN_H * 0.12),
      startX: i % 2 === 0 ? -SCREEN_W * 0.3 : SCREEN_W * 0.3,
      endX: i % 2 === 0 ? -SCREEN_W * 0.9 : SCREEN_W * 0.9,
      height: 60 + Math.random() * 40,
      opacity: 0.3 + Math.random() * 0.4,
    })),
  ).current;

  // Cherry-blossom petal particles (carried over)
  const blossomRefs = useRef(
    Array.from({ length: 10 }, () => ({
      x: Math.random() * SCREEN_W,
      startY: -30 - Math.random() * 80,
      endY: SCREEN_H + 40,
      sway: (Math.random() - 0.5) * 100,
      duration: 2800 + Math.random() * 1400,
      delay: Math.random() * 700,
      scale: 0.5 + Math.random() * 0.7,
      anim: new Animated.Value(0),
    })),
  ).current;
  
  useEffect(() => {
    checkAuthStatus();
  }, []);
  
  const checkAuthStatus = async () => {
    try {
      await authService.initialize();
      const authType = authService.getAuthType();
      
      // Only skip auth screens if user has a real email session
      // OR explicitly chose "Continue as Guest" (persisted flag)
      if (authType === 'email') {
        setIsAuthenticated(true);
      } else {
        // Check if user previously chose "Continue as Guest"
        const guestFlag = await AsyncStorage.getItem('serendipity_guest_mode');
        if (guestFlag === 'true') {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleAuthSuccess = () => {
    const user = authService.getUser();
    setWelcomeName(user?.username || '');
    setIsAuthenticated(true);
    setShowWelcome(true);

    // Reset all animation values
    seikaOverlay.setValue(0);
    cloudLeftX.setValue(0);
    cloudRightX.setValue(0);
    toriiScale.setValue(0.3);
    toriiOpacity.setValue(0);
    textOpacity.setValue(0);
    cloudWisps.forEach(w => w.anim.setValue(0));
    blossomRefs.forEach(b => b.anim.setValue(0));

    // ── Seika Reveal sequence (3500ms total) ──
    // Phase 1 (0-400ms): Overlay fades in (cloud bank visible)
    // Phase 2 (400-1800ms): Clouds part left/right + wisps drift outward
    // Phase 3 (800-2000ms): Torii gate scales up + fades in
    // Phase 4 (1600-2400ms): Text + blossoms appear
    // Phase 5 (2800-3500ms): Everything fades out

    // Start wisp drift animations (staggered)
    cloudWisps.forEach((w, i) => {
      w.anim.setValue(0);
      Animated.timing(w.anim, {
        toValue: 1, duration: 2400, delay: 200 + i * 120,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    });

    // Start blossom particle animations (delayed to Phase 4)
    blossomRefs.forEach((b) => {
      b.anim.setValue(0);
      Animated.timing(b.anim, {
        toValue: 1, duration: b.duration, delay: b.delay + 1400,
        useNativeDriver: true,
      }).start();
    });

    // Main orchestrated sequence
    Animated.sequence([
      // Phase 1: Fade in
      Animated.timing(seikaOverlay, { toValue: 1, duration: 400, useNativeDriver: true }),
      // Phase 2+3+4: Parallel cloud-parting + torii reveal + text
      Animated.parallel([
        Animated.timing(cloudLeftX, {
          toValue: -SCREEN_W * 0.65, duration: 1800,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true,
        }),
        Animated.timing(cloudRightX, {
          toValue: SCREEN_W * 0.65, duration: 1800,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.parallel([
            Animated.timing(toriiOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.spring(toriiScale, { toValue: 1, tension: 30, friction: 8, useNativeDriver: true }),
          ]),
        ]),
        Animated.sequence([
          Animated.delay(1200),
          Animated.timing(textOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ]),
      // Hold the reveal
      Animated.delay(600),
      // Phase 5: Fade everything out
      Animated.timing(seikaOverlay, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start(() => setShowWelcome(false));
  };

  /** Full logout: clear session + guest flag, reset auth state.
   *  The conditional <NavigationContainer> automatically unmounts the app
   *  and shows the auth stack — no navigation.navigate needed. */
  const handleLogout = async () => {
    try {
      await authService.signOut();
      await AsyncStorage.removeItem('serendipity_guest_mode');
    } catch (e) {
      console.error('Logout error:', e);
    }
    setIsAuthenticated(false);
  };

  const handleGuestContinue = async () => {
    // Persist guest choice so the user isn't asked again on next launch
    await AsyncStorage.setItem('serendipity_guest_mode', 'true');
    // Ensure device/supabase auth is initialized for API calls
    await authService.initialize();
    setIsAuthenticated(true);
  };
  
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <AppLogo size="large" />
        <ActivityIndicator
          size="large"
          color={MiyabiColors.bamboo}
          style={{ marginTop: MiyabiSpacing.xl }}
        />
      </View>
    );
  }
  
  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <AuthContext.Provider value={{ logout: handleLogout }}>
          <DrawerNavigator />
          {/* ── Seika Reveal: Cloud-parting welcome animation ── */}
          {showWelcome && (
            <Animated.View style={[styles.welcomeOverlay, { opacity: seikaOverlay }]} pointerEvents="none">

              {/* Left cloud bank (slides left) */}
              <Animated.View style={[styles.cloudBank, styles.cloudBankLeft, { transform: [{ translateX: cloudLeftX }] }]}>
                {/* Layered cloud shapes for organic look */}
                <View style={[styles.cloudBlob, { top: '15%', left: '10%', width: 200, height: 120 }]} />
                <View style={[styles.cloudBlob, { top: '35%', left: '-5%', width: 260, height: 140 }]} />
                <View style={[styles.cloudBlob, { top: '55%', left: '15%', width: 180, height: 100 }]} />
                <View style={[styles.cloudBlob, { top: '70%', left: '-10%', width: 240, height: 130 }]} />
              </Animated.View>

              {/* Right cloud bank (slides right) */}
              <Animated.View style={[styles.cloudBank, styles.cloudBankRight, { transform: [{ translateX: cloudRightX }] }]}>
                <View style={[styles.cloudBlob, { top: '20%', right: '5%', width: 220, height: 130 }]} />
                <View style={[styles.cloudBlob, { top: '40%', right: '-8%', width: 250, height: 120 }]} />
                <View style={[styles.cloudBlob, { top: '60%', right: '10%', width: 190, height: 110 }]} />
                <View style={[styles.cloudBlob, { top: '75%', right: '-5%', width: 230, height: 140 }]} />
              </Animated.View>

              {/* Drifting cloud wisps (atmospheric depth) */}
              {cloudWisps.map((w, i) => {
                const tx = w.anim.interpolate({ inputRange: [0, 1], outputRange: [w.startX, w.endX] });
                const op = w.anim.interpolate({ inputRange: [0, 0.3, 0.8, 1], outputRange: [w.opacity, w.opacity, 0.1, 0] });
                return (
                  <Animated.View
                    key={`wisp-${i}`}
                    style={{
                      position: 'absolute', top: w.y, left: -20,
                      width: SCREEN_W + 40, height: w.height,
                      backgroundColor: 'rgba(240,240,245,0.25)',
                      borderRadius: w.height / 2,
                      transform: [{ translateX: tx }], opacity: op,
                    }}
                  />
                );
              })}

              {/* Torii Gate silhouette (revealed as clouds part) */}
              <Animated.View style={{ opacity: toriiOpacity, transform: [{ scale: toriiScale }] }}>
                <Svg width={140} height={120} viewBox="0 0 140 120">
                  {/* Horizontal beams */}
                  <Rect x="5" y="15" width="130" height="8" rx="4" fill="rgba(255,255,255,0.9)" />
                  <Rect x="15" y="30" width="110" height="5" rx="2.5" fill="rgba(255,255,255,0.7)" />
                  {/* Upward curve on top beam */}
                  <Path d="M0 18 Q70 0 140 18" stroke="rgba(255,255,255,0.9)" strokeWidth="4" fill="none" />
                  {/* Vertical pillars */}
                  <Rect x="25" y="23" width="7" height="97" rx="3" fill="rgba(255,255,255,0.8)" />
                  <Rect x="108" y="23" width="7" height="97" rx="3" fill="rgba(255,255,255,0.8)" />
                </Svg>
              </Animated.View>

              {/* Cherry-blossom petal particles */}
              {blossomRefs.map((b, i) => {
                const translateY = b.anim.interpolate({ inputRange: [0, 1], outputRange: [b.startY, b.endY] });
                const translateX = b.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [b.x, b.x + b.sway, b.x - b.sway * 0.4] });
                const rotate = b.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
                const opacity = b.anim.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 0.85, 0.85, 0] });
                return (
                  <Animated.Text
                    key={`blossom-${i}`}
                    style={{
                      position: 'absolute', fontSize: 20,
                      transform: [{ translateX }, { translateY }, { rotate }, { scale: b.scale }],
                      opacity,
                    }}
                  >
                    🌸
                  </Animated.Text>
                );
              })}

              {/* Text (appears last) */}
              <Animated.View style={{ opacity: textOpacity, alignItems: 'center', marginTop: 24 }}>
                <Text style={styles.welcomeJp}>雲開</Text>
                <Text style={styles.welcomeJpSub}>— seika —</Text>
                <Text style={styles.welcomeEn}>
                  {welcomeName
                    ? t('auth.welcomeToFog', { name: welcomeName })
                    : t('auth.welcomeBack')}
                </Text>
              </Animated.View>
            </Animated.View>
          )}
        </AuthContext.Provider>
      ) : (
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: MiyabiColors.washi },
          }}
        >
          <Stack.Screen name="Login">
            {(props) => (
              <LoginScreen {...props} onLoginSuccess={handleAuthSuccess} onGuestContinue={handleGuestContinue} />
            )}
          </Stack.Screen>
          <Stack.Screen name="SignUp">
            {(props) => (
              <SignUpScreen {...props} onSignUpSuccess={handleAuthSuccess} />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: MiyabiColors.washi,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(220,225,235,0.97)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    overflow: 'hidden',
  },
  cloudBank: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SCREEN_W * 0.65,
    backgroundColor: 'rgba(235,238,245,0.95)',
  },
  cloudBankLeft: {
    left: 0,
    borderTopRightRadius: SCREEN_W * 0.3,
    borderBottomRightRadius: SCREEN_W * 0.3,
  },
  cloudBankRight: {
    right: 0,
    borderTopLeftRadius: SCREEN_W * 0.3,
    borderBottomLeftRadius: SCREEN_W * 0.3,
  },
  cloudBlob: {
    position: 'absolute',
    backgroundColor: 'rgba(245,245,250,0.8)',
    borderRadius: 80,
  },
  welcomeJp: {
    fontSize: 42,
    fontWeight: '200',
    color: 'rgba(45,90,61,0.9)',
    letterSpacing: 12,
    marginBottom: 4,
  },
  welcomeJpSub: {
    fontSize: 13,
    fontWeight: '400',
    color: 'rgba(45,90,61,0.5)',
    letterSpacing: 4,
    marginBottom: 16,
  },
  welcomeEn: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(45,90,61,0.65)',
    letterSpacing: 1,
  },
  drawer: {
    backgroundColor: MiyabiColors.washi,
    width: 280,
  },
  drawerContainer: {
    flex: 1,
  },
  drawerHeader: {
    paddingTop: MiyabiSpacing.xl + 24,
    paddingBottom: MiyabiSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: MiyabiColors.divider,
    marginBottom: MiyabiSpacing.sm,
  },
  navSection: {
    paddingTop: MiyabiSpacing.xs,
  },
  drawerIcon: {
    fontSize: 22,
  },
  drawerLabel: {
    fontSize: 17,
    fontWeight: '600',
    marginLeft: -4,
  },
  drawerItem: {
    marginVertical: 2,
    marginHorizontal: 10,
    borderRadius: MiyabiBorderRadius.md,
    paddingHorizontal: 4,
  },
  drawerFooter: {
    paddingHorizontal: MiyabiSpacing.lg,
    paddingBottom: MiyabiSpacing.lg,
    paddingTop: MiyabiSpacing.md,
    marginTop: 'auto',
  },
  footerDivider: {
    height: 1,
    backgroundColor: MiyabiColors.divider,
    marginBottom: MiyabiSpacing.md,
  },
  drawerFooterText: {
    fontSize: 11,
    color: MiyabiColors.sumiFaded,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});

export default AppNavigator;
