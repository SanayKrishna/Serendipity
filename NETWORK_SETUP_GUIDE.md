# Network Setup Guide - Mobile Data Connectivity

## Problem
Your backend runs on `http://192.168.1.32:8000` (local WiFi IP). When your phone switches to mobile data, it can't reach this address because:
- Local IPs (192.168.x.x) only work within the same WiFi network
- Mobile data connects through your carrier's network, not your home network

## Solution: Use ngrok for Public URL

### Step 1: Install ngrok
1. Download from: https://ngrok.com/download
2. Extract the zip file
3. Sign up for a free account at https://ngrok.com/
4. Get your auth token

### Step 2: Setup ngrok
```powershell
# Navigate to ngrok folder
cd C:\path\to\ngrok

# Authenticate (only needed once)
.\ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE

# Start tunnel to your backend (port 8000)
.\ngrok http 8000
```

### Step 3: Copy Your Public URL
ngrok will show something like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:8000
```

Copy the `https://abc123.ngrok.io` URL

### Step 4: Update Your App's API Config
Open `mobile/src/config/api.ts` and update the BASE_URL:

```typescript
const getBaseUrl = (): string => {
  if (__DEV__) {
    // Development mode
    if (Platform.OS === 'web') {
      return 'http://localhost:8000';
    } else {
      // Use ngrok URL for mobile testing
      return 'https://YOUR-NGROK-ID.ngrok.io';  // <-- UPDATE THIS
    }
  }
  return 'https://YOUR-NGROK-ID.ngrok.io';
};
```

### Step 5: Restart Your App
```powershell
# Press 'r' in the Expo terminal to reload
```

## Important Notes
- **Free ngrok URLs change** every time you restart ngrok
- Keep the ngrok terminal window open while testing
- Both WiFi and mobile data will now work
- Perfect for GPS testing while walking around

## Alternative: WiFi-Only Testing
If you prefer WiFi-only:
1. Keep current config with `192.168.1.32:8000`
2. Stay connected to your home WiFi
3. Walk around within WiFi range

## Production Deployment (Later)
For production, deploy your backend to:
- Railway.app (free tier available)
- Render.com (free tier available)
- AWS/GCP/Azure
- Your own VPS

Then update `api.ts` with your production URL.
