/**
 * App Navigator - Drawer Navigation
 * 
 * Five main screens with hamburger menu:
 * - Radar (Home) - Discover nearby messages
 * - Drop (Create) - Leave a message
 * - Community - Broadcast channel (admin can post)
 * - Diary - Personal discovery timeline
 * - Settings - Language and preferences
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';

import RadarScreen from '../screens/RadarScreen';
import DropScreen from '../screens/DropScreen';
import CommunityScreen from '../screens/CommunityScreen';
import DiaryScreen from '../screens/DiaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { AppLogo } from '../components/AppLogo';
import { MiyabiColors, MiyabiSpacing, MiyabiBorderRadius, MiyabiShadows } from '../styles/miyabi';
import { useTranslation } from 'react-i18next';

const Drawer = createDrawerNavigator();

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

const AppNavigator: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <NavigationContainer>
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
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
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
