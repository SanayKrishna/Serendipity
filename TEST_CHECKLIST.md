# Test Checklist — Safe Verification Commands

Run these commands anytime to verify app health **without breaking existing functionality**.

---

## ✅ Completed Checks (Feb 21, 2026)

### 1. TypeScript Type Check
```powershell
cd mobile
npx tsc --noEmit
```
**Status:** ✅ PASSED (0 errors)

### 2. Expo Health Check
```powershell
cd mobile
npx expo-doctor
```
**Status:** ⚠️ WARNINGS ONLY (5 package version mismatches — documented below, not blocking)

### 3. Dependencies Installed
```powershell
cd mobile
npm list --depth=0
```
**Status:** ✅ ALL INSTALLED (no unmet peer dependencies)

### 4. Backend Database Connectivity
```powershell
cd backend
python app\run_migration.py
```
**Status:** ✅ CONNECTED (Supabase transaction pooler verified)

### 5. Supabase Migrations
**Status:** ✅ ALL APPLIED (migrations 002-005 in production DB)

---

## ⚠️ Known Warnings (Non-Blocking)

### Package Version Mismatches
Detected by `expo-doctor`. These do NOT cause errors currently. Document only — DO NOT auto-fix without testing.

| Package | Expected | Installed | Severity |
|---------|----------|-----------|----------|
| `react-native-get-random-values` | ~1.11.0 | 2.0.0 | ⚠️ MAJOR |
| `react-native-gesture-handler` | ~2.28.0 | 2.30.0 | ℹ️ Minor |
| `react-native-reanimated` | ~4.1.1 | 4.2.1 | ℹ️ Minor |
| `react-native-screens` | ~4.16.0 | 4.23.0 | ℹ️ Minor |
| `react-native-webview` | 13.15.0 | 13.16.0 | ℹ️ Minor |

**Action:** Monitor only. If build/runtime errors occur, run:
```powershell
npx expo install --check
npx expo install --fix
```

---

## 🧪 Next: Manual Smoke Tests

### Start Mobile App (Expo)
```powershell
cd mobile
yarn start
# Then:
# - Scan QR with Expo Go, OR
# - Press 'a' for Android simulator, OR
# - Press 'i' for iOS simulator
```

**Test Flows:**
1. **Radar Screen** — Map loads, fog of war renders, compass rotates, pins cluster
2. **Drop Screen** — Location lock works, accuracy gate (< 20m), timer dial, can create pin
3. **Community Screen** — Toggle filters (community vs all), shows nearby pins
4. **Diary Screen** — Shows your pins, ratings, passes_by counter

### Start Backend API (Local)
```powershell
cd backend
# Activate venv if you have one:
.venv\Scripts\Activate.ps1
# Install deps (if needed):
pip install -r requirements.txt
# Start server:
uvicorn app.main:app --reload --port 8000
```
Visit: http://localhost:8000/docs (Swagger UI)

**Test Endpoints:**
- `GET /discover` — Pass lat/lon, verify pins returned
- `POST /pins` — Create pin, verify `is_community`, `passes_by`, `duration_hours`
- `POST /pins/{id}/like` — Verify likes increment

---

## 🚀 Production Release Checklist

### Before Building
- [ ] All tests above pass
- [ ] Smoke test on real device (Expo Go)
- [ ] Backend points to production Supabase (check `backend/.env`)
- [ ] Mobile app points to production API (check `mobile/src/config/api.ts`)

### EAS Build (Staging)
```powershell
cd mobile
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

### EAS Build (Production)
```powershell
# Bump version in app.json first
eas build --platform android --profile production
eas build --platform ios --profile production
```

### Submit to Stores
```powershell
eas submit --platform android
eas submit --platform ios
```

---

## 📋 Command Quick Reference

All commands are **read-only** (safe) unless marked with 🔧.

| Command | Purpose | Safe? |
|---------|---------|-------|
| `npx tsc --noEmit` | TypeScript check | ✅ Yes |
| `npx expo-doctor` | Expo health check | ✅ Yes |
| `npm list --depth=0` | List dependencies | ✅ Yes |
| `yarn start` | Start Expo dev server | ✅ Yes |
| `npx expo install --fix` | Auto-fix version mismatches | 🔧 Modifies package.json |
| `eas build` | Build production artifact | 🔧 Creates build |


## 🛡️ Safety Rules

1. **Never run `npx expo install --fix` without testing** — it may downgrade packages and break features.
2. **Always test on device/simulator before production build** — Expo Go may hide native module issues.
3. **Version mismatches are warnings, not errors** — only fix if you see actual runtime crashes.
4. **Backup before major dependency updates** — commit to git first.


Last updated: Feb 21, 2026
NOTE: Several historical Markdown files were archived to `docs/archive/` to keep
the repo root tidy. If you need a file restored, copy it back to the project root.
