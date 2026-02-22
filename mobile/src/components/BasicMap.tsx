import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface Pin {
  id: string;
  latitude: number;
  longitude: number;
  type: 'text' | 'photo';
  content?: string;
  distance?: number;
  isMuted?: boolean;
  is_suppressed?: boolean;
  is_community?: boolean;
}

export interface ExploredCircle {
  lat: number;
  lon: number;
  /** Human-readable place name from LocationIQ reverse geocode (optional) */
  placeName?: string;
}

interface BasicMapProps {
  userLocation: { latitude: number; longitude: number } | null;
  pins: Pin[];
  onPinPress?: (pinId: string) => void;
  onClusterPress?: (pinIds: string[]) => void;
  onMutedPinPress?: (pinId: string) => void;
  discoveryRadius?: number;
  compassHeading?: number;
  exploredCircles?: ExploredCircle[];
  /** When set, the map camera smoothly flies to this location (forward geocode result) */
  flyToLocation?: { lat: number; lon: number; label?: string } | null;
}

const buildHtml = (lat: number, lon: number): string => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; overflow:hidden; }
    #map-wrapper { width:100vw; height:100vh; position:relative; }
    #map { position:absolute; top:0; bottom:0; width:100%; transform-origin:center center; transition: transform 0.25s ease-out; }
    #fog-canvas { position:absolute; top:0; left:0; pointer-events:none; z-index:450; width:100%; height:100%; }
    #cloud-canvas { position:absolute; top:0; left:0; pointer-events:none; z-index:451; width:100%; height:100%; }

    .user-dot { width:20px; height:20px; border-radius:50%; background:#4A90E2; border:4px solid white; }
    .pin-normal { border-radius:50% 50% 50% 0; border:2px solid white; transform:rotate(-45deg); }
    .pin-comm { border-radius:50% 50% 50% 0; border:2px solid white; transform:rotate(-45deg); }
    .pin-muted { background:#999; border-radius:50%; border:2px solid white; opacity:.5; }
    .pin-suppressed { background:#000; border-radius:50%; opacity:.3; }
    .pin-cluster { background:#1a1a2e; color:#fff; border:3px solid rgba(255,255,255,0.9); border-radius:6px; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; transform:rotate(45deg); width:32px; height:32px; }
    .pin-cluster-inner { transform:rotate(-45deg); pointer-events:none; }
    .place-label { color:rgba(255,255,255,0.85); font-size:10px; font-weight:600; white-space:nowrap; text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.7); pointer-events:none; background:rgba(0,0,10,0.45); padding:1px 4px; border-radius:3px; max-width:90px; overflow:hidden; text-overflow:ellipsis; }
  </style>
</head>
<body>
<div id="map-wrapper">
  <div id="map"></div>
  <canvas id="fog-canvas"></canvas>
  <canvas id="cloud-canvas"></canvas>
</div>
<script>
  'use strict';
  var map, userMarker, pinMarkers = [];
  var exploredCircles = [];
  var fogRAF = null;
  // Map is intentionally fixed — only the user marker moves, not the viewport.
  var placeMarkers = []; // Leaflet markers for fog-circle place name labels
  var fogCanvas = document.getElementById('fog-canvas');
  var fogCtx = fogCanvas.getContext('2d');
  var cloudCanvas = document.getElementById('cloud-canvas');
  var cloudCtx = cloudCanvas.getContext('2d');
  var mapWrapper = document.getElementById('map-wrapper');
  var currentPins = [];

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2-lat1)*Math.PI/180;
    var dLon = (lon2-lon1)*Math.PI/180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function metersToPixels(meters, lat) {
    var zoom = map.getZoom();
    var mpp = 156543.03392 * Math.cos(lat*Math.PI/180) / Math.pow(2, zoom);
    return meters / mpp;
  }

  function scheduleFogRedraw() { if (fogRAF) return; fogRAF = requestAnimationFrame(function(){ fogRAF = null; drawFog(); drawHexClouds(currentPins); }); }

  // ── Hexagonal pin-cloud layer ────────────────────────────────────────────
  var HEX_R_M = 150; // hex circumradius in metres (flat-top)
  function _latlonToXY(lat, lon){ return { x: lon*111320*Math.cos(lat*Math.PI/180), y: lat*111320 }; }
  function _xyToLatlon(x, y, refLat){ return { lat: y/111320, lon: x/(111320*Math.cos(refLat*Math.PI/180)) }; }
  function _hexRnd(fq, fr){ var fs=-fq-fr,q=Math.round(fq),r=Math.round(fr),s=Math.round(fs),dq=Math.abs(q-fq),dr=Math.abs(r-fr),ds=Math.abs(s-fs); if(dq>dr&&dq>ds){q=-r-s;}else if(dr>ds){r=-q-s;} return {q:q,r:r}; }
  function _pinToHexCenter(lat, lon){ var xy=_latlonToXY(lat,lon),s=HEX_R_M,q=(2/3*xy.x)/s,r=(-1/3*xy.x+Math.sqrt(3)/3*xy.y)/s,hex=_hexRnd(q,r),cx=s*(3/2*hex.q),cy=s*(Math.sqrt(3)/2*hex.q+Math.sqrt(3)*hex.r); return _xyToLatlon(cx,cy,lat); }

  function drawHexClouds(pins){
    var w=mapWrapper.offsetWidth,h=mapWrapper.offsetHeight;
    cloudCanvas.width=w; cloudCanvas.height=h; cloudCtx.clearRect(0,0,w,h);
    if(!map||!pins||pins.length===0) return;
    var hexMap={};
    pins.forEach(function(pin){
      var ctr=_pinToHexCenter(pin.latitude,pin.longitude);
      var key=Math.round(ctr.lat*8000)+','+Math.round(ctr.lon*8000);
      if(!hexMap[key]) hexMap[key]=ctr;
    });
    var refLat=map.getCenter().lat;
    var hexPx=metersToPixels(HEX_R_M,refLat);
    Object.values(hexMap).forEach(function(center){
      var pt=map.latLngToContainerPoint([center.lat,center.lon]);
      cloudCtx.beginPath();
      for(var i=0;i<6;i++){ var angle=Math.PI/180*(60*i); var vx=pt.x+hexPx*Math.cos(angle),vy=pt.y+hexPx*Math.sin(angle); if(i===0) cloudCtx.moveTo(vx,vy); else cloudCtx.lineTo(vx,vy); }
      cloudCtx.closePath();
      var grad=cloudCtx.createRadialGradient(pt.x,pt.y,hexPx*0.1,pt.x,pt.y,hexPx*1.05);
      grad.addColorStop(0,'rgba(180,210,255,0.55)');
      grad.addColorStop(0.65,'rgba(150,180,240,0.40)');
      grad.addColorStop(1,'rgba(120,150,220,0.05)');
      cloudCtx.fillStyle=grad; cloudCtx.fill();
      cloudCtx.strokeStyle='rgba(110,150,220,0.45)'; cloudCtx.lineWidth=1.5; cloudCtx.stroke();
    });
  }

  function drawFog(){
    var w = mapWrapper.offsetWidth, h = mapWrapper.offsetHeight;
    fogCanvas.width = w; fogCanvas.height = h; fogCtx.clearRect(0,0,w,h);
    fogCtx.fillStyle = 'rgba(80, 90, 110, 0.65)'; fogCtx.fillRect(0,0,w,h);
    if (!exploredCircles || exploredCircles.length===0) return;
    fogCtx.globalCompositeOperation = 'destination-out';
    for (var i=0;i<exploredCircles.length;i++){
      var c = exploredCircles[i];
      var pt = map.latLngToContainerPoint([c.lat, c.lon]);
      var r = metersToPixels(50, c.lat);
      var grad = fogCtx.createRadialGradient(pt.x, pt.y, r*0.45, pt.x, pt.y, r*1.02);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.8,'rgba(0,0,0,0.95)'); grad.addColorStop(1,'rgba(0,0,0,0)');
      fogCtx.beginPath(); fogCtx.arc(pt.x, pt.y, r*1.02, 0, Math.PI*2); fogCtx.fillStyle = grad; fogCtx.fill();
    }
    fogCtx.globalCompositeOperation = 'source-over';
  }

  function applyHeading(h){ document.getElementById('map').style.transform = 'rotate(' + (-h) + 'deg)'; scheduleFogRedraw(); }

  var CLUSTER_THRESHOLD_M = 5;
  function clusterPins(pins){
    var clusters = [], used = new Array(pins.length).fill(false);
    for (var i=0;i<pins.length;i++){
      if (used[i]) continue; var group=[pins[i]]; used[i]=true;
      for (var j=i+1;j<pins.length;j++){ if (used[j]) continue; if (haversine(pins[i].latitude,pins[i].longitude,pins[j].latitude,pins[j].longitude) <= CLUSTER_THRESHOLD_M){ group.push(pins[j]); used[j]=true; } }
      clusters.push(group);
    }
    return clusters;
  }

  function makePinIcon(pin){
    var dist = pin.distance || 9999; var cls;
    if (pin.is_suppressed) cls='pin-suppressed'; else if (pin.isMuted) cls='pin-muted'; else if (pin.is_community) cls='pin-comm ' + (dist<10?'pin-close':dist<30?'pin-medium':'pin-far'); else cls='pin-normal ' + (dist<10?'pin-close':dist<30?'pin-medium':'pin-far');
    var dim = pin.is_suppressed ? 8 : dist<10?18:dist<30?16:14;
    return L.divIcon({ className: cls, iconSize:[dim,dim], iconAnchor: pin.is_suppressed?[4,4]:[dim/2,dim] });
  }

  function renderPins(pins){ pinMarkers.forEach(function(m){ map.removeLayer(m); }); pinMarkers = []; var clusters = clusterPins(pins);
    clusters.forEach(function(group){
      if (group.length===1){ var pin=group[0]; var icon=makePinIcon(pin); var marker=L.marker([pin.latitude,pin.longitude],{icon:icon}).addTo(map); marker.on('click',function(){ if (!window.ReactNativeWebView) return; var type = pin.isMuted ? 'mutedPinPress' : pin.is_suppressed ? 'suppressedPinPress' : 'pinPress'; window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, pinId: pin.id })); }); pinMarkers.push(marker);
      } else { var lat = group.reduce(function(s,p){return s+p.latitude;},0)/group.length; var lon = group.reduce(function(s,p){return s+p.longitude;},0)/group.length; var ids = group.map(function(p){return p.id}); var count = group.length; var clusterIcon = L.divIcon({ className:'', html:'<div class="pin-cluster"><span class="pin-cluster-inner">'+count+'</span></div>', iconSize:[32,32], iconAnchor:[16,16] }); var cm = L.marker([lat,lon],{icon:clusterIcon}).addTo(map); cm.on('click',function(){ if (!window.ReactNativeWebView) return; window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clusterPress', pinIds: ids })); }); pinMarkers.push(cm); }
    });
  }

  function initMap(initLat, initLon){
    map = L.map('map',{ center:[initLat,initLon], zoom:17, zoomControl:false, attributionControl:false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(map);
    var userIcon = L.divIcon({ className:'user-dot', iconSize:[20,20], iconAnchor:[10,10] }); userMarker = L.marker([initLat,initLon],{icon:userIcon}).addTo(map);
    map.on('moveend zoomend viewreset resize', scheduleFogRedraw); scheduleFogRedraw(); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
  }

  function renderPlaceNames(circles){
    placeMarkers.forEach(function(m){ map.removeLayer(m); }); placeMarkers = [];
    circles.forEach(function(c){
      if (!c.placeName) return;
      var icon = L.divIcon({ className:'', html:'<div class="place-label">'+c.placeName+'</div>', iconSize:[90,18], iconAnchor:[45,0] });
      var m = L.marker([c.lat, c.lon], { icon:icon, interactive:false, keyboard:false }).addTo(map);
      placeMarkers.push(m);
    });
  }

  function handleMessage(raw){ try{ var data = JSON.parse(raw); }catch(e){return;} if (data.type === 'updateLocation'){ var loc=data.location; var pins=data.pins||[]; currentPins=pins; var expl=data.exploredCircles||[]; var hdg = (typeof data.compassHeading==='number')?data.compassHeading:0; exploredCircles = expl; if (!map){ initMap(loc.latitude, loc.longitude); return; } userMarker.setLatLng([loc.latitude, loc.longitude]); applyHeading(hdg); renderPins(pins); renderPlaceNames(expl); scheduleFogRedraw(); } else if (data.type==='setHeading'){ applyHeading(data.heading); } else if (data.type==='setExploredCircles'){ exploredCircles = data.circles || []; renderPlaceNames(exploredCircles); scheduleFogRedraw(); } else if (data.type==='flyTo'){ if(map){ map.flyTo([data.lat, data.lon], 17, {animate:true, duration:1.2}); } } }

  window.addEventListener('message', function(e){ handleMessage(e.data); }); document.addEventListener('message', function(e){ handleMessage(e.data); });

  initMap(${lat}, ${lon});
</script>
</body>
</html>`;

export const BasicMap: React.FC<BasicMapProps> = ({ userLocation, pins, onPinPress, onClusterPress, onMutedPinPress, discoveryRadius = 50, compassHeading = 0, exploredCircles = [], flyToLocation }) => {
  const webViewRef = useRef<WebView>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (userLocation && webViewRef.current && mapLoaded) {
      const message = JSON.stringify({ type: 'updateLocation', location: userLocation, pins, compassHeading, exploredCircles });
      try { webViewRef.current.postMessage(message); } catch (e) { /* swallow */ }
    }
  }, [userLocation, pins, mapLoaded, compassHeading, exploredCircles]);

  // Fly map camera to a forward-geocoded location
  useEffect(() => {
    if (flyToLocation && webViewRef.current && mapLoaded) {
      try {
        webViewRef.current.postMessage(
          JSON.stringify({ type: 'flyTo', lat: flyToLocation.lat, lon: flyToLocation.lon })
        );
      } catch (e) { /* swallow */ }
    }
  }, [flyToLocation, mapLoaded]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pinPress' && onPinPress) onPinPress(data.pinId);
      else if (data.type === 'clusterPress' && onClusterPress) onClusterPress(data.pinIds);
      else if (data.type === 'mutedPinPress' && onMutedPinPress) onMutedPinPress(data.pinId);
      else if (data.type === 'mapReady') setMapLoaded(true);
    } catch (e) { console.error('BasicMap message error:', e); }
  };

  if (!userLocation) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.placeholderText}>📍 Getting location...</Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>📍 Map View</Text>
          <Text style={styles.placeholderSubtext}>{userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}</Text>
          <Text style={styles.placeholderSubtext}>{pins.length} pins nearby</Text>
        </View>
      </View>
    );
  }

  const htmlContent = buildHtml(userLocation.latitude, userLocation.longitude);

  return (
    <View style={styles.container}>
      {!mapLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        onLoad={() => setMapLoaded(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d0d1a' },
  placeholderText: { fontSize: 18, color: '#aaa', marginTop: 8 },
  placeholderSubtext: { fontSize: 13, color: '#666', marginTop: 4, textAlign: 'center' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d0d1a', zIndex: 1000 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#aaa' },
});

export default BasicMap;
