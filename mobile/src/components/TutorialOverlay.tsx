/**
 * TutorialOverlay – Ghost Guide New User Onboarding
 *
 * A spotlight/coachmark tutorial with 3 steps:
 *   1. Map centre – "This is your fog-shrouded map"
 *   2. Drop Pin FAB – "Tap here to leave a message"
 *   3. Hamburger menu – "Open the menu for Diary, Community & Settings"
 *
 * Persists `hasCompletedTutorial: true` to AsyncStorage after completion.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import Svg, { Rect, Circle, Defs, Mask } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { MiyabiColors, MiyabiShadows } from '../styles/miyabi';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const TUTORIAL_KEY = 'serendipity_tutorial_completed';

// ── Step definitions ─────────────────────────────────────────────────────────
interface Step {
  key: string;
  titleKey: string;
  descKey: string;
  icon: string;
  cx: number;         // spotlight centre X
  cy: number;         // spotlight centre Y
  r: number;          // spotlight radius
  tooltipY: 'above' | 'below' | 'center';
}

const STEPS: Step[] = [
  {
    key: 'map',
    titleKey: 'tutorial.mapTitle',
    descKey: 'tutorial.mapDesc',
    icon: '🗺️',
    cx: SCREEN_W / 2,
    cy: SCREEN_H * 0.45,
    r: 70,
    tooltipY: 'below',
  },
  {
    key: 'drop',
    titleKey: 'tutorial.dropTitle',
    descKey: 'tutorial.dropDesc',
    icon: '📍',
    cx: SCREEN_W / 2,
    cy: SCREEN_H - 54,
    r: 34,
    tooltipY: 'above',
  },
  {
    key: 'menu',
    titleKey: 'tutorial.menuTitle',
    descKey: 'tutorial.menuDesc',
    icon: '☰',
    cx: 33,
    cy: Platform.OS === 'ios' ? 94 : 67,
    r: 26,
    tooltipY: 'below',
  },
];

// ── Exported component ───────────────────────────────────────────────────────
interface TutorialOverlayProps {
  /** Called after the user finishes or skips the tutorial */
  onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // Fade-in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  // Pulse ring animation for spotlight
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [stepIndex]);

  const finish = async () => {
    await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => onComplete());
  };

  const handleNext = () => {
    if (isLast) {
      finish();
    } else {
      setStepIndex(stepIndex + 1);
    }
  };

  const handleSkip = () => {
    finish();
  };

  // Tooltip vertical position
  const tooltipTop =
    step.tooltipY === 'above'
      ? step.cy - step.r - 180
      : step.tooltipY === 'below'
      ? step.cy + step.r + 24
      : SCREEN_H * 0.35;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="box-none">
      {/* SVG dim layer with spotlight hole */}
      <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="spotlight-mask" maskUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="white" />
            <Circle cx={step.cx} cy={step.cy} r={step.r} fill="black" />
          </Mask>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={SCREEN_W}
          height={SCREEN_H}
          fill="rgba(0,0,0,0.78)"
          mask="url(#spotlight-mask)"
        />
      </Svg>

      {/* Pulsing ring around spotlight */}
      <Animated.View
        style={[
          styles.spotlightRing,
          {
            left: step.cx - step.r - 3,
            top: step.cy - step.r - 3,
            width: (step.r + 3) * 2,
            height: (step.r + 3) * 2,
            borderRadius: step.r + 3,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />

      {/* Tooltip card */}
      <View style={[styles.tooltipCard, { top: tooltipTop }]}>
        <Text style={styles.tooltipIcon}>{step.icon}</Text>
        <Text style={styles.tooltipTitle}>{t(step.titleKey)}</Text>
        <Text style={styles.tooltipDesc}>{t(step.descKey)}</Text>

        {/* Step indicator dots */}
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === stepIndex && styles.dotActive]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>{t('tutorial.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNext} style={styles.nextBtn} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>
              {isLast ? t('tutorial.done') : t('tutorial.next')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

// ── Hook: check if tutorial should show ──────────────────────────────────────
export function useShouldShowTutorial(): [boolean, () => void] {
  const [show, setShow] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_KEY).then((val) => {
      if (val !== 'true') setShow(true);
    });
  }, []);

  const dismiss = () => setShow(false);

  return [show, dismiss];
}

export { TUTORIAL_KEY };
export default TutorialOverlay;

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
  },
  spotlightRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,183,192,0.6)',
  },
  tooltipCard: {
    position: 'absolute',
    left: 28,
    right: 28,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    ...MiyabiShadows.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,183,192,0.15)',
  },
  tooltipIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  tooltipDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: '#FFB7C0',
    width: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: MiyabiColors.bamboo,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
