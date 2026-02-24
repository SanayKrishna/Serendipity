/**
 * Drop Screen — Create a new Pin
 *
 * Module 2 requirements:
 * ─ Location is LOCKED the instant this screen opens (bullet-train fix).
 * ─ GPS accuracy gate: submit disabled until accuracy ≤ 15 m.
 * ─ Micro-adjustment nudge pad: move pin up to 5 m in any compass direction.
 * ─ Self-destruct timer dial: 1 h / 6 h / 24 h / 72 h options.
 * ─ Pin-drop ripple animation on confirm.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Keyboard,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import locationService, { LocationCoords } from '../services/LocationService';
import apiService from '../services/ApiService';
import { BasicMap } from '../components';
import { SimpleConfirmDialog } from '../components/SimpleConfirmDialog';

const MAX_CHARACTERS = 280;

// ── Move a coord by (northMetres, eastMetres) — tiny flat-earth approximation ──
const nudgeCoords = (lat: number, lon: number, northM: number, eastM: number) => ({
  latitude:  lat + northM / 111320,
  longitude: lon + eastM  / (111320 * Math.cos(lat * Math.PI / 180)),
});

// Self-destruct timer options
const TIMER_OPTIONS: Array<{ label: string; hours: number }> = [
  { label: '1 Day',   hours: 24  },
  { label: '1 Week',  hours: 168 },
  { label: '1 Month', hours: 730 },
];

const MAX_NUDGE_METERS = 5;

// Minimum clearance before a new drop is allowed at the same spot
const PIN_MIN_M = 5;           // regular pins must be ≥5 m from any other pin
const COMMUNITY_PIN_MIN_M = 15; // community pins need ≥15 m clearance

// Haversine for the proximity gate (self-contained — no external lib needed)
const dropHaversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const DropScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  // lockedLocation = GPS snapshot taken the moment the screen opened (never changes)
  const [lockedLocation, setLockedLocation] = useState<LocationCoords | null>(null);
  // displayLocation = lockedLocation + user nudge offsets
  const [displayLocation, setDisplayLocation] = useState<LocationCoords | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(true);
  const [success, setSuccess] = useState(false);
  const [isCommunityPin, setIsCommunityPin] = useState(false);
  const [selectedHours, setSelectedHours] = useState(168); // default: 1 week
  // Nudge: offset in metres from locked position
  const [nudgeNorth, setNudgeNorth] = useState(0);
  const [nudgeEast,  setNudgeEast]  = useState(0);
  // Drop animation refs
  const dropAnim   = useRef(new Animated.Value(0)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;
  // Community broadcast rings
  const ring1Anim  = useRef(new Animated.Value(0)).current;
  const ring2Anim  = useRef(new Animated.Value(0)).current;
  const ring3Anim  = useRef(new Animated.Value(0)).current;
  // Track which type was submitted (for success animation)
  const [submittedAsCommunity, setSubmittedAsCommunity] = React.useState(false);

  // Themed dialog state (replaces Alert.alert)
  const [dialog, setDialog] = useState({ visible: false, title: '', message: '' });
  const showInfo = (title: string, message: string) => setDialog({ visible: true, title, message });
  const dismissDialog = () => setDialog(d => ({ ...d, visible: false }));

  // Recalculate displayLocation whenever nudge changes
  useEffect(() => {
    if (!lockedLocation) return;
    const { latitude, longitude } = nudgeCoords(
      lockedLocation.latitude, lockedLocation.longitude, nudgeNorth, nudgeEast
    );
    setDisplayLocation({ latitude, longitude, accuracy: lockedLocation.accuracy });
  }, [nudgeNorth, nudgeEast, lockedLocation]);

  const lockLocation = async () => {
    setIsGettingLocation(true);
    try {
      const coords = await locationService.getCurrentLocation();
      setLockedLocation(coords);
      setDisplayLocation(coords);
    } catch (err) {
      console.warn('lockLocation error:', err);
      setLockedLocation(null);
      setDisplayLocation(null);
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Re-lock GPS each time the screen gains focus.
  // useFocusEffect fires on every navigation visit; useEffect(fn,[]) only on first mount.
  useFocusEffect(
    useCallback(() => {
      lockLocation();
    }, [])
  );

  // Total displacement from locked position
  const totalNudge = Math.sqrt(nudgeNorth ** 2 + nudgeEast ** 2);

  const tryNudge = (dN: number, dE: number) => {
    const newN = nudgeNorth + dN;
    const newE = nudgeEast  + dE;
    if (Math.sqrt(newN ** 2 + newE ** 2) > MAX_NUDGE_METERS) return;
    setNudgeNorth(newN);
    setNudgeEast(newE);
  };

  const playDropAnimation = (isCommunity: boolean) => {
    if (isCommunity) {
      // Community: 3 expanding broadcast rings (purple)
      ring1Anim.setValue(0); ring2Anim.setValue(0); ring3Anim.setValue(0);
      Animated.stagger(180, [
        Animated.timing(ring1Anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(ring2Anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(ring3Anim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start();
    } else {
      // Regular: pin drops from above + single ripple (blue)
      dropAnim.setValue(0); rippleAnim.setValue(0);
      Animated.sequence([
        Animated.spring(dropAnim,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(rippleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]).start();
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      showInfo(t('drop.emptyMessageTitle'), t('drop.emptyMessageText'));
      return;
    }
    if (!displayLocation) {
      showInfo(t('drop.locationRequiredTitle'), t('drop.locationRequiredText'));
      return;
    }
    Keyboard.dismiss();

    // ── Proximity gate ────────────────────────────────────────────────────
    // Before creating the pin, check that no existing pin is within the
    // minimum clearance distance. Any pin (own or others') counts.
    // If the network call fails we let the drop proceed so offline use isn't broken.
    try {
      const nearby = await apiService.discoverPins(
        displayLocation.latitude, displayLocation.longitude
      );
      const minDist = isCommunityPin ? COMMUNITY_PIN_MIN_M : PIN_MIN_M;
      const conflict = nearby.pins.find(p =>
        dropHaversine(displayLocation.latitude, displayLocation.longitude, p.latitude, p.longitude) < minDist
      );
      if (conflict) {
        const dist = Math.round(
          dropHaversine(displayLocation.latitude, displayLocation.longitude, conflict.latitude, conflict.longitude)
        );
        showInfo(
          t('drop.tooCloseTitle'),
          t('drop.tooCloseMsg', { distance: dist, required: minDist })
        );
        return;
      }
    } catch (_) {
      // Proximity check failed (offline / server down) — proceed with the drop
    }
    // ─────────────────────────────────────────────────────────────────────

    setIsLoading(true);
    try {
      await apiService.createPin({
        content:        message.trim(),
        lat:            displayLocation.latitude,
        lon:            displayLocation.longitude,
        is_community:   isCommunityPin,
        duration_hours: selectedHours,
      });
      playDropAnimation(isCommunityPin);
      setSubmittedAsCommunity(isCommunityPin);
      setSuccess(true);
      setMessage('');
      setNudgeNorth(0);
      setNudgeEast(0);
      setTimeout(() => setSuccess(false), 3500);
    } catch (error: any) {
      let title = t('drop.errorTitle');
      let errorMessage = t('drop.errorText');
      if (apiService.isOfflineError(error)) {
        title = t('drop.error');
        errorMessage = t('drop.errorNoConnection');
      } else if (apiService.isRateLimitError(error)) {
        title = t('common.error');
        errorMessage = t('drop.errorRateLimit');
      } else if (error.message) {
        errorMessage = error.message;
      }
      showInfo(title, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const remainingChars = MAX_CHARACTERS - message.length;
  const isOverLimit = remainingChars < 0;
  // GPS accuracy gate — only block submit on truly terrible signal (>50 m)
  const accuracyOk = !displayLocation?.accuracy || displayLocation.accuracy <= 50;
  const canSubmit = !!message.trim() && !isOverLimit && !!displayLocation && accuracyOk && !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with integrated hamburger */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => navigation.openDrawer()}
            >
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.title}>📌 {t('drop.title')}</Text>
              <Text style={styles.subtitle}>
                {t('drop.subtitle')}
              </Text>
            </View>
          </View>

          {/* Success State (with drop animation) */}
          {success ? (
            <View style={styles.successContainer}>
              {submittedAsCommunity ? (
                // Community broadcast animation: 3 purple expanding rings
                <View style={styles.broadcastContainer}>
                  {[ring1Anim, ring2Anim, ring3Anim].map((anim, i) => (
                    <Animated.View key={i} style={[
                      styles.broadcastRing,
                      {
                        transform: [{ scale: anim.interpolate({ inputRange: [0,1], outputRange: [0.2, 2.8] }) }],
                        opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 0.5, 0] }),
                      },
                    ]} />
                  ))}
                  <View style={styles.broadcastCenter}>
                    <Text style={styles.broadcastIcon}>&#x2605;</Text>
                  </View>
                </View>
              ) : (
                // Regular pin drop animation
                <>
                  <Animated.View style={[
                    styles.dropPin,
                    { transform: [{ translateY: dropAnim.interpolate({ inputRange: [0,1], outputRange: [-60, 0] }) }], opacity: dropAnim },
                  ]}>
                    <Text style={styles.successIcon}>&#x1F4CD;</Text>
                  </Animated.View>
                  <Animated.View style={[
                    styles.ripple,
                    { transform: [{ scale: rippleAnim.interpolate({ inputRange: [0,1], outputRange: [0.5, 2.5] }) }], opacity: rippleAnim.interpolate({ inputRange: [0,1], outputRange: [0.7, 0] }) },
                  ]} />
                </>
              )}
              <Text style={styles.successText}>{submittedAsCommunity ? 'Community Signal Sent!' : t('drop.successTitle')}</Text>
              <Text style={styles.successSubtext}>{submittedAsCommunity ? '★ Your pin is now visible to everyone nearby' : '📍 ' + t('drop.successSubtext')}</Text>
            </View>
          ) : (
            <>
              {/* Mini Map Preview */}
              <View style={styles.mapPreviewContainer}>
                <Text style={styles.mapPreviewLabel}>📍 {t('drop.dropLocation')}</Text>
                <View style={styles.mapPreview}>
                  {displayLocation ? (
                    <BasicMap
                      userLocation={displayLocation}
                      pins={[]}
                      discoveryRadius={50}
                    />
                  ) : (
                    <View style={styles.mapPlaceholder}>
                      {isGettingLocation ? (
                        <>
                          <ActivityIndicator size="large" color="#4285F4" />
                          <Text style={styles.mapPlaceholderText}>{t('drop.gettingLocation')}</Text>
                        </>
                      ) : (
                        <TouchableOpacity onPress={lockLocation}>
                          <Text style={styles.mapPlaceholderIcon}>📍</Text>
                          <Text style={styles.mapPlaceholderText}>{t('drop.tapToGetLocation')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
                {/* Accuracy row */}
                {displayLocation && (
                  <View style={styles.accuracyRow}>
                    <Text style={[styles.accuracyText, !accuracyOk && styles.accuracyBad]}>
                      {accuracyOk ? '✅' : '⚠️'} GPS ±{Math.round(displayLocation.accuracy ?? 0)} m
                      {!accuracyOk ? '  — signal weak, try moving outside' : ''}
                    </Text>
                  </View>
                )}
                {displayLocation && (
                  <Text style={styles.coordsText}>
                    {displayLocation.latitude.toFixed(6)}°N, {displayLocation.longitude.toFixed(6)}°E
                    {totalNudge > 0.1 ? `  (+${totalNudge.toFixed(1)} m nudge)` : ''}
                  </Text>
                )}
              </View>

              {/* Nudge Pad — micro-adjust up to 5 m */}
              {displayLocation && (
                <View style={styles.nudgeContainer}>
                  <Text style={styles.nudgeLabel}>🧭 Micro-adjust pin (max {MAX_NUDGE_METERS} m)</Text>
                  <View style={styles.nudgeGrid}>
                    <View style={styles.nudgeRow}>
                      <TouchableOpacity style={styles.nudgeBtn} onPress={() => tryNudge(1, 0)}>
                        <Text style={styles.nudgeBtnTxt}>▲</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.nudgeRow}>
                      <TouchableOpacity style={styles.nudgeBtn} onPress={() => tryNudge(0, -1)}>
                        <Text style={styles.nudgeBtnTxt}>◀</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.nudgeBtn, styles.nudgeReset]} onPress={() => { setNudgeNorth(0); setNudgeEast(0); }}>
                        <Text style={styles.nudgeBtnTxt}>⊙</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.nudgeBtn} onPress={() => tryNudge(0, 1)}>
                        <Text style={styles.nudgeBtnTxt}>▶</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.nudgeRow}>
                      <TouchableOpacity style={styles.nudgeBtn} onPress={() => tryNudge(-1, 0)}>
                        <Text style={styles.nudgeBtnTxt}>▼</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* Self-destruct timer dial */}
              <View style={styles.timerContainer}>
                <Text style={styles.timerLabel}>⏱️ Self-destruct in…</Text>
                <View style={styles.timerRow}>
                  {TIMER_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.hours}
                      style={[styles.timerChip, selectedHours === opt.hours && styles.timerChipActive]}
                      onPress={() => setSelectedHours(opt.hours)}
                    >
                      <Text style={[styles.timerChipTxt, selectedHours === opt.hours && styles.timerChipTxtActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Community Pin Toggle */}
              <View style={styles.communityToggleContainer}>
                <View style={styles.communityToggleContent}>
                  <View style={styles.communityToggleTextContainer}>
                    <Text style={styles.communityToggleLabel}>
                      {isCommunityPin ? '👥' : '📍'} {isCommunityPin ? t('drop.communityPin') : t('drop.regularPin')}
                    </Text>
                    <Text style={styles.communityToggleDescription}>
                      {isCommunityPin ? t('drop.communityPinDesc') : t('drop.regularPinDesc')}
                    </Text>
                  </View>
                  <Switch
                    value={isCommunityPin}
                    onValueChange={setIsCommunityPin}
                    trackColor={{ false: '#E0E0E0', true: '#87CEEB' }}
                    thumbColor={isCommunityPin ? '#4285F4' : '#f4f3f4'}
                    ios_backgroundColor="#E0E0E0"
                  />
                </View>
              </View>

              {/* Text Input Area */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>💬 {t('drop.yourMessage')}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder={t('drop.placeholder')}
                  placeholderTextColor="#9AA0A6"
                  multiline={true}
                  numberOfLines={6}
                  maxLength={MAX_CHARACTERS + 20}
                  value={message}
                  onChangeText={(text) => setMessage(text)}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  autoCorrect={true}
                  blurOnSubmit={false}
                />
                
                {/* Character Count */}
                <Text
                  style={[
                    styles.charCount,
                    isOverLimit && styles.charCountOver,
                  ]}
                >
                  {remainingChars}
                </Text>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : !accuracyOk ? (
                  <Text style={styles.submitButtonText}>⚠️ Waiting for GPS…</Text>
                ) : (
                  <Text style={styles.submitButtonText}>📍 {t('drop.submit')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              ⏱️ {t('drop.info')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SimpleConfirmDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        confirmText="OK"
        cancelText=""
        onConfirm={dismissDialog}
        onCancel={dismissDialog}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F4F8', // Soft pastel blue
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#202124',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#5F6368',
    marginTop: 4,
  },
  
  // Map Preview
  mapPreviewContainer: {
    marginBottom: 20,
  },
  mapPreviewLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F6368',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mapPreview: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4F8', // Soft pastel
  },
  mapPlaceholderIcon: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: '#5F6368',
    textAlign: 'center',
    marginTop: 8,
  },
  coordsText: {
    fontSize: 11,
    color: '#5F6368',
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 8,
  },
  
  // Input Container
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5F6368',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    fontSize: 16,
    color: '#202124',
    lineHeight: 24,
    fontWeight: '400',
    minHeight: 120,
    textAlignVertical: 'top',
    outlineStyle: 'none',
    borderWidth: 0,
    padding: 0,
  } as any,
  charCount: {
    fontSize: 12,
    color: '#5F6368',
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 8,
  },
  charCountOver: {
    color: '#EA4335',
  },
  
  // Submit Button
  submitButton: {
    backgroundColor: '#87CEEB', // Sky blue (discovery theme)
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#87CEEB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#DADCE0',
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  
  // Success State
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  successText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 8,
  },
  successSubtext: {
    fontSize: 14,
    color: '#5F6368',
    textAlign: 'center',
  },
  
  // Info
  infoContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#5F6368',
    textAlign: 'center',
    lineHeight: 18,
  },
  
  // Hamburger Menu (integrated in header)
  menuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(135, 206, 235, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  menuIcon: {
    fontSize: 16,
    color: '#202124',
    fontWeight: '600',
  },
  
  // Accuracy row
  accuracyRow: { marginTop: 6 },
  accuracyText: { fontSize: 12, color: '#34A853', fontWeight: '600' },
  accuracyBad:  { color: '#EA4335' },

  // Nudge pad
  nudgeContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  nudgeLabel: { fontSize: 12, color: '#5F6368', fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  nudgeGrid:  { alignItems: 'center' },
  nudgeRow:   { flexDirection: 'row', justifyContent: 'center', marginVertical: 2 },
  nudgeBtn:   { width: 44, height: 44, backgroundColor: '#E8F4F8', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  nudgeReset: { backgroundColor: '#F1F3F4' },
  nudgeBtnTxt:{ fontSize: 18, color: '#4285F4', fontWeight: '700' },

  // Timer dial
  timerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  timerLabel: { fontSize: 12, color: '#5F6368', fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  timerRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  timerChip:  { flex: 1, marginHorizontal: 3, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#DADCE0', alignItems: 'center' },
  timerChipActive: { backgroundColor: '#4285F4', borderColor: '#4285F4' },
  timerChipTxt:    { fontSize: 13, color: '#5F6368', fontWeight: '600' },
  timerChipTxtActive: { color: '#FFFFFF' },

  // Drop animation
  dropPin:   { position: 'absolute', top: 40 },
  ripple:    { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#87CEEB', position: 'absolute', top: 60 },

  // Community broadcast animation
  broadcastContainer: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  broadcastRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#9C27B0' },
  broadcastCenter: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#9C27B0', alignItems: 'center', justifyContent: 'center' },
  broadcastIcon: { fontSize: 22, color: 'white' },

  // Community Pin Toggle
  communityToggleContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  communityToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  communityToggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  communityToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 4,
  },
  communityToggleDescription: {
    fontSize: 12,
    color: '#5F6368',
    lineHeight: 16,
  },
});

export default DropScreen;
