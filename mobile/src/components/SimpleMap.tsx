import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface Pin {
  id: string;
  latitude: number;
  longitude: number;
  type: 'text' | 'photo';
  content?: string;
  distance?: number;
}

interface SimpleMapProps {
  userLocation: {
    latitude: number;
    longitude: number;
  } | null;
  pins: Pin[];
  onPinPress?: (pinId: string) => void;
  discoveryRadius?: number;
}

export const SimpleMap: React.FC<SimpleMapProps> = ({
  userLocation,
  pins,
  onPinPress,
  discoveryRadius = 50,
}) => {
  const webViewRef = useRef<WebView>(null);

  // Update map when location or pins change
  useEffect(() => {
    if (userLocation && webViewRef.current) {
      const message = JSON.stringify({
        type: 'updateLocation',
        location: userLocation,
        pins: pins,
        discoveryRadius: discoveryRadius,
      });
      webViewRef.current.postMessage(message);
    }
  }, [userLocation, pins, discoveryRadius]);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Serendipity Map</title>
  <script src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'></script>
  <link href='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css' rel='stylesheet' />
  <style>
    body { margin: 0; padding: 0; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    let map = null;
    let userMarker = null;
    let pinMarkers = [];
    
    // Initialize MapLibre with OpenFreeMap (no API key needed!)
    function initMap(lat, lng) {
      map = new maplibregl.Map({
        container: 'map',
        style: {
          version: 8,
          sources: {
            'openfreemap': {
              type: 'vector',
              tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'],
              maxzoom: 14
            }
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#E8F4F8' }
            },
            {
              id: 'water',
              type: 'fill',
              source: 'openfreemap',
              'source-layer': 'water',
              paint: { 'fill-color': '#B0E0E6' }
            },
            {
              id: 'landuse',
              type: 'fill',
              source: 'openfreemap',
              'source-layer': 'landuse',
              paint: { 'fill-color': '#E8F5E9' }
            },
            {
              id: 'roads',
              type: 'line',
              source: 'openfreemap',
              'source-layer': 'transportation',
              paint: { 'line-color': '#ffffff', 'line-width': 2 }
            }
          ]
        },
        center: [lng, lat],
        zoom: 16,
        pitch: 0,
        bearing: 0
      });
      
      map.on('load', () => {
        console.log('Map loaded successfully');
      });
    }
    
    function updateLocation(data) {
      const { location, pins, discoveryRadius } = data;
      
      if (!map) {
        initMap(location.latitude, location.longitude);
      } else {
        map.flyTo({
          center: [location.longitude, location.latitude],
          zoom: 16,
          essential: true
        });
      }
      
      // Update user marker
      if (userMarker) {
        userMarker.remove();
      }
      
      const userEl = document.createElement('div');
      userEl.style.width = '30px';
      userEl.style.height = '30px';
      userEl.style.borderRadius = '50%';
      userEl.style.backgroundColor = '#4A90E2';
      userEl.style.border = '3px solid white';
      userEl.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
      
      userMarker = new maplibregl.Marker({ element: userEl })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
      
      // Update pin markers
      pinMarkers.forEach(m => m.remove());
      pinMarkers = [];
      
      pins.forEach(pin => {
        const pinEl = document.createElement('div');
        const distance = pin.distance || 0;
        
        if (distance < 10) {
          pinEl.style.backgroundColor = '#FFD700'; // Gold - super close
          pinEl.style.width = '25px';
          pinEl.style.height = '25px';
        } else if (distance < 30) {
          pinEl.style.backgroundColor = '#DDA0DD'; // Plum - close
          pinEl.style.width = '20px';
          pinEl.style.height = '20px';
        } else {
          pinEl.style.backgroundColor = '#FFB6C1'; // Pink - mystery
          pinEl.style.width = '15px';
          pinEl.style.height = '15px';
        }
        
        pinEl.style.borderRadius = '50%';
        pinEl.style.border = '2px solid white';
        pinEl.style.boxShadow = '0 0 8px rgba(0,0,0,0.3)';
        pinEl.style.cursor = 'pointer';
        
        const marker = new maplibregl.Marker({ element: pinEl })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map);
        
        pinEl.addEventListener('click', () => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'pinPress',
            pinId: pin.id
          }));
        });
        
        pinMarkers.push(marker);
      });
    }
    
    // Listen for messages from React Native
    window.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'updateLocation') {
          updateLocation(data);
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    });
    
    // For Android
    document.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'updateLocation') {
          updateLocation(data);
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    });
  </script>
</body>
</html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pinPress' && onPinPress) {
        onPinPress(data.pinId);
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
