/**
 * Miyabi Design System
 * 
 * Japanese-inspired aesthetic for Serendipity SNS
 * "Miyabi" (雅) = elegance, refinement, courtly beauty
 * 
 * Design Philosophy:
 * - Wabi-sabi: Beauty in imperfection and transience
 * - Ma: Negative space and breathing room
 * - Shibui: Subtle, unobtrusive beauty
 */

import { StyleSheet, Platform } from 'react-native';

// ============================================
// COLOR PALETTE
// ============================================

export const MiyabiColors = {
  // Primary - Bamboo green (natural, grounded)
  bamboo: '#769171',
  bambooDark: '#5A6F56',
  bambooLight: '#A3B89E',
  
  // Accent - Mikan orange (warmth, joy, discovery)
  mikan: '#E6B422',
  mikanDark: '#C99A1A',
  mikanLight: '#F5D36F',
  
  // Background - Washi paper (soft, natural texture)
  washi: '#F4F4F0',
  washiDark: '#E8E8E4',
  
  // Text - Soft charcoal (gentle on eyes)
  sumi: '#2D2D2D',         // Primary text
  sumiLight: '#6B6B6B',    // Secondary text
  sumiFaded: '#A8A8A8',    // Disabled/placeholder
  
  // Semantic Colors
  success: '#769171',      // Same as bamboo
  warning: '#E6B422',      // Same as mikan
  error: '#C85250',        // Azuki red (subtle)
  info: '#5A8AAA',         // Indigo blue (calm)
  
  // Rating Colors (for diary)
  ratingGood: '#E6B422',      // Mikan gold
  ratingNormal: '#A3B89E',    // Light bamboo
  ratingBad: '#C85250',       // Azuki red
  
  // UI Elements
  cardBackground: '#FFFFFF',
  divider: '#E0E0DC',
  shadow: 'rgba(45, 45, 45, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.4)',
  
  // Icon colors
  iconActive: '#769171',
  iconInactive: '#A8A8A8',
};

// ============================================
// TYPOGRAPHY
// ============================================

export const MiyabiTypography = {
  // Font Families (fallback to system)
  fontFamily: Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: 'System',
  }),
  
  // Font Sizes (modular scale)
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  
  // Font Weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Line Heights (relaxed for readability)
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// ============================================
// SPACING (8pt grid system)
// ============================================

export const MiyabiSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ============================================
// BORDER RADIUS
// ============================================

export const MiyabiBorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// ============================================
// SHADOWS (subtle elevation)
// ============================================

export const MiyabiShadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  
  sm: {
    shadowColor: MiyabiColors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  
  md: {
    shadowColor: MiyabiColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  
  lg: {
    shadowColor: MiyabiColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

// ============================================
// COMMON STYLES
// ============================================

export const MiyabiStyles = StyleSheet.create({
  // Card styles
  card: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.md,
    ...MiyabiShadows.md,
  },
  
  cardCompact: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    padding: MiyabiSpacing.sm,
    ...MiyabiShadows.sm,
  },
  
  // Text styles
  headingLarge: {
    fontSize: MiyabiTypography.fontSize.xxxl,
    fontWeight: MiyabiTypography.fontWeight.bold,
    color: MiyabiColors.sumi,
    lineHeight: MiyabiTypography.fontSize.xxxl * MiyabiTypography.lineHeight.tight,
  },
  
  heading: {
    fontSize: MiyabiTypography.fontSize.xxl,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: MiyabiColors.sumi,
    lineHeight: MiyabiTypography.fontSize.xxl * MiyabiTypography.lineHeight.tight,
  },
  
  subheading: {
    fontSize: MiyabiTypography.fontSize.lg,
    fontWeight: MiyabiTypography.fontWeight.medium,
    color: MiyabiColors.sumi,
    lineHeight: MiyabiTypography.fontSize.lg * MiyabiTypography.lineHeight.normal,
  },
  
  body: {
    fontSize: MiyabiTypography.fontSize.base,
    fontWeight: MiyabiTypography.fontWeight.regular,
    color: MiyabiColors.sumi,
    lineHeight: MiyabiTypography.fontSize.base * MiyabiTypography.lineHeight.relaxed,
  },
  
  bodySecondary: {
    fontSize: MiyabiTypography.fontSize.base,
    fontWeight: MiyabiTypography.fontWeight.regular,
    color: MiyabiColors.sumiLight,
    lineHeight: MiyabiTypography.fontSize.base * MiyabiTypography.lineHeight.normal,
  },
  
  caption: {
    fontSize: MiyabiTypography.fontSize.sm,
    fontWeight: MiyabiTypography.fontWeight.regular,
    color: MiyabiColors.sumiLight,
    lineHeight: MiyabiTypography.fontSize.sm * MiyabiTypography.lineHeight.normal,
  },
  
  // Button styles
  button: {
    backgroundColor: MiyabiColors.bamboo,
    borderRadius: MiyabiBorderRadius.md,
    paddingVertical: MiyabiSpacing.md,
    paddingHorizontal: MiyabiSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...MiyabiShadows.sm,
  },
  
  buttonText: {
    fontSize: MiyabiTypography.fontSize.base,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: MiyabiColors.bamboo,
    borderRadius: MiyabiBorderRadius.md,
    paddingVertical: MiyabiSpacing.md,
    paddingHorizontal: MiyabiSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  buttonSecondaryText: {
    fontSize: MiyabiTypography.fontSize.base,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: MiyabiColors.bamboo,
  },
  
  // Input styles
  input: {
    backgroundColor: MiyabiColors.cardBackground,
    borderRadius: MiyabiBorderRadius.md,
    borderWidth: 1,
    borderColor: MiyabiColors.divider,
    padding: MiyabiSpacing.md,
    fontSize: MiyabiTypography.fontSize.base,
    color: MiyabiColors.sumi,
  },
  
  inputFocused: {
    borderColor: MiyabiColors.bamboo,
    borderWidth: 1.5,
  },
  
  // Container styles
  container: {
    flex: 1,
    backgroundColor: MiyabiColors.washi,
  },
  
  contentContainer: {
    padding: MiyabiSpacing.md,
  },
  
  // Divider
  divider: {
    height: 1,
    backgroundColor: MiyabiColors.divider,
    marginVertical: MiyabiSpacing.md,
  },
  
  // Badge styles
  badge: {
    backgroundColor: MiyabiColors.mikan,
    borderRadius: MiyabiBorderRadius.full,
    paddingHorizontal: MiyabiSpacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  
  badgeText: {
    fontSize: MiyabiTypography.fontSize.xs,
    fontWeight: MiyabiTypography.fontWeight.semibold,
    color: '#FFFFFF',
  },
});

// ============================================
// ICON COMPONENTS (Unicode emoji alternatives)
// ============================================

export const MiyabiIcons = {
  // Food/Discover
  mikan: '🍊',
  food: '🍱',
  ramen: '🍜',
  
  // History/Culture
  lantern: '🏮',
  shrine: '⛩️',
  sakura: '🌸',
  
  // Actions
  plus: '＋',
  check: '✓',
  star: '✦',
  heart: '♡',
  
  // Ratings
  good: '◎',      // Perfect circle
  normal: '○',    // Open circle
  bad: '△',       // Triangle
  
  // Navigation
  back: '←',
  forward: '→',
  up: '↑',
  down: '↓',
  
  // Timeline
  dot: '●',
  circle: '○',
  line: '┃',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get rating color based on rating value
 */
export function getRatingColor(rating: 'Good' | 'Normal' | 'Bad'): string {
  switch (rating) {
    case 'Good':
      return MiyabiColors.ratingGood;
    case 'Normal':
      return MiyabiColors.ratingNormal;
    case 'Bad':
      return MiyabiColors.ratingBad;
    default:
      return MiyabiColors.sumiLight;
  }
}

/**
 * Get rating icon based on rating value
 */
export function getRatingIcon(rating: 'Good' | 'Normal' | 'Bad'): string {
  switch (rating) {
    case 'Good':
      return MiyabiIcons.good;
    case 'Normal':
      return MiyabiIcons.normal;
    case 'Bad':
      return MiyabiIcons.bad;
    default:
      return MiyabiIcons.circle;
  }
}

/**
 * Format date in Japanese style (YYYY年MM月DD日)
 */
export function formatJapaneseDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

/**
 * Format time in 24-hour format
 */
export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
