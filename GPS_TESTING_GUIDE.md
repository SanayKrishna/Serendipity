# 🧪 GPS & 50m Constraint Testing Guide

## ✅ Pre-Test Checklist

### Backend Setup
- [ ] Backend server running on `http://10.176.146.89:8000`
- [ ] Database initialized with pins table
- [ ] Health endpoint accessible: `/health`

### Mobile Setup
- [ ] Dependencies installed: `npm install` completed
- [ ] MapLibre initialized in App.tsx
- [ ] Location permissions enabled on device
- [ ] Notification permissions enabled

## 🎯 Test 1: GPS Location Tracking

### Expected Behavior
- User location appears as pulsing blue dot on map
- Location coordinates displayed in bottom bar
- Location updates as user moves
- Accuracy indicator available

### Steps
1. Open the app
2. Grant location permissions when prompted
3. Open RadarScreen (Home tab)
4. Verify blue pulsing dot appears
5. Check location bar shows coordinates: `📍 X.XXXXXX°N, Y.YYYYYY°E`

### ✅ Pass Criteria
- [ ] Blue dot visible on map
- [ ] Coordinates displayed and accurate
- [ ] Location updates in real-time (move around)
- [ ] "Scanning..." indicator pulses

### ❌ If Failed
- Check location permissions in device settings
- Verify LocationService.ts is working
- Check console for GPS errors
- Try restarting the app

---

## 🎯 Test 2: 50m Discovery Radius Visualization

### Expected Behavior
- Transparent blue circle around user location
- Circle represents exactly 50 meters
- Circle moves with user
- Pins only discoverable within circle

### Steps
1. Open RadarScreen
2. Look for semi-transparent blue circle
3. Verify circle is centered on blue user dot
4. Note the size represents 50m radius

### ✅ Pass Criteria
- [ ] Blue discovery radius circle visible
- [ ] Circle centered on user location
- [ ] Circle follows user movement
- [ ] Approximate 50m visual radius

### ❌ If Failed
- Check `showDiscoveryRadius={true}` in RadarScreen
- Verify MapLibreMap.tsx has discovery radius layer
- Check MAP_CONFIG.discoveryRadius = 50

---

## 🎯 Test 3: Pin Creation at Current Location

### Expected Behavior
- Drop screen shows map preview with user location
- Pin created at exact GPS coordinates
- Pin stored in backend with lat/lon
- Success message after drop

### Steps
1. Go to Drop Screen (middle tab)
2. Verify mini map shows your location
3. Type a test message: "Test Pin 1"
4. Tap "Drop Message Here"
5. Wait for success animation
6. Go back to RadarScreen

### ✅ Pass Criteria
- [ ] Mini map preview shows user location
- [ ] Pin drops successfully
- [ ] Success message: "Message Dropped!"
- [ ] Coordinates shown: `X.XXXXXX°N, Y.YYYYYY°E`

### ❌ If Failed
- Check backend `/pin` endpoint
- Verify location service working
- Check API_CONFIG.BASE_URL correct
- Look for error alerts

---

## 🎯 Test 4: 50m Discovery Constraint (Backend)

### Expected Behavior
- Only pins within 50m are returned by backend
- Backend filters by distance calculation
- Pins beyond 50m are NOT discoverable
- Distance shown in meters for each pin

### Steps - Part A: Create Test Pins
1. Drop Pin A at location 1
2. Move 30 meters away (use GPS app to track)
3. Drop Pin B at location 2
4. Move 60 meters from Pin A
5. Drop Pin C at location 3

### Steps - Part B: Test Discovery
1. Return to Pin A location (within 50m)
2. Open RadarScreen
3. Pull to refresh
4. Pin A should appear with distance ~0-10m

5. Move to Pin B location (within 50m)
6. Pull to refresh
7. Pin B should appear with distance ~0-10m

8. Stay at Pin B, check for Pin A
9. If 30m between A and B, both should appear
10. If >50m away from Pin A, it should NOT appear

11. Move to Pin C (60m from A)
12. Pin A should NOT appear
13. Only Pin C (and maybe B if close) should appear

### ✅ Pass Criteria
- [ ] Pins within 50m appear on map
- [ ] Pins beyond 50m do NOT appear
- [ ] Distance shown for each pin (e.g., "35m away")
- [ ] Refresh updates pin list correctly

### ❌ If Failed
- Check backend `/discover` endpoint
- Verify `DISCOVERY_RADIUS = 50` in backend config
- Check distance calculation (Haversine formula)
- Look at backend logs for distance values

---

## 🎯 Test 5: Real-time Scanning (Heartbeat)

### Expected Behavior
- App scans every 10 seconds
- App scans when moving 20+ meters
- New pins auto-appear without refresh
- Notification sent when pin discovered

### Steps
1. Have someone else drop a pin 40m away
2. Stay still, wait 10-15 seconds
3. Pin should auto-appear (heartbeat scan)
4. Notification should pop up: "✨ Message Discovered!"

OR

1. Drop a pin at location X
2. Move 100m away
3. Slowly walk back toward pin
4. As you get within 50m, pin should auto-appear
5. Check for notification

### ✅ Pass Criteria
- [ ] Pins auto-discovered without manual refresh
- [ ] "Scanning..." indicator appears during scan
- [ ] Notification received on discovery
- [ ] Distance updates as you move closer

### ❌ If Failed
- Check LocationService.ts heartbeat interval
- Verify API_CONFIG.HEARTBEAT_INTERVAL = 10000
- Check notification permissions
- Look for "Heartbeat" logs in console

---

## 🎯 Test 6: Map Pin Interaction

### Expected Behavior
- Tap pin to select (turns gold)
- Bottom sheet opens with pin details
- Like/Dislike buttons work
- Distance shown accurately

### Steps
1. Discover a pin within 50m
2. Tap the red circle pin on map
3. Pin changes to gold/yellow
4. Bottom sheet slides up from bottom
5. Check distance: "Xm away"
6. Tap "❤️ Like" button
7. Like count increases
8. Tap "Remove" button
9. Pin disappears from map

### ✅ Pass Criteria
- [ ] Pin selection works (red → gold)
- [ ] Bottom sheet appears with content
- [ ] Distance accurate
- [ ] Like button increases count
- [ ] Remove button hides pin

### ❌ If Failed
- Check onPinSelect handler in RadarScreen
- Verify MapLibreMap onPress working
- Check API endpoints for like/dislike
- Look for JavaScript errors

---

## 🎯 Test 7: Pokemon Go Style UI

### Visual Checklist
- [ ] Map has clean street view (OpenFreeMap)
- [ ] Parks appear in light green
- [ ] Water appears in light blue
- [ ] Buildings appear in light gray
- [ ] User location: pulsing blue dot
- [ ] Discovery radius: transparent blue circle (50m)
- [ ] Pins: Simple colored circles (not complex)
  - [ ] Red circles for normal pins
  - [ ] Gold/yellow for selected pin
  - [ ] White border on pins
- [ ] Bottom sheet: Clean white card design
- [ ] Top bar: Search-like UI with pin count
- [ ] FAB buttons: Floating on right side
- [ ] Animations: Smooth and minimal

---

## 📊 Performance Tests

### Test 8: Map Performance
- [ ] Map loads in < 3 seconds
- [ ] Smooth panning (60fps)
- [ ] Smooth zooming
- [ ] No lag when adding/removing pins
- [ ] No crashes on low-end devices

### Test 9: GPS Performance
- [ ] Location updates smooth (not jumpy)
- [ ] Battery usage reasonable
- [ ] No overheating
- [ ] Works in background (iOS/Android permissions)

---

## 🐛 Debugging Tips

### GPS Not Working
```bash
# Check location service status
console.log('🛰️ Location tracking started')

# Check locationService logs
this.lastLocation  # Should have lat/lon
```

### 50m Constraint Not Working
```bash
# Backend: Check distance calculation
distance = haversine(user_lat, user_lon, pin_lat, pin_lon)
print(f"Pin {pin_id} distance: {distance}m")

# Mobile: Check API response
console.log('Discovered pins:', response.pins)
# Each pin should have distance_meters
```

### Pins Not Appearing
```bash
# Check heartbeat
console.log('💓 Heartbeat - checking for nearby pins...')

# Check API call
const response = await apiService.discoverPins(lat, lon)
console.log('Pins found:', response.count)
```

### Map Not Loading
```bash
# Check MapLibre initialization
MapLibreGL.setAccessToken(null)  # In App.tsx

# Check map style
OPENFREE_MAP_STYLE  # Should have 'sources' and 'layers'
```

---

## ✅ Final Validation Checklist

### Core Functionality
- [ ] GPS tracking works in real-time
- [ ] 50m discovery radius enforced
- [ ] Pins created at exact location
- [ ] Pins only discovered within 50m
- [ ] Heartbeat scanning every 10 seconds
- [ ] Location updates every 20 meters

### UI/UX
- [ ] Pokemon Go style map visible
- [ ] Blue pulsing dot for user
- [ ] Blue circle for 50m radius
- [ ] Simple circle pins (minimalistic)
- [ ] Bottom sheet for pin details
- [ ] Clean, responsive UI

### Backend Integration
- [ ] `/discover` endpoint working
- [ ] `/pin` endpoint working
- [ ] `/like` and `/dislike` working
- [ ] Distance calculations accurate
- [ ] 50m filter applied server-side

### Edge Cases
- [ ] Works with location disabled (shows message)
- [ ] Works offline (cached data)
- [ ] Handles empty pin list gracefully
- [ ] Handles rate limiting (429 errors)
- [ ] Handles network errors

---

## 📱 Device Testing Matrix

| Device Type | GPS Test | 50m Test | UI Test | Performance |
|-------------|----------|----------|---------|-------------|
| Android Emulator | ⬜ | ⬜ | ⬜ | ⬜ |
| Android Physical | ⬜ | ⬜ | ⬜ | ⬜ |
| iOS Simulator | ⬜ | ⬜ | ⬜ | ⬜ |
| iOS Physical | ⬜ | ⬜ | ⬜ | ⬜ |
| Web Browser | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🎉 Success Confirmation

All tests passing = ✅ READY FOR PRODUCTION

- GPS tracking works perfectly
- 50m constraint enforced correctly
- Pokemon Go style UI looks great
- Performance is smooth
- No bugs or crashes

---

**Testing Date**: _____________
**Tested By**: _____________
**Overall Result**: ⬜ PASS | ⬜ FAIL | ⬜ NEEDS WORK
