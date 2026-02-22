/**
 * Screen Header Component
 * 
 * Reusable header with hamburger menu button for drawer navigation
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MiyabiColors, MiyabiSpacing, MiyabiStyles, MiyabiShadows } from '../styles/miyabi';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  navigation: any;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle, navigation }) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => navigation.openDrawer()}
      >
        <Text style={styles.menuButtonText}>☰</Text>
      </TouchableOpacity>
      
      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: MiyabiColors.cardBackground,
    paddingTop: MiyabiSpacing.xl + 20,
    paddingBottom: MiyabiSpacing.md,
    paddingHorizontal: MiyabiSpacing.md,
    ...MiyabiShadows.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MiyabiColors.bambooLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: MiyabiSpacing.md,
  },
  menuButtonText: {
    fontSize: 20,
    color: MiyabiColors.bamboo,
    fontWeight: '600',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...MiyabiStyles.heading,
    marginBottom: 4,
  },
  headerSubtitle: {
    ...MiyabiStyles.caption,
    color: MiyabiColors.bamboo,
  },
});

export default ScreenHeader;
