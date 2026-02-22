/**
 * MapLibre Configuration with OpenFreeMap
 * 
 * Using OpenFreeMap tiles (free and open source)
 * Pokemon Go inspired styling with Discovery Theme - Soft Pastels
 */

export const MAP_CONFIG = {
  // OpenFreeMap tile server - Free and open source
  tileServer: 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf',
  
  // Default map settings - Pokemon GO style
  defaultZoom: 18, // Increased for closer view
  maxZoom: 20,
  minZoom: 14,
  
  // Discovery radius in meters (Pokemon Go style)
  discoveryRadius: 50,
  
  // Discovery Theme - Soft Pastel Colors
  colors: {
    // User/Avatar
    userLocation: '#87CEEB', // Sky blue
    userAvatar: '#FFD700', // Gold
    discoveryRadius: '#A5C9E8', // Soft blue
    
    // Mystery Markers
    pinMystery: '#FFB6C1', // Light pink
    pinClose: '#DDA0DD', // Plum
    pinSuperClose: '#FFD700', // Gold
    
    // Map elements
    water: '#B0E0E6', // Powder blue
    grass: '#E8F5E9', // Mint cream
    park: '#D4E7ED', // Light cyan
    
    // UI Overlay
    menuButton: '#FFB6C1', // Light pink
    compass: '#FF6B6B', // Coral red
    
    // Background gradients
    gradientStart: '#E8F4F8', // Soft blue
    gradientMid: '#D4E7ED', // Light cyan
    gradientEnd: '#E0D5F5', // Lavender
  },
};

