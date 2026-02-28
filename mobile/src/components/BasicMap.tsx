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
  /** Increment this token to smoothly animate map rotation back to 0° */
  resetRotationToken?: number;
  /** Called when the user pans the camera — provides new center lat/lon */
  onRegionChange?: (center: { lat: number; lon: number }) => void;
}

const buildHtml = (lat: number, lon: number): string => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
    /* html/body/outer-container all share the OSM land-tile colour.
       If any pixel is ever exposed during rotation it looks like a map tile, never black. */
    html, body { margin:0; padding:0; overflow:hidden; width:100%; height:100%; background:#e8e0d4; }
    /* outer-container = the fixed full-screen viewport window — never moves, clips everything */
    #outer-container { position:fixed; top:0; left:0; width:100vw; height:100vh; overflow:hidden; background:#e8e0d4; }
    /* map-wrapper is 260% of the viewport, centred via -80% offset.
       Maths: the inscribed circle of 260%×260% wrapper has radius 1.3×min(vw,vh).
       Viewport circumradius √((vw/2)²+(vh/2)²) ≈ 1.19×vw on a 375×812 phone (≈447px).
       1.3×187.5 = 487.5 > 447 → every viewport corner is always covered at ANY rotation angle.
       transform-origin:50% 50% pivots the rotation around the visual screen centre. */
    #map-wrapper { position:absolute; top:-80%; left:-80%; width:260%; height:260%; transform-origin:50% 50%; background:#e8e0d4; }
    #map { position:absolute; top:0; bottom:0; width:100%; height:100%; z-index:1; }
    #fog-canvas { display:none; }
    #cloud-canvas { position:absolute; top:0; left:0; pointer-events:none; z-index:4; width:100%; height:100%; filter:blur(6px); }

    .user-avatar-wrapper { width:60px; height:60px; transition:transform 0.15s ease-out; }
    .user-avatar-wrapper svg { width:60px; height:60px; display:block; }
    .pin-cluster { background:#1a1a2e; color:#fff; border:3px solid rgba(255,255,255,0.9); border-radius:6px; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; transform:rotate(45deg); width:32px; height:32px; }
    .pin-cluster-inner { transform:rotate(-45deg); pointer-events:none; }
    .place-label { color:rgba(255,255,255,0.85); font-size:10px; font-weight:600; white-space:nowrap; text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.7); pointer-events:none; background:transparent; padding:1px 4px; border-radius:3px; max-width:90px; overflow:hidden; text-overflow:ellipsis; }
    /* Suppress Leaflet default tooltip/popup chrome */
    .leaflet-tooltip, .leaflet-popup, .leaflet-popup-content-wrapper, .leaflet-popup-tip { display:none !important; }
    /* Kill Leaflet default marker background/border (prevents dark-box callout) */
    .leaflet-marker-icon, .leaflet-div-icon { background:none !important; border:none !important; box-shadow:none !important; }
  </style>
</head>
<body>
<div id="outer-container" oncontextmenu="return false;">
<div id="map-wrapper">
  <div id="map"></div>
  <canvas id="fog-canvas"></canvas>
  <canvas id="cloud-canvas"></canvas>
</div>
</div>
<script>
  'use strict';
  var map, userMarker, pinMarkers = [];
  var exploredCircles = [];
  var fogRAF = null;
  // Map is intentionally fixed — only the user marker moves, not the viewport.
  var placeMarkers = []; // Leaflet markers for fog-circle place name labels
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

  function scheduleFogRedraw() { if (fogRAF) return; fogRAF = requestAnimationFrame(function(){ fogRAF = null; drawPinFog(currentPins); }); }

  // ── Hexagonal pin-cloud layer ────────────────────────────────────────────
  var HEX_R_M = 150; // hex circumradius in metres (flat-top)
  function _latlonToXY(lat, lon){ return { x: lon*111320*Math.cos(lat*Math.PI/180), y: lat*111320 }; }
  function _xyToLatlon(x, y, refLat){ return { lat: y/111320, lon: x/(111320*Math.cos(refLat*Math.PI/180)) }; }
  function _hexRnd(fq, fr){ var fs=-fq-fr,q=Math.round(fq),r=Math.round(fr),s=Math.round(fs),dq=Math.abs(q-fq),dr=Math.abs(r-fr),ds=Math.abs(s-fs); if(dq>dr&&dq>ds){q=-r-s;}else if(dr>ds){r=-q-s;} return {q:q,r:r}; }
  function _pinToHexCenter(lat, lon){ var xy=_latlonToXY(lat,lon),s=HEX_R_M,q=(2/3*xy.x)/s,r=(-1/3*xy.x+Math.sqrt(3)/3*xy.y)/s,hex=_hexRnd(q,r),cx=s*(3/2*hex.q),cy=s*(Math.sqrt(3)/2*hex.q+Math.sqrt(3)*hex.r); return _xyToLatlon(cx,cy,lat); }

  // ── Pin-Anchored Fog ─────────────────────────────────────────────────────
  // Single unified fog renderer on cloud-canvas. NO global fog layer.
  // Each standard pin (non-community) gets a 150m fog patch.
  // The user's 50m flashlight + explored circles are subtracted in one pass.

  // ── Procedural white-grey cloud texture (generated once, cached) ───────
  var _cloudTexCanvas=null;
  function _getCloudPattern(ctx){
    if(!_cloudTexCanvas){
      var S=256; _cloudTexCanvas=document.createElement('canvas'); _cloudTexCanvas.width=S; _cloudTexCanvas.height=S;
      var tc=_cloudTexCanvas.getContext('2d'); var img=tc.createImageData(S,S); var d=img.data;
      var seed=37; function rnd(){seed=(seed*16807)%2147483647;return seed/2147483647;}
      // Tileable value-noise with 3 octaves for organic cloud look
      var G=8,grid=[]; for(var gi=0;gi<G;gi++){grid[gi]=[]; for(var gj=0;gj<G;gj++) grid[gi][gj]=rnd();}
      function smoothstep(t){return t*t*(3-2*t);}
      function noise(x,y){ var gx=((x%1)+1)%1*G,gy=((y%1)+1)%1*G; var ix=Math.floor(gx)%G,iy=Math.floor(gy)%G;
        var fx=smoothstep(gx-Math.floor(gx)),fy=smoothstep(gy-Math.floor(gy));
        var a=grid[ix][iy],b=grid[(ix+1)%G][iy],c=grid[ix][(iy+1)%G],dd=grid[(ix+1)%G][(iy+1)%G];
        return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+dd*fx*fy; }
      for(var py=0;py<S;py++){for(var px=0;px<S;px++){
        var nx=px/S,ny=py/S;
        var v=noise(nx,ny)*0.50+noise(nx*2.3,ny*2.3)*0.30+noise(nx*5.1,ny*5.1)*0.20;
        // White-grey cloud tones: RGB 210-250, alpha 0.45-0.85
        var lum=Math.floor(210+v*40);            // 210..250 — bright white/grey
        var alpha=Math.floor((0.45+v*0.40)*255); // 115..217 — organic density variation
        var idx=(py*S+px)*4; d[idx]=lum; d[idx+1]=lum; d[idx+2]=Math.min(255,lum+8); d[idx+3]=alpha;
      }}
      tc.putImageData(img,0,0);
    }
    return ctx.createPattern(_cloudTexCanvas,'repeat');
  }

  function drawPinFog(pins){
    var w=mapWrapper.offsetWidth,h=mapWrapper.offsetHeight;
    cloudCanvas.width=w; cloudCanvas.height=h; cloudCtx.clearRect(0,0,w,h);
    if(!map) return;
    // Collect only standard (non-community) pins
    var fogPins=[];
    if(pins&&pins.length>0){
      for(var i=0;i<pins.length;i++){ if(!pins[i].is_community) fogPins.push(pins[i]); }
    }
    if(fogPins.length===0) return;
    // ── Step 1: Build unified fog mask on offscreen canvas ──
    // White = fog, transparent = clear.
    // 'lighter' composite merges overlapping pin circles to max-alpha
    // instead of additively darkening (prevents Venn-diagram seams).
    var mask=document.createElement('canvas'); mask.width=w; mask.height=h;
    var mc=mask.getContext('2d');
    mc.globalCompositeOperation='lighter';
    for(var i=0;i<fogPins.length;i++){
      var pin=fogPins[i];
      var pt=map.latLngToContainerPoint([pin.latitude,pin.longitude]);
      var pxR=metersToPixels(150,pin.latitude);
      var grad=mc.createRadialGradient(pt.x,pt.y,pxR*0.05,pt.x,pt.y,pxR);
      grad.addColorStop(0,'rgba(255,255,255,1)');
      grad.addColorStop(0.35,'rgba(255,255,255,0.90)');
      grad.addColorStop(0.55,'rgba(255,255,255,0.55)');
      grad.addColorStop(0.75,'rgba(255,255,255,0.25)');
      grad.addColorStop(0.90,'rgba(255,255,255,0.08)');
      grad.addColorStop(1,'rgba(255,255,255,0)');
      mc.beginPath(); mc.arc(pt.x,pt.y,pxR,0,Math.PI*2); mc.fillStyle=grad; mc.fill();
    }
    // ── Step 2: Subtract user's 50m flashlight (hard-edged, no crescent) ──
    mc.globalCompositeOperation='destination-out';
    var upt=map.latLngToContainerPoint([userLat,userLon]);
    var ur=metersToPixels(50,userLat);
    var ug=mc.createRadialGradient(upt.x,upt.y,0,upt.x,upt.y,ur*1.1);
    ug.addColorStop(0,'rgba(0,0,0,1)');
    ug.addColorStop(0.75,'rgba(0,0,0,1)');
    ug.addColorStop(1,'rgba(0,0,0,0)');
    mc.beginPath(); mc.arc(upt.x,upt.y,ur*1.1,0,Math.PI*2); mc.fillStyle=ug; mc.fill();
    // ── Step 3: Subtract explored circles ──
    if(exploredCircles&&exploredCircles.length>0){
      for(var ci=0;ci<exploredCircles.length;ci++){
        var ec=exploredCircles[ci];
        var ept=map.latLngToContainerPoint([ec.lat,ec.lon]);
        var er=metersToPixels(50,ec.lat);
        var eg=mc.createRadialGradient(ept.x,ept.y,0,ept.x,ept.y,er);
        eg.addColorStop(0,'rgba(0,0,0,1)'); eg.addColorStop(0.85,'rgba(0,0,0,1)'); eg.addColorStop(1,'rgba(0,0,0,0)');
        mc.beginPath(); mc.arc(ept.x,ept.y,er,0,Math.PI*2); mc.fillStyle=eg; mc.fill();
      }
    }
    mc.globalCompositeOperation='source-over';
    // ── Step 4: Paint cloud texture, clip through mask ──
    // Procedural white-grey cloud pattern replaces flat colour fill.
    // Slow drift offset makes the fog feel alive without extra RAF loops.
    var cloudPat=_getCloudPattern(cloudCtx);
    var driftT=Date.now()*0.00008;
    cloudCtx.save();
    cloudCtx.translate(Math.sin(driftT*0.7)*20,Math.cos(driftT)*16);
    cloudCtx.fillStyle=cloudPat||'rgba(230,230,235,0.55)';
    cloudCtx.fillRect(-30,-30,w+60,h+60);
    cloudCtx.restore();
    cloudCtx.globalCompositeOperation='destination-in';
    cloudCtx.drawImage(mask,0,0);
    cloudCtx.globalCompositeOperation='source-over';
  }

  var userLat=0, userLon=0;
  // ── Smooth heading interpolation (low-pass lerp like Google Maps) ─────────
  var _headingCur=0, _headingTarget=0, _headingInited=false, _headingRAF=null;
  function _shortAngleDist(from,to){ var d=(to-from)%360; if(d>180) d-=360; if(d<-180) d+=360; return d; }
  function _lerpHeading(){
    var diff=_shortAngleDist(_headingCur,_headingTarget);
    if(Math.abs(diff)<0.5){ _headingCur=_headingTarget; _headingRAF=null; }
    else { _headingCur=(_headingCur+diff*0.06)%360; if(_headingCur<0) _headingCur+=360; _headingRAF=requestAnimationFrame(_lerpHeading); }
    var el=document.getElementById('user-avatar'); if(el) el.style.transform='rotate('+_headingCur+'deg)';
  }
  function applyHeading(h){
    _headingTarget=h;
    if(!_headingInited){ _headingCur=h; _headingInited=true; var el=document.getElementById('user-avatar'); if(el) el.style.transform='rotate('+h+'deg)'; return; }
    if(!_headingRAF) _headingRAF=requestAnimationFrame(_lerpHeading);
  }

  // ── Smooth avatar position lerp (like Google Maps) ─────────────────────────
  var _targetLat=0, _targetLon=0, _curLat=0, _curLon=0, _avatarRAF=null, _avatarInited=false;
  function _lerp(a,b,t){ return a+(b-a)*t; }
  function _animAvatar(){
    var SPEED=0.10; // lower = smoother/slower, 0.10 ≈ Google Maps feel
    _curLat=_lerp(_curLat,_targetLat,SPEED);
    _curLon=_lerp(_curLon,_targetLon,SPEED);
    userMarker.setLatLng([_curLat,_curLon]);
    var done=Math.abs(_targetLat-_curLat)<0.0000005 && Math.abs(_targetLon-_curLon)<0.0000005;
    if(done){ _avatarRAF=null; userMarker.setLatLng([_targetLat,_targetLon]); }
    else { _avatarRAF=requestAnimationFrame(_animAvatar); }
  }
  function updateAvatarTo(lat,lon){
    _targetLat=lat; _targetLon=lon;
    if(!_avatarInited){ _curLat=lat; _curLon=lon; _avatarInited=true; userMarker.setLatLng([lat,lon]); return; }
    if(!_avatarRAF) _avatarRAF=requestAnimationFrame(_animAvatar);
  }

  var CLUSTER_THRESHOLD_M = 3; // pins within 3 m of each other merge into one combined icon
  function clusterPins(pins){
    var clusters = [], used = new Array(pins.length).fill(false);
    for (var i=0;i<pins.length;i++){
      if (used[i]) continue; var group=[pins[i]]; used[i]=true;
      for (var j=i+1;j<pins.length;j++){ if (used[j]) continue; if (haversine(pins[i].latitude,pins[i].longitude,pins[j].latitude,pins[j].longitude) <= CLUSTER_THRESHOLD_M){ group.push(pins[j]); used[j]=true; } }
      clusters.push(group);
    }
    return clusters;
  }

  var _lastPinTapMs=0;
  function pinTap(id,type){ var now=Date.now(); if(now-_lastPinTapMs<350)return; _lastPinTapMs=now; if(!window.ReactNativeWebView)return; window.ReactNativeWebView.postMessage(JSON.stringify({type:type,pinId:id})); }
  function clusterTap(idsStr){ var now=Date.now(); if(now-_lastPinTapMs<350)return; _lastPinTapMs=now; if(!window.ReactNativeWebView)return; var ids=String(idsStr).split(',').map(Number); window.ReactNativeWebView.postMessage(JSON.stringify({type:'clusterPress',pinIds:ids})); }

  function makePinIcon(pin){
    // Every pin gets a min 44x44 px transparent touch wrapper (mobile HIG standard)
    // onclick uses data-pid/data-ptype so no quote-escaping issues inside the template literal
    var TAP=44;
    if(pin.is_suppressed){
      var s='<div data-pid="'+pin.id+'" data-ptype="suppressedPinPress" onclick="pinTap(this.dataset.pid,this.dataset.ptype)" style="width:'+TAP+'px;height:'+TAP+'px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><div style="width:8px;height:8px;border-radius:50%;background:rgba(0,0,0,0.35);"></div></div>';
      return L.divIcon({className:'leaflet-interactive',html:s,iconSize:[TAP,TAP],iconAnchor:[TAP/2,TAP/2]});
    }
    if(pin.isMuted){
      var s='<div data-pid="'+pin.id+'" data-ptype="mutedPinPress" onclick="pinTap(this.dataset.pid,this.dataset.ptype)" style="width:'+TAP+'px;height:'+TAP+'px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><div style="width:12px;height:12px;border-radius:50%;background:#aaa;border:1.5px solid rgba(255,255,255,0.6);opacity:0.5;"></div></div>';
      return L.divIcon({className:'leaflet-interactive',html:s,iconSize:[TAP,TAP],iconAnchor:[TAP/2,TAP/2]});
    }
    var dist=pin.distance||9999;
    // Visual size only — tap target stays 44px regardless
    var dim=dist<10?20:dist<30?17:14;
    if(pin.is_community){
      // Star circle icon — purple theme
      var c=dist<10?'#E040FB':'#9C27B0';
      var svg='<svg width="'+dim+'" height="'+dim+'" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.6));">'
        +'<circle cx="12" cy="12" r="10" fill="'+c+'" stroke="white" stroke-width="2.5"/>'
        +'<text x="12" y="16" text-anchor="middle" font-size="13" fill="white" font-weight="bold">&#x2605;</text>'
        +'</svg>';
      var wrap='<div data-pid="'+pin.id+'" data-ptype="pinPress" onclick="pinTap(this.dataset.pid,this.dataset.ptype)" style="width:'+TAP+'px;height:'+TAP+'px;display:flex;align-items:center;justify-content:center;cursor:pointer;">'+svg+'</div>';
      return L.divIcon({className:'leaflet-interactive',html:wrap,iconSize:[TAP,TAP],iconAnchor:[TAP/2,TAP/2]});
    } else {
      // Teardrop pin — red (nearby) or blue (far)
      var c=dist<10?'#F44336':'#1976D2';
      var pw=dim; var ph=Math.round(dim*1.5);
      var svg='<svg width="'+pw+'" height="'+ph+'" viewBox="0 0 20 30" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">'
        +'<path d="M10 1 C5.3 1 1.5 4.8 1.5 9.5 C1.5 16.5 10 29 10 29 C10 29 18.5 16.5 18.5 9.5 C18.5 4.8 14.7 1 10 1 Z" fill="'+c+'" stroke="white" stroke-width="2"/>'
        +'<circle cx="10" cy="9.5" r="4" fill="white"/>'
        +'</svg>';
      var wW=Math.max(TAP,pw+12); var wH=Math.max(TAP,ph+10);
      var wrap='<div data-pid="'+pin.id+'" data-ptype="pinPress" onclick="pinTap(this.dataset.pid,this.dataset.ptype)" style="width:'+wW+'px;height:'+wH+'px;display:flex;align-items:flex-end;justify-content:center;cursor:pointer;">'+svg+'</div>';
      return L.divIcon({className:'leaflet-interactive',html:wrap,iconSize:[wW,wH],iconAnchor:[wW/2,wH]});
    }
  }

  function renderPins(pins){ pinMarkers.forEach(function(m){ map.removeLayer(m); }); pinMarkers = [];
    // Pin visibility rules:
    // Community pins → ALWAYS visible (bypass fog)
    // Standard pins  → visible only when user is within 50m
    var showPins=pins.filter(function(p){
      if(p.is_community) return true;
      return haversine(userLat,userLon,p.latitude,p.longitude)<=50;
    });
    var clusters = clusterPins(showPins);
    clusters.forEach(function(group){
      if (group.length===1){ var pin=group[0]; var icon=makePinIcon(pin); var marker=L.marker([pin.latitude,pin.longitude],{icon:icon}).addTo(map); marker.on('click',function(e){ L.DomEvent.stopPropagation(e); var type=pin.isMuted?'mutedPinPress':pin.is_suppressed?'suppressedPinPress':'pinPress'; pinTap(pin.id,type); }); pinMarkers.push(marker);
      } else { var lat = group.reduce(function(s,p){return s+p.latitude;},0)/group.length; var lon = group.reduce(function(s,p){return s+p.longitude;},0)/group.length; var ids = group.map(function(p){return p.id}); var count = group.length; var idsStr=ids.join(','); var clusterIcon = L.divIcon({ className:'leaflet-interactive', html:'<div data-cids="'+idsStr+'" onclick="clusterTap(this.dataset.cids)" class="pin-cluster"><span class="pin-cluster-inner">'+count+'</span></div>', iconSize:[40,40], iconAnchor:[20,20] }); var cm = L.marker([lat,lon],{icon:clusterIcon}).addTo(map); cm.on('click',function(e){ L.DomEvent.stopPropagation(e); clusterTap(idsStr); }); pinMarkers.push(cm); }
    });
  }

  function initMap(initLat, initLon){
    map = L.map('map',{ center:[initLat,initLon], zoom:17, zoomControl:false, attributionControl:false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(map);
    var avatarHtml = '<div id="user-avatar" class="user-avatar-wrapper"><svg viewBox="0 0 60 60"><defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M30 4 L40 22 L30 18 L20 22 Z" fill="rgba(74,144,226,0.35)" stroke="rgba(74,144,226,0.55)" stroke-width="0.8"/><circle cx="30" cy="30" r="8" fill="#4A90E2" stroke="white" stroke-width="3" filter="url(#glow)"/></svg></div>';
    var userIcon = L.divIcon({ className:'', html:avatarHtml, iconSize:[60,60], iconAnchor:[30,30] }); userMarker = L.marker([initLat,initLon],{icon:userIcon,zIndexOffset:1000}).addTo(map);
    map.on('moveend zoomend viewreset resize', scheduleFogRedraw);
    // Debounced region-change message — lets React side fetch pins for the visible area
    var _regionDebounce = null;
    map.on('moveend', function() {
      if (_regionDebounce) clearTimeout(_regionDebounce);
      _regionDebounce = setTimeout(function() {
        var c = map.getCenter();
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type:'regionChange', lat:c.lat, lon:c.lng }));
      }, 600);
    });
    scheduleFogRedraw(); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
  }

  function renderPlaceNames(circles){
    placeMarkers.forEach(function(m){ map.removeLayer(m); }); placeMarkers = [];
    if(!circles || circles.length===0) return;
    // Deduplicate: one label per 150m hex cell
    var hexLabels={};
    circles.forEach(function(c){
      if(!c.placeName) return;
      var ctr=_pinToHexCenter(c.lat,c.lon);
      var key=Math.round(ctr.lat*8000)+','+Math.round(ctr.lon*8000);
      if(!hexLabels[key]) hexLabels[key]={lat:ctr.lat, lon:ctr.lon, name:c.placeName};
    });
    Object.values(hexLabels).forEach(function(lbl){
      // Proximity fade: within 30m fade to 0
      var dist=haversine(userLat,userLon,lbl.lat,lbl.lon);
      var opacity = dist<10 ? 0 : dist<30 ? (dist-10)/20 : 1;
      if(opacity<0.05) return;
      var icon=L.divIcon({ className:'', html:'<div class="place-label" style="opacity:'+opacity.toFixed(2)+'">'+lbl.name+'</div>', iconSize:[90,18], iconAnchor:[45,9] });
      var m=L.marker([lbl.lat,lbl.lon],{icon:icon,interactive:false,keyboard:false}).addTo(map);
      placeMarkers.push(m);
    });
  }

  function handleMessage(raw){ try{ var data = JSON.parse(raw); }catch(e){return;} if (data.type === 'updateLocation'){ var loc=data.location; userLat=loc.latitude; userLon=loc.longitude; var pins=data.pins||[]; currentPins=pins; var expl=data.exploredCircles||[]; var hdg = (typeof data.compassHeading==='number')?data.compassHeading:0; exploredCircles = expl; if (!map){ initMap(loc.latitude, loc.longitude); renderPins(pins); renderPlaceNames(expl); scheduleFogRedraw(); return; } updateAvatarTo(loc.latitude, loc.longitude); applyHeading(hdg); renderPins(pins); renderPlaceNames(expl); scheduleFogRedraw(); } else if (data.type==='setHeading'){ applyHeading(data.heading); } else if (data.type==='setExploredCircles'){ exploredCircles = data.circles || []; renderPlaceNames(exploredCircles); scheduleFogRedraw(); } else if (data.type==='flyTo'){ if(map){ map.flyTo([data.lat, data.lon], 17, {animate:true, duration:1.2}); } } else if (data.type==='resetRotation'){ _rotAngle = 0; _mapWrap.style.transition = 'transform 0.4s ease-out'; _mapWrap.style.transform = 'rotate(0deg)'; setTimeout(function(){ _mapWrap.style.transition = 'none'; }, 420); scheduleFogRedraw(); } }

  window.addEventListener('message', function(e){ handleMessage(e.data); }); document.addEventListener('message', function(e){ handleMessage(e.data); });

  initMap(${lat}, ${lon});

  // ── Unified touch handler: rotation-aware 1-finger pan + 2-finger rotate ────
  //
  // WHY we disable Leaflet's native drag:
  //   Leaflet pans the map in its own tile-coordinate space. When #map-wrapper is
  //   rotated by θ°, a left-swipe in screen space moves the tiles diagonally,
  //   making the pan feel backwards/wrong. By handling drag ourselves and
  //   counter-rotating the delta by -θ before calling map.panBy(), the map always
  //   moves in the exact direction the finger travels regardless of rotation angle.
  //
  // WHY we use a 5 px movement threshold before starting pan:
  //   Without a threshold every tap that moves even 1 px fires map.panBy(), which
  //   tells Leaflet the map moved and prevents it from firing the marker click event.
  //   With the threshold, genuine taps (< 5 px total movement) fall through untouched
  //   so Leaflet's marker click handler fires normally — fixing multi-tap on pins.

  var _rotAngle = 0, _rotStart = null;
  var _dragStart = null, _dragTotal = 0;
  var _outerContainer = document.getElementById('outer-container');
  var _mapWrap = document.getElementById('map-wrapper');

  // Disable Leaflet's own drag — we replace it below with rotation-compensated pan
  if (map) { map.dragging.disable(); }

  function _getTwoFingerAngle(e) {
    return Math.atan2(
      e.touches[1].clientY - e.touches[0].clientY,
      e.touches[1].clientX - e.touches[0].clientX
    ) * 180 / Math.PI;
  }

  _outerContainer.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      // Begin tracking a potential 1-finger drag
      _dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      _dragTotal = 0;
    } else if (e.touches.length === 2) {
      // 2-finger gesture — cancel any drag and begin rotation tracking
      _dragStart = null;
      _rotStart = { angle: _getTwoFingerAngle(e), base: _rotAngle };
    }
  }, { passive: true });

  _outerContainer.addEventListener('touchmove', function(e) {
    if (e.touches.length === 1 && _dragStart) {
      var dx = e.touches[0].clientX - _dragStart.x;
      var dy = e.touches[0].clientY - _dragStart.y;
      _dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      _dragTotal += Math.sqrt(dx * dx + dy * dy);
      // Raised to 10px — Android taps routinely jitter 6-8px; below this we
      // treat it as a tap and never call panBy (which would move pins away).
      if (_dragTotal < 10) return;
      if (!map) return;
      // Counter-rotate the screen-space delta by -_rotAngle so the map always
      // pans in the direction the finger is physically moving on screen
      var rad = -_rotAngle * Math.PI / 180;
      var mx = dx * Math.cos(rad) - dy * Math.sin(rad);
      var my = dx * Math.sin(rad) + dy * Math.cos(rad);
      map.panBy([-mx, -my], { animate: false, noMoveStart: true });
    } else if (e.touches.length === 2 && _rotStart !== null) {
      _rotAngle = _rotStart.base + (_getTwoFingerAngle(e) - _rotStart.angle);
      _mapWrap.style.transition = 'none';
      _mapWrap.style.transform = 'rotate(' + _rotAngle + 'deg)';
      scheduleFogRedraw();
    }
  }, { passive: true });

  _outerContainer.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) { _rotStart = null; }
    if (e.touches.length < 1) {
      // ── Explicit tap detection ──────────────────────────────────────────
      // We cannot rely on the browser's synthetic click event after a parent
      // touchstart listener intercepts the sequence on Android WebView, and
      // map.dragging.disable() also disables Leaflet's L.Map.Tap handler that
      // normally converts touchend→click for markers.
      // Solution: on a clean tap (dragTotal < 10px), use elementFromPoint to
      // find exactly what was under the finger and call pinTap/clusterTap
      // directly — bypassing both unreliable paths entirely.
      if (_dragStart !== null && _dragTotal < 10 && e.changedTouches.length > 0) {
        var tx = e.changedTouches[0].clientX;
        var ty = e.changedTouches[0].clientY;
        var el = document.elementFromPoint(tx, ty);
        while (el && el !== document.body) {
          if (el.dataset && el.dataset.pid) {
            pinTap(el.dataset.pid, el.dataset.ptype || 'pinPress');
            break;
          }
          if (el.dataset && el.dataset.cids) {
            clusterTap(el.dataset.cids);
            break;
          }
          el = el.parentElement;
        }
      }
      _dragStart = null;
    }
  }, { passive: true });
</script>
</body>
</html>`;

export const BasicMap: React.FC<BasicMapProps> = ({ userLocation, pins, onPinPress, onClusterPress, onMutedPinPress, discoveryRadius = 50, compassHeading = 0, exploredCircles = [], flyToLocation, resetRotationToken, onRegionChange }) => {
  const webViewRef = useRef<WebView>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Location + pins + explored circles (heavy – triggers full pin re-render in WebView)
  useEffect(() => {
    if (userLocation && webViewRef.current && mapLoaded) {
      const message = JSON.stringify({ type: 'updateLocation', location: userLocation, pins, compassHeading, exploredCircles });
      try { webViewRef.current.postMessage(message); } catch (e) { /* swallow */ }
    }
  }, [userLocation, pins, mapLoaded, exploredCircles]);

  // Heading-only update (lightweight – rotates avatar without re-rendering pins)
  useEffect(() => {
    if (webViewRef.current && mapLoaded && compassHeading !== undefined) {
      try {
        webViewRef.current.postMessage(JSON.stringify({ type: 'setHeading', heading: compassHeading }));
      } catch (e) { /* swallow */ }
    }
  }, [compassHeading, mapLoaded]);

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

  // Reset map rotation back to 0° (triggered by incrementing resetRotationToken)
  useEffect(() => {
    if (resetRotationToken && webViewRef.current && mapLoaded) {
      try {
        webViewRef.current.postMessage(JSON.stringify({ type: 'resetRotation' }));
      } catch (e) { /* swallow */ }
    }
  }, [resetRotationToken, mapLoaded]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pinPress' && onPinPress) onPinPress(data.pinId);
      else if (data.type === 'clusterPress' && onClusterPress) onClusterPress(data.pinIds);
      else if (data.type === 'mutedPinPress' && onMutedPinPress) onMutedPinPress(data.pinId);
      else if (data.type === 'mapReady') setMapLoaded(true);
      else if (data.type === 'regionChange' && onRegionChange) onRegionChange({ lat: data.lat, lon: data.lon });
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
