# Supabase Setup Guide for Serendipity SNS

## ✅ What I've Done For You (On Your Laptop)

1. **Installed packages** in `mobile/` folder:
   - `@supabase/supabase-js` - Supabase client library
   - `@react-native-async-storage/async-storage` - Stores user session on phone
   - `react-native-url-polyfill` - Makes URLs work properly
   - `react-native-get-random-values` - Generates secure random IDs

2. **Added polyfills** to `App.tsx` (top of file)
   - These make Supabase work on React Native

3. **Updated AuthService** to use AsyncStorage
   - User sessions will persist when app closes/reopens

## 🚀 What You Need To Do Next

### Step 1: Create Free Supabase Account (5 minutes)

1. Go to **https://supabase.com**
2. Click **"Start your project"**
3. Sign up with your email (no credit card needed!)
4. Verify your email

### Step 2: Create a New Project (2 minutes)

1. After login, click **"New Project"**
2. Fill in:
   - **Name**: `serendipity-sns` (or whatever you want)
   - **Database Password**: Choose a strong password (save it somewhere!)
   - **Region**: Choose closest to Japan (e.g., Tokyo, Singapore, or Seoul)
3. Click **"Create new project"**
4. Wait 2-3 minutes for setup to complete

### Step 3: Get Your API Keys (1 minute)

1. In your Supabase project dashboard, click **"Settings"** (gear icon in left sidebar)
2. Click **"API"** in the Settings menu
3. You'll see two important things:

   **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - Copy this entire URL

   **Project API keys** section:
   - Find **"anon public"** key
   - Click the copy icon next to it
   - This is safe to use in your app (it's meant to be public)

### Step 4: Configure Your App (2 minutes)

1. Open `mobile/src/config/supabase.ts` in VS Code
2. Replace the placeholder values:

```typescript
export const SUPABASE_CONFIG = {
  // Paste your Project URL here:
  url: 'https://xxxxxxxxxxxxx.supabase.co',
  
  // Paste your anon public key here:
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS...',
};
```

3. Save the file

### Step 5: Test It Works

**Option A - Quick Test (Web, 1 minute):**
```bash
cd mobile
npm run web
```
- Open browser console (F12)
- Look for log: `🔐 Supabase anonymous user created: xxxxxxxx...`
- If you see this, it's working! ✅

**Option B - Full Test (Phone, requires rebuild):**

Since you added native packages, you need to rebuild the dev client:

```bash
cd mobile
npx expo prebuild
# Then build new dev APK:
eas build --profile development --platform android
```

After installing the new dev APK and running the app, check logs for:
- `🔐 Supabase anonymous user created: xxxxxxxx...`

## 📱 How It Works Now

### Before (Device ID):
- App generates random UUID like `c457d56b-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Stored in device storage
- **Problem**: Lost if user clears app data or reinstalls

### After (Supabase):
- App calls Supabase and gets a real user ID
- Supabase stores the session and refreshes it automatically
- **Benefit**: Same user ID even if app is reinstalled
- **Future**: Can link email later without losing pins/data

### What Your Backend Sees:
- `X-Device-ID`: The Supabase user UUID (instead of random device ID)
- `X-Auth-Type`: `supabase` (instead of `device`)
- Backend stores this in `devices` table with `auth_type='supabase'`

## 🔒 Security Notes

- **anon key** (what you pasted): Safe to expose in client code, meant to be public
- **service_role key**: NEVER put this in your app! Only use on backend if needed
- Supabase enforces security through Row Level Security (RLS) policies

## 🐛 Troubleshooting

**"Supabase not installed, using device ID"**
- Packages installed correctly? Run `npm list @supabase/supabase-js`
- Config correct? Check `supabase.ts` has real URL and key

**"URL is not valid" or similar errors**
- Make sure URL starts with `https://` and ends with `.supabase.co`
- No extra spaces or quotes in the config

**Native app crashes after install**
- You need to rebuild the dev client because we added native modules
- Run `eas build --profile development --platform android`

## ✅ Success Indicators

When everything works, you'll see in logs:
1. `🔐 Supabase anonymous user created: xxxxxxxx...`
2. `📡 API Request: POST http://192.168.1.32:8000/pin`
3. Backend logs show: `New supabase user registered`

## 🎯 What's Next (Later)

Once Supabase is working, you can add:
- **Email linking**: Let users "claim" their anonymous account by adding email
- **Cross-device**: Same pins/profile on multiple devices
- **Friends system**: Real user IDs make friend lists easy
- **Profiles**: Store user preferences, avatars, etc.

---

## Quick Reference

| Thing | Where | What |
|-------|-------|------|
| Supabase Dashboard | https://supabase.com/dashboard | Manage your project |
| Config File | `mobile/src/config/supabase.ts` | Add your keys here |
| Auth Logic | `mobile/src/services/AuthService.ts` | Handles sign-in (already done) |
| Backend Support | `backend/app/main.py` | Already accepts Supabase auth |

Need help? Check the Supabase docs: https://supabase.com/docs/guides/auth/anonymous-sign-ins
