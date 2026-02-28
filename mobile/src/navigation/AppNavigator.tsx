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
import { View, Text, StyleSheet, ActivityIndicator, Animated, Dimensions } from 'react-native';
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

let LottieView: any = null;
try { LottieView = require('lottie-react-native'); if (LottieView && LottieView.default) LottieView = LottieView.default; } catch (_) {}

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
  const welcomeOpacity = useRef(new Animated.Value(0)).current;

  // Cherry-blossom petal particles
  const blossomRefs = useRef(
    Array.from({ length: 8 }, () => ({
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

    // Start blossom particle animations
    blossomRefs.forEach((b) => {
      b.anim.setValue(0);
      Animated.timing(b.anim, {
        toValue: 1,
        duration: b.duration,
        delay: b.delay,
        useNativeDriver: true,
      }).start();
    });

    Animated.sequence([
      Animated.timing(welcomeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(welcomeOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
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
          {/* Welcome overlay — Lottie animation + cherry blossom petals */}
          {showWelcome && (
            <Animated.View style={[styles.welcomeOverlay, { opacity: welcomeOpacity }]} pointerEvents="none">
              {/* Lottie zen ripple animation (placeholder — swap with premium later) */}
              {LottieView && (
                <LottieView
                  source={require('../../assets/lottie/welcome.json')}
                  autoPlay
                  loop={false}
                  speed={0.8}
                  style={styles.welcomeLottie}
                />
              )}

              {/* Floating cherry-blossom petals */}
              {blossomRefs.map((b, i) => {
                const translateY = b.anim.interpolate({ inputRange: [0, 1], outputRange: [b.startY, b.endY] });
                const translateX = b.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [b.x, b.x + b.sway, b.x - b.sway * 0.4] });
                const rotate = b.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
                const opacity = b.anim.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 0.85, 0.85, 0] });
                return (
                  <Animated.Text
                    key={i}
                    style={{
                      position: 'absolute',
                      fontSize: 20,
                      transform: [{ translateX }, { translateY }, { rotate }, { scale: b.scale }],
                      opacity,
                    }}
                  >
                    🌸
                  </Animated.Text>
                );
              })}

              <Text style={styles.welcomeJp}>ようこそ</Text>
              <Text style={styles.welcomeEn}>
                {welcomeName
                  ? t('auth.welcomeToFog', { name: welcomeName })
                  : t('auth.welcomeBack')}
              </Text>
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
    backgroundColor: 'rgba(15,20,35,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  welcomeLottie: {
    position: 'absolute',
    width: 260,
    height: 260,
    opacity: 0.5,
  },
  welcomeJp: {
    fontSize: 36,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 6,
    marginBottom: 8,
  },
  welcomeEn: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
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
