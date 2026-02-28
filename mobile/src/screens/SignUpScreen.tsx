/**
 * Sign Up Screen - Minimalistic, Clean, Mysterious
 * 
 * Features:
 * - Email, username, password inputs with validation
 * - Real-time username availability check (debounced)
 * - Password strength meter (subtle animated line)
 * - Profile icon selection (horizontally scrollable carousel)
 * - Smooth keyboard avoiding
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { MiyabiColors, MiyabiSpacing, MiyabiBorderRadius, MiyabiTypography, MiyabiShadows } from '../styles/miyabi';
import { AppLogo } from '../components/AppLogo';
import { getAuthApiUrl } from '../config/api';
import authService from '../services/AuthService';
import { PROFILE_ICON_DEFS } from '../components/ProfileIcons';
import { useTranslation } from 'react-i18next';

interface SignUpScreenProps {
  navigation: any;
  onSignUpSuccess: (user: any) => void;
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation, onSignUpSuccess }) => {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(PROFILE_ICON_DEFS[0].id);
  const [rememberMe, setRememberMe] = useState(false);
  
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Password strength (0-3: weak, medium, strong)
  const [passwordStrength, setPasswordStrength] = useState(0);
  const strengthAnim = React.useRef(new Animated.Value(0)).current;
  
  // Debounced username check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    
    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${getAuthApiUrl()}/auth/check-username`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.toLowerCase() }),
        });
        const data = await response.json();
        setUsernameAvailable(data.available);
      } catch (err) {
        console.error('Username check failed:', err);
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [username]);
  
  // Password strength calculation
  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    setPasswordStrength(Math.min(strength, 3));
    
    Animated.spring(strengthAnim, {
      toValue: Math.min(strength, 3),
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  }, [password]);
  
  const handleSignUp = async () => {
    setError('');
    
    // Validation
    if (!email || !username || !password) {
      setError(t('auth.fillAllFields'));
      return;
    }
    
    if (username.length < 3 || username.length > 15) {
      setError('Username must be 3-15 characters');
      return;
    }
    
    if (!/^[a-z0-9]+$/.test(username)) {
      setError('Username must be lowercase alphanumeric');
      return;
    }
    
    if (!usernameAvailable) {
      setError(t('auth.usernameTaken') || 'Username is not available');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Strip ALL invisible Unicode format/control characters that Android keyboards
    // inject inside the password (zero-width spaces \u200B, word joiners \u2060,
    // soft hyphens \u00AD, BOM \uFEFF, etc.) — trim() only removes edge whitespace
    // and misses chars injected in the MIDDLE of the string.
    const rawPassword = password
      .replace(/\p{Cf}/gu, '')        // Unicode Format chars (invisible, zero-width)
      .replace(/[\x00-\x1F\x7F]/g, '') // ASCII control chars
      .trim();

    const rawConfirmPassword = confirmPassword
      .replace(/\p{Cf}/gu, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();

    if (rawPassword !== rawConfirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    // No length limit — backend uses SHA-256 pre-hashing before bcrypt,
    // so any password length is accepted.
    
    setIsLoading(true);
    
    try {
      const result = await authService.signup(
        email,
        username,
        rawPassword,
        selectedIcon,
        rememberMe,
      );

      if (!result.success) {
        throw new Error(result.error || 'Sign up failed');
      }

      // authService.signup() persists the session; fetch the current user
      const user = authService.getUser();
      onSignUpSuccess(user);

    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Password strength color
  const strengthColor = strengthAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [MiyabiColors.error, '#E6B422', '#A3B89E', MiyabiColors.bamboo],
  });
  
  const strengthWidth = strengthAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['0%', '33%', '66%', '100%'],
  });
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <AppLogo size="large" />
            <Text style={styles.title}>{t('auth.joinJourney')}</Text>
            <Text style={styles.subtitle}>{t('auth.createIdentity')}</Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.email')}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={MiyabiColors.sumiFaded}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
            </View>
            
            {/* Username */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.username')}</Text>
              <View style={styles.inputWithIndicator}>
                <TextInput
                  style={[styles.input, { paddingRight: 40 }]}
                  value={username}
                  onChangeText={(text) => setUsername(text.toLowerCase())}
                  placeholder="explorer"
                  placeholderTextColor={MiyabiColors.sumiFaded}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={15}
                  textContentType="username"
                />
                {/* Username availability indicator */}
                <View style={styles.usernameIndicator}>
                  {usernameChecking ? (
                    <ActivityIndicator size="small" color={MiyabiColors.bamboo} />
                  ) : usernameAvailable === true ? (
                    <Text style={styles.checkmark}>✓</Text>
                  ) : usernameAvailable === false ? (
                    <Text style={styles.crossmark}>✗</Text>
                  ) : null}
                </View>
              </View>
              {usernameAvailable === false && (
                <Text style={styles.errorHint}>Username taken</Text>
              )}
            </View>
            
            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <View style={styles.inputWithIndicator}>
                <TextInput
                  style={[styles.input, { paddingRight: 48 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={MiyabiColors.sumiFaded}
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.eyeToggle}
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isPasswordVisible ? (
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={MiyabiColors.sumiLight} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      <SvgCircle cx={12} cy={12} r={3} stroke={MiyabiColors.sumiLight} strokeWidth={1.5} />
                    </Svg>
                  ) : (
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={MiyabiColors.sumiLight} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      <SvgCircle cx={12} cy={12} r={3} stroke={MiyabiColors.sumiLight} strokeWidth={1.5} />
                      <Path d="M4.93 4.93l14.14 14.14" stroke={MiyabiColors.sumiLight} strokeWidth={1.5} strokeLinecap="round" />
                    </Svg>
                  )}
                </TouchableOpacity>
              </View>
              {/* Password strength meter */}
              {password.length > 0 && (
                <View style={styles.strengthMeterContainer}>
                  <View style={styles.strengthMeterBg} />
                  <Animated.View
                    style={[
                      styles.strengthMeterFill,
                      {
                        backgroundColor: strengthColor,
                        width: strengthWidth,
                      },
                    ]}
                  />
                </View>
              )}
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
              <View style={styles.inputWithIndicator}>
                <TextInput
                  style={[styles.input, { paddingRight: 48 }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={MiyabiColors.sumiFaded}
                  secureTextEntry={!isConfirmPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.eyeToggle}
                  onPress={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isConfirmPasswordVisible ? (
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={MiyabiColors.sumiLight} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      <SvgCircle cx={12} cy={12} r={3} stroke={MiyabiColors.sumiLight} strokeWidth={1.5} />
                    </Svg>
                  ) : (
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={MiyabiColors.sumiLight} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      <SvgCircle cx={12} cy={12} r={3} stroke={MiyabiColors.sumiLight} strokeWidth={1.5} />
                      <Path d="M4.93 4.93l14.14 14.14" stroke={MiyabiColors.sumiLight} strokeWidth={1.5} strokeLinecap="round" />
                    </Svg>
                  )}
                </TouchableOpacity>
              </View>
              {/* Mismatch hint (shown only when both fields have content) */}
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <Text style={styles.errorHint}>{t('auth.passwordsDoNotMatch')}</Text>
              )}
            </View>
            
            {/* Profile Icon Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.chooseIcon')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.iconScroll}
              >
                {PROFILE_ICON_DEFS.map((icon) => {
                  const isSelected = selectedIcon === icon.id;
                  return (
                    <TouchableOpacity
                      key={icon.id}
                      style={[
                        styles.iconOption,
                        isSelected && styles.iconOptionSelected,
                      ]}
                      onPress={() => setSelectedIcon(icon.id)}
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
            </View>

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={[styles.rememberCheckbox, rememberMe && styles.rememberCheckboxChecked]}>
                {rememberMe && <Text style={styles.rememberCheck}>✓</Text>}
              </View>
              <Text style={styles.rememberText}>{t('auth.rememberMe')}</Text>
            </TouchableOpacity>
            
            {/* Error message */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            
            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSignUp}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={MiyabiColors.washi} />
              ) : (
                <Text style={styles.submitButtonText}>{t('auth.createAccount')}</Text>
              )}
            </TouchableOpacity>
            
            {/* Switch to login */}
            <View style={styles.switchContainer}>
              <Text style={styles.switchText}>{t('auth.alreadyHaveAccount')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.switchLink}>{t('auth.signIn')}</Text>
              </TouchableOpacity>
            </View>

            {/* Language Toggle — footer */}
            <TouchableOpacity
              style={styles.langToggle}
              onPress={() => i18n.changeLanguage(i18n.language === 'en' ? 'ja' : 'en')}
            >
              <Text style={[styles.langCode, i18n.language === 'en' && styles.langActive]}>EN</Text>
              <Text style={styles.langSep}> | </Text>
              <Text style={[styles.langCode, i18n.language === 'ja' && styles.langActive]}>JP</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MiyabiColors.washi,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: MiyabiSpacing.lg,
    paddingBottom: MiyabiSpacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: MiyabiSpacing.xxl,
    paddingBottom: MiyabiSpacing.xl,
  },
  title: {
    fontSize: MiyabiTypography.fontSize.xxl,
    fontWeight: MiyabiTypography.fontWeight.bold,
    color: MiyabiColors.sumi,
    marginTop: MiyabiSpacing.md,
  },
  subtitle: {
    fontSize: MiyabiTypography.fontSize.base,
    color: MiyabiColors.sumiLight,
    marginTop: MiyabiSpacing.xs,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: MiyabiSpacing.lg,
  },
  label: {
    fontSize: MiyabiTypography.fontSize.sm,
    fontWeight: MiyabiTypography.fontWeight.medium,
    color: MiyabiColors.sumiLight,
    marginBottom: MiyabiSpacing.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    paddingHorizontal: MiyabiSpacing.md,
    paddingVertical: MiyabiSpacing.md,
    fontSize: MiyabiTypography.fontSize.base,
    color: MiyabiColors.sumi,
    ...MiyabiShadows.sm,
  },
  inputWithIndicator: {
    position: 'relative',
  },
  usernameIndicator: {
    position: 'absolute',
    right: MiyabiSpacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 24,
  },
  checkmark: {
    fontSize: 18,
    color: MiyabiColors.bamboo,
  },
  crossmark: {
    fontSize: 18,
    color: MiyabiColors.error,
  },
  eyeToggle: {
    position: 'absolute' as const,
    right: MiyabiSpacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 32,
  },
  eyeIcon: {
    fontSize: 18,
  },
  errorHint: {
    fontSize: MiyabiTypography.fontSize.xs,
    color: MiyabiColors.error,
    marginTop: MiyabiSpacing.xs,
  },
  strengthMeterContainer: {
    marginTop: MiyabiSpacing.xs,
    height: 2,
    position: 'relative',
  },
  strengthMeterBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: MiyabiColors.divider,
    borderRadius: 1,
  },
  strengthMeterFill: {
    position: 'absolute',
    left: 0,
    height: 2,
    borderRadius: 1,
  },
  iconScroll: {
    paddingVertical: MiyabiSpacing.xs,
  },
  iconOption: {
    width: 56,
    height: 56,
    borderRadius: MiyabiBorderRadius.md,
    backgroundColor: MiyabiColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: MiyabiSpacing.sm,
    ...MiyabiShadows.sm,
  },
  iconOptionSelected: {
    backgroundColor: MiyabiColors.bamboo + '20',
    borderWidth: 2,
    borderColor: MiyabiColors.bamboo,
  },
  iconEmoji: {
    fontSize: 28,
  },
  errorText: {
    fontSize: MiyabiTypography.fontSize.sm,
    color: MiyabiColors.error,
    marginBottom: MiyabiSpacing.md,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: MiyabiColors.bamboo,
    borderRadius: MiyabiBorderRadius.md,
    paddingVertical: MiyabiSpacing.md + 2,
    alignItems: 'center',
    ...MiyabiShadows.md,
    marginTop: MiyabiSpacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: MiyabiTypography.fontSize.base,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: MiyabiColors.washi,
    letterSpacing: 0.3,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: MiyabiSpacing.lg,
  },
  switchText: {
    fontSize: MiyabiTypography.fontSize.sm,
    color: MiyabiColors.sumiLight,
  },
  switchLink: {
    fontSize: MiyabiTypography.fontSize.sm,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: MiyabiColors.bamboo,
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: MiyabiSpacing.xl,
    paddingBottom: MiyabiSpacing.md,
  },
  langCode: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: MiyabiColors.sumiLight,
    letterSpacing: 0.5,
  },
  langActive: {
    color: MiyabiColors.bamboo,
  },
  langSep: {
    fontSize: 12,
    color: MiyabiColors.divider,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: MiyabiSpacing.lg,
    marginTop: MiyabiSpacing.xs,
  },
  rememberCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: MiyabiColors.sumiLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: MiyabiSpacing.sm,
    backgroundColor: MiyabiColors.cardBackground,
  },
  rememberCheckboxChecked: {
    backgroundColor: MiyabiColors.bamboo,
    borderColor: MiyabiColors.bamboo,
  },
  rememberCheck: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginTop: -1,
  },
  rememberText: {
    fontSize: MiyabiTypography.fontSize.sm,
    color: MiyabiColors.sumiLight,
  },
});

export default SignUpScreen;
