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
import { MiyabiColors, MiyabiSpacing, MiyabiBorderRadius, MiyabiTypography, MiyabiShadows } from '../styles/miyabi';
import { AppLogo } from '../components/AppLogo';
import { getAuthApiUrl } from '../config/api';

// Profile icons (IDs that match backend)
const PROFILE_ICONS = [
  { id: 'explorer_01', emoji: '🧭', label: 'Explorer' },
  { id: 'fox_02', emoji: '🦊', label: 'Fox' },
  { id: 'owl_03', emoji: '🦉', label: 'Owl' },
  { id: 'compass_04', emoji: '🧭', label: 'Compass' },
  { id: 'map_05', emoji: '🗺️', label: 'Map' },
  { id: 'telescope_06', emoji: '🔭', label: 'Telescope' },
  { id: 'lantern_07', emoji: '🏮', label: 'Lantern' },
  { id: 'key_08', emoji: '🗝️', label: 'Key' },
  { id: 'gem_09', emoji: '💎', label: 'Gem' },
  { id: 'star_10', emoji: '⭐', label: 'Star' },
];

interface SignUpScreenProps {
  navigation: any;
  onSignUpSuccess: (user: any) => void;
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ navigation, onSignUpSuccess }) => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('explorer_01');
  
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
      setError('Please fill in all fields');
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
      setError('Username is not available');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${getAuthApiUrl()}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          username: username.toLowerCase(),
          password,
          profile_icon: selectedIcon,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Sign up failed');
      }
      
      const data = await response.json();
      
      // Call success callback with user data
      onSignUpSuccess(data);
      
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
            <Text style={styles.title}>Join the Journey</Text>
            <Text style={styles.subtitle}>Create your explorer identity</Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
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
              <Text style={styles.label}>Username</Text>
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
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={MiyabiColors.sumiFaded}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
              />
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
            
            {/* Profile Icon Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Choose Your Icon</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.iconScroll}
              >
                {PROFILE_ICONS.map((icon) => (
                  <TouchableOpacity
                    key={icon.id}
                    style={[
                      styles.iconOption,
                      selectedIcon === icon.id && styles.iconOptionSelected,
                    ]}
                    onPress={() => setSelectedIcon(icon.id)}
                  >
                    <Text style={styles.iconEmoji}>{icon.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            
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
                <Text style={styles.submitButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>
            
            {/* Switch to login */}
            <View style={styles.switchContainer}>
              <Text style={styles.switchText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.switchLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
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
});

export default SignUpScreen;
