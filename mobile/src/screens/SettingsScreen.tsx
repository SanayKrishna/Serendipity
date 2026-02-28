/**
 * Settings Screen
 * 
 * User preferences including animated language toggle (EN / JA)
 */
import React, { useRef, useEffect, useContext, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../navigation/AppNavigator';
import { authService } from '../services/AuthService';
import { PROFILE_ICON_DEFS } from '../components/ProfileIcons';
import {
  MiyabiColors,
  MiyabiSpacing,
  MiyabiStyles,
  MiyabiShadows,
  MiyabiBorderRadius,
} from '../styles/miyabi';

const TOGGLE_WIDTH = 240;
const TOGGLE_PADDING = 4;
const KNOB_WIDTH = (TOGGLE_WIDTH - TOGGLE_PADDING * 2) / 2;

const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const { logout } = useContext(AuthContext);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const currentLanguage = i18n.language;

  // ── Edit Profile state ─────────────────────────────────────────────
  const user = authService.getUser();
  const isEmailUser = user?.authType === 'email';
  const [profileIcon, setProfileIcon] = useState(user?.profileIcon || PROFILE_ICON_DEFS[0].id);
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const usernameTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced username availability check
  const checkUsername = useCallback((name: string) => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    if (!name || name.length < 3 || name === user?.username) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    usernameTimerRef.current = setTimeout(async () => {
      try {
        const { getAuthApiUrl } = require('../config/api');
        const res = await fetch(`${getAuthApiUrl()}/auth/check-username`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name.toLowerCase().trim() }),
        });
        const data = await res.json();
        setUsernameStatus(data.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  }, [user?.username]);

  const handleSaveProfile = async () => {
    if (!user || !isEmailUser) return;
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    const newUsername = editUsername.toLowerCase().trim() !== user.username ? editUsername.toLowerCase().trim() : undefined;
    const newIcon = profileIcon !== user.profileIcon ? profileIcon : undefined;
    if (!newUsername && !newIcon) return;
    if (newUsername && usernameStatus === 'taken') return;

    setSaveStatus('saving');
    setSaveError('');
    const result = await authService.updateProfile(userId, newUsername, newIcon);
    if (result.success) {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } else {
      setSaveStatus('error');
      setSaveError(result.error || 'Failed to save');
    }
  };
  
  // Animated value for toggle slider (0 = EN, 1 = JA)
  const slideAnim = useRef(new Animated.Value(currentLanguage === 'ja' ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: currentLanguage === 'ja' ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [currentLanguage]);

  const handleLanguageChange = async (languageCode: string) => {
    try {
      await i18n.changeLanguage(languageCode);
      console.log(`🌐 Language changed to: ${languageCode}`);
    } catch (error) {
      console.error('❌ Failed to change language:', error);
    }
  };

  const knobTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, KNOB_WIDTH],
  });

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setLoggingOut(true);
    // Auth context handles clearing session + resetting navigation state
    await logout();
    setLoggingOut(false);
  };

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
          <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        {/* Edit Profile Section (email-auth users only) */}
        {isEmailUser && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.editProfile')}</Text>
            <Text style={styles.sectionDescription}>{t('settings.editProfileDesc')}</Text>

            {/* Current avatar + icon picker */}
            <Text style={styles.fieldLabel}>{t('auth.chooseIcon')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.iconScroll}
            >
              {PROFILE_ICON_DEFS.map((icon) => {
                const isSelected = profileIcon === icon.id;
                return (
                  <TouchableOpacity
                    key={icon.id}
                    style={[styles.iconOption, isSelected && styles.iconOptionSelected]}
                    onPress={() => setProfileIcon(icon.id)}
                    accessibilityLabel={icon.label}
                  >
                    <icon.Component
                      size={28}
                      color={isSelected ? MiyabiColors.bamboo : MiyabiColors.sumiLight}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Username editor */}
            <Text style={[styles.fieldLabel, { marginTop: MiyabiSpacing.md }]}>{t('auth.username')}</Text>
            <View style={styles.usernameRow}>
              <TextInput
                style={[styles.usernameInput, usernameStatus === 'taken' && { borderColor: MiyabiColors.error }]}
                value={editUsername}
                onChangeText={(v) => {
                  const clean = v.toLowerCase().replace(/[^a-z0-9]/g, '');
                  setEditUsername(clean);
                  checkUsername(clean);
                }}
                placeholder={user?.username || 'username'}
                placeholderTextColor={MiyabiColors.sumiFaded}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={15}
              />
              {usernameStatus === 'checking' && <ActivityIndicator size="small" color={MiyabiColors.bamboo} style={{ marginLeft: 8 }} />}
              {usernameStatus === 'available' && <Text style={styles.usernameOk}>✓</Text>}
              {usernameStatus === 'taken' && <Text style={styles.usernameBad}>✗</Text>}
            </View>
            {usernameStatus === 'taken' && (
              <Text style={styles.usernameError}>{t('settings.usernameUnavailable')}</Text>
            )}

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveButton, (saveStatus === 'saving' || usernameStatus === 'taken') && { opacity: 0.5 }]}
              onPress={handleSaveProfile}
              disabled={saveStatus === 'saving' || usernameStatus === 'taken'}
              activeOpacity={0.7}
            >
              {saveStatus === 'saving' ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : saveStatus === 'saved' ? (
                <Text style={styles.saveButtonText}>✓ {t('settings.saved')}</Text>
              ) : (
                <Text style={styles.saveButtonText}>{t('settings.save')}</Text>
              )}
            </TouchableOpacity>
            {saveStatus === 'error' && <Text style={styles.saveErrorText}>{saveError}</Text>}
          </View>
        )}

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
          <Text style={styles.sectionDescription}>{t('settings.languageDescription')}</Text>
          
          {/* Animated Toggle */}
          <View style={styles.toggleContainer}>
            {/* Background track */}
            <View style={styles.toggleTrack}>
              {/* Sliding knob */}
              <Animated.View
                style={[
                  styles.toggleKnob,
                  { transform: [{ translateX: knobTranslateX }] },
                ]}
              />
              
              {/* EN Option */}
              <TouchableOpacity
                style={styles.toggleOption}
                onPress={() => handleLanguageChange('en')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.toggleLabel,
                  currentLanguage === 'en' && styles.toggleLabelActive,
                ]}>
                  EN
                </Text>
                <Text style={[
                  styles.toggleSublabel,
                  currentLanguage === 'en' && styles.toggleSublabelActive,
                ]}>
                  English
                </Text>
              </TouchableOpacity>
              
              {/* JA Option */}
              <TouchableOpacity
                style={styles.toggleOption}
                onPress={() => handleLanguageChange('ja')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.toggleLabel,
                  currentLanguage === 'ja' && styles.toggleLabelActive,
                ]}>
                  JA
                </Text>
                <Text style={[
                  styles.toggleSublabel,
                  currentLanguage === 'ja' && styles.toggleSublabelActive,
                ]}>
                  日本語
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoEmoji}>⛩️</Text>
          <Text style={styles.infoText}>Serendipity SNS</Text>
          <Text style={styles.infoSubText}>Version 1.0.0</Text>
          <Text style={styles.infoSubText}>{t('settings.appDescription')}</Text>
        </View>

        {/* Log Out */}
        <View style={styles.logoutSection}>
          {!showLogoutConfirm ? (
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => setShowLogoutConfirm(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutButtonText}>{t('settings.logout') || 'Log Out'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.logoutConfirmBox}>
              <Text style={styles.logoutConfirmText}>{t('settings.logoutConfirm') || 'Are you sure you want to log out?'}</Text>
              <View style={styles.logoutConfirmRow}>
                <TouchableOpacity
                  style={styles.logoutCancelBtn}
                  onPress={() => setShowLogoutConfirm(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.logoutCancelText}>{t('settings.cancel') || 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.logoutConfirmBtn}
                  onPress={handleLogout}
                  disabled={loggingOut}
                  activeOpacity={0.7}
                >
                  {loggingOut ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.logoutConfirmBtnText}>{t('settings.logoutConfirmBtn') || 'Log Out'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

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
  },
  
  // Content
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: MiyabiSpacing.lg,
  },
  
  // Section
  section: {
    marginBottom: MiyabiSpacing.xl,
  },
  sectionTitle: {
    ...MiyabiStyles.subheading,
    marginBottom: 4,
    color: MiyabiColors.bamboo,
  },
  sectionDescription: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    marginBottom: MiyabiSpacing.lg,
  },

  // Edit Profile
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: MiyabiColors.sumiLight,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginBottom: MiyabiSpacing.xs,
  },
  iconScroll: {
    paddingVertical: MiyabiSpacing.xs,
    gap: 8,
  },
  iconOption: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: MiyabiColors.cardBackground,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: 'transparent',
    ...MiyabiShadows.sm,
  },
  iconOptionSelected: {
    borderColor: MiyabiColors.bamboo,
    backgroundColor: MiyabiColors.bamboo + '15',
  },
  usernameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  usernameInput: {
    flex: 1,
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    paddingHorizontal: MiyabiSpacing.md,
    paddingVertical: MiyabiSpacing.sm + 2,
    fontSize: 15,
    color: MiyabiColors.sumi,
    borderWidth: 1,
    borderColor: MiyabiColors.divider,
  },
  usernameOk: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#4CAF50',
  },
  usernameBad: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: '700' as const,
    color: MiyabiColors.error,
  },
  usernameError: {
    fontSize: 12,
    color: MiyabiColors.error,
    marginTop: 4,
  },
  saveButton: {
    marginTop: MiyabiSpacing.md,
    backgroundColor: MiyabiColors.bamboo,
    borderRadius: MiyabiBorderRadius.md,
    paddingVertical: MiyabiSpacing.sm + 4,
    alignItems: 'center' as const,
    ...MiyabiShadows.sm,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  saveErrorText: {
    fontSize: 12,
    color: MiyabiColors.error,
    textAlign: 'center' as const,
    marginTop: 6,
  },
  
  // Toggle
  toggleContainer: {
    alignItems: 'center',
  },
  toggleTrack: {
    width: TOGGLE_WIDTH,
    height: 64,
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: 16,
    flexDirection: 'row',
    padding: TOGGLE_PADDING,
    ...MiyabiShadows.md,
    borderWidth: 1,
    borderColor: MiyabiColors.divider,
  },
  toggleKnob: {
    position: 'absolute',
    top: TOGGLE_PADDING,
    left: TOGGLE_PADDING,
    width: KNOB_WIDTH,
    height: 64 - TOGGLE_PADDING * 2,
    backgroundColor: MiyabiColors.bamboo,
    borderRadius: 12,
  },
  toggleOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: MiyabiColors.sumiLight,
    letterSpacing: 1,
  },
  toggleLabelActive: {
    color: '#FFFFFF',
  },
  toggleSublabel: {
    fontSize: 11,
    color: MiyabiColors.sumiFaded,
    marginTop: 2,
  },
  toggleSublabelActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  
  // Info Section
  infoSection: {
    alignItems: 'center',
    paddingVertical: MiyabiSpacing.xxl,
  },
  infoEmoji: {
    fontSize: 40,
    marginBottom: MiyabiSpacing.sm,
  },
  infoText: {
    ...MiyabiStyles.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoSubText: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.sumiLight,
    marginBottom: 2,
  },
  
  // Logout
  logoutSection: {
    marginTop: MiyabiSpacing.lg,
    paddingBottom: MiyabiSpacing.xxl,
  },
  logoutButton: {
    borderWidth: 1.5,
    borderColor: MiyabiColors.error,
    borderRadius: MiyabiBorderRadius.md,
    paddingVertical: MiyabiSpacing.md,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: MiyabiColors.error,
    letterSpacing: 0.3,
  },
  logoutConfirmBox: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.md,
    ...MiyabiShadows.sm,
  },
  logoutConfirmText: {
    fontSize: 14,
    color: MiyabiColors.sumi,
    textAlign: 'center',
    marginBottom: MiyabiSpacing.md,
  },
  logoutConfirmRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: MiyabiSpacing.sm,
  },
  logoutCancelBtn: {
    flex: 1,
    paddingVertical: MiyabiSpacing.sm + 2,
    borderRadius: MiyabiBorderRadius.sm,
    borderWidth: 1,
    borderColor: MiyabiColors.divider,
    alignItems: 'center',
  },
  logoutCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: MiyabiColors.sumiLight,
  },
  logoutConfirmBtn: {
    flex: 1,
    paddingVertical: MiyabiSpacing.sm + 2,
    borderRadius: MiyabiBorderRadius.sm,
    backgroundColor: MiyabiColors.error,
    alignItems: 'center',
  },
  logoutConfirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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

export default SettingsScreen;
