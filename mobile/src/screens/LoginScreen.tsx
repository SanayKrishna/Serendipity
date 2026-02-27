/**
 * Login Screen - Minimalistic, Clean, Mysterious
 * 
 * Features:
 * - Single identifier input (accepts username OR email)
 * - Password input
 * - Smooth keyboard avoiding
 * - Toggle to sign up
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MiyabiColors, MiyabiSpacing, MiyabiBorderRadius, MiyabiTypography, MiyabiShadows } from '../styles/miyabi';
import { AppLogo } from '../components/AppLogo';
import { authService } from '../services/AuthService';
import { useTranslation } from 'react-i18next';

interface LoginScreenProps {
  navigation: any;
  onLoginSuccess: (user: any) => void;
  onGuestContinue?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation, onLoginSuccess, onGuestContinue }) => {
  const { t, i18n } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleLogin = async () => {
    setError('');
    
    // Validation
    if (!identifier || !password) {
      setError(t('auth.enterCredentials'));
      return;
    }
    
    setIsLoading(true);
    
    try {
      const result = await authService.login(identifier, password);
      
      if (!result.success) {
        throw new Error(result.error || 'Login failed');
      }
      
      // Call success callback — session is already persisted in AsyncStorage
      // by authService.login(), so "Remember Me" works automatically
      onLoginSuccess(authService.getUser());
      
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };
  
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
            <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
            <Text style={styles.subtitle}>{t('auth.continueExploration')}</Text>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
            {/* Identifier (username or email) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.usernameOrEmail')}</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="explorer or your@email.com"
                placeholderTextColor={MiyabiColors.sumiFaded}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
              />
            </View>
            
            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={MiyabiColors.sumiFaded}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={64}
                textContentType="password"
              />
            </View>
            
            {/* Error message */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            
            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={MiyabiColors.washi} />
              ) : (
                <Text style={styles.submitButtonText}>{t('auth.signIn')}</Text>
              )}
            </TouchableOpacity>
            
            {/* Switch to sign up */}
            <View style={styles.switchContainer}>
              <Text style={styles.switchText}>{t('auth.newExplorer')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.switchLink}>{t('auth.createAccount')}</Text>
              </TouchableOpacity>
            </View>

            {/* Continue as Guest */}
            {onGuestContinue && (
              <TouchableOpacity
                style={styles.guestButton}
                onPress={onGuestContinue}
              >
                <Text style={styles.guestButtonText}>{t('auth.continueAsGuest')}</Text>
              </TouchableOpacity>
            )}

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
    justifyContent: 'center',
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
  guestButton: {
    marginTop: MiyabiSpacing.xl,
    paddingVertical: MiyabiSpacing.md,
    alignItems: 'center',
    borderRadius: MiyabiBorderRadius.md,
    borderWidth: 1,
    borderColor: MiyabiColors.divider,
  },
  guestButtonText: {
    fontSize: MiyabiTypography.fontSize.sm,
    fontWeight: MiyabiTypography.fontWeight.medium,
    color: MiyabiColors.sumiLight,
    letterSpacing: 0.3,
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
});

export default LoginScreen;
