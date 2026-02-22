/**
 * App Logo Component
 * Japanese aesthetic: Torii gate symbolizing discovery and community connections
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MiyabiColors, MiyabiShadows } from '../styles/miyabi';

interface AppLogoProps {
  size?: 'small' | 'medium' | 'large';
}

export const AppLogo: React.FC<AppLogoProps> = ({ size = 'medium' }) => {
  const sizes = {
    small: {
      container: 70,
      iconSize: 36,
      text: 13,
      gate: 28,
    },
    medium: {
      container: 100,
      iconSize: 48,
      text: 16,
      gate: 38,
    },
    large: {
      container: 140,
      iconSize: 72,
      text: 20,
      gate: 56,
    },
  };

  const currentSize = sizes[size];

  return (
    <View style={[styles.container, { width: currentSize.container, height: currentSize.container }]}>
      <View style={[styles.toriiGate, { width: currentSize.gate, height: currentSize.gate * 0.9 }]}>
        {/* Torii gate top bar */}
        <View style={[styles.toriiTop, { height: currentSize.gate * 0.15 }]} />
        {/* Torii gate middle bar */}
        <View style={[styles.toriiMiddle, { height: currentSize.gate * 0.1, marginTop: currentSize.gate * 0.15 }]} />
        {/* Torii pillars */}
        <View style={styles.toriiPillars}>
          <View style={[styles.toriiPillar, { width: currentSize.gate * 0.12 }]} />
          <View style={[styles.toriiPillar, { width: currentSize.gate * 0.12 }]} />
        </View>
        {/* Sakura accent */}
        <Text style={[styles.sakura, { fontSize: currentSize.gate * 0.3 }]}>🌸</Text>
      </View>
      <Text style={[styles.text, { fontSize: currentSize.text, marginTop: 8 }]}>Serendipity</Text>
      <Text style={[styles.subtext, { fontSize: currentSize.text * 0.75 }]}>セレンディピティ</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toriiGate: {
    position: 'relative',
    alignItems: 'center',
  },
  toriiTop: {
    width: '110%',
    backgroundColor: MiyabiColors.mikan,
    borderRadius: 4,
    ...MiyabiShadows.sm,
  },
  toriiMiddle: {
    width: '100%',
    backgroundColor: MiyabiColors.mikan,
    borderRadius: 3,
  },
  toriiPillars: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: '15%',
  },
  toriiPillar: {
    height: '100%',
    backgroundColor: MiyabiColors.mikan,
    borderRadius: 2,
  },
  sakura: {
    position: 'absolute',
    bottom: -10,
    right: -5,
  },
  text: {
    fontWeight: '700',
    color: MiyabiColors.sumi,
    letterSpacing: 0.5,
  },
  subtext: {
    color: MiyabiColors.sumiLight,
    marginTop: 2,
  },
});
