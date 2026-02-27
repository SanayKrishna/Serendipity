# Project Documentation (Consolidated)

This file consolidates the Markdown files previously split across `docs/` and `docs/archive`.

## Files included
- UPTIME_MONITOR.md
- archive/README.md
- archive/SUMMARY.md
- archive/REMAINING_FEATURES_GUIDE.md
- archive/POKEMON_GO_IMPLEMENTATION.md
- archive/NOTIFICATION_SYSTEM_IMPLEMENTATION.md
- archive/MOBILE_DATA_FIXED.md
- archive/MAPLIBRE_MIGRATION_COMPLETE.md
- archive/IMPLEMENTATION_SUMMARY_FEB19.md
- archive/IMPLEMENTATION_COMPLETE.md
- archive/FIXES_AND_IMPROVEMENTS.md
- archive/COMMUNITY_DIARY_IMPLEMENTATION.md
- archive/algorithn.md

---

## UPTIME_MONITOR.md

# Uptime Monitor (UptimeRobot / cron-job.org)

This document explains two simple external uptime-monitoring options you can use to ping the backend and further reduce cold starts.

1) UptimeRobot (recommended)

- Create a free account at https://uptimerobot.com/
- Add a new HTTP(s) monitor:
  - Monitor Type: `HTTP(s)`
  - Friendly Name: `Serendipity Backend`
  - URL (example): `https://your-railway-url/health/fast`
  - Interval: 5 minutes (free plan supports 5 minutes)
- Save. UptimeRobot will ping from multiple locations and keep the service warm.

2) cron-job.org (simple alternative)

- Create an account at https://cron-job.org/
- Add a new cron job with the request set to `GET` and URL `https://your-railway-url/health/fast`.
- Set schedule to every 5 minutes.

3) Quick curl test (useful for verifying URL)

```bash
curl -i -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://your-railway-url/health/fast
```

Notes
- Replace `https://your-railway-url` with the value of your `RAILWAY_BACKEND_URL`.
- The GitHub Actions `keep-warm.yml` workflow already pings every 5 minutes. Adding an external monitor provides redundancy and pings from different networks.

If you want, I can add a small GitHub Action that notifies you (Slack/email) when the health endpoint fails; tell me which notifier you prefer and I’ll add it.

---

## archive/README.md

# Archived Notes

This folder contains Markdown files moved from the project root that are no longer
actively used in development but may contain useful historical context.

Files moved here were selected to keep the repository root focused while preserving
their contents for future reference.

If you want these removed completely, delete them from this directory.

---

## archive/SUMMARY.md

<archived file preserved>

---

## archive/REMAINING_FEATURES_GUIDE.md

<archived file preserved>

---

## archive/POKEMON_GO_IMPLEMENTATION.md

<archived file preserved>

---

## archive/NOTIFICATION_SYSTEM_IMPLEMENTATION.md

<archived file preserved>

---

## archive/MOBILE_DATA_FIXED.md

<archived file preserved>

---

## archive/MAPLIBRE_MIGRATION_COMPLETE.md

<archived file preserved>

---

## archive/IMPLEMENTATION_SUMMARY_FEB19.md

<archived file preserved>

---

## archive/IMPLEMENTATION_COMPLETE.md

<archived file preserved>

---

## archive/FIXES_AND_IMPROVEMENTS.md

<archived file preserved>

---

## archive/COMMUNITY_DIARY_IMPLEMENTATION.md

<archived file preserved>

---

## archive/algorithn.md

<archived file preserved>

---

## TEST_CHECKLIST.md

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

## SUPABASE_SETUP_GUIDE.md

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

## SUPABASE_MIGRATION_GUIDE.md

# Supabase Migration Guide (Beginner-Friendly)

This guide shows you exactly how to apply the `005_passes_by_and_duration` database migration.

---

## README.md (root)

# Serendipity SNS

Mobile + backend project for serendipitous local pins.

Run locally:

Backend:
```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Mobile (Expo):
```powershell
cd mobile
npx expo start --lan --clear
```

## NETWORK_SETUP_GUIDE.md

# Network Setup Guide - Mobile Data Connectivity

## Problem
Your backend runs on `http://192.168.1.32:8000` (local WiFi IP). When your phone switches to mobile data, it can't reach this address because:
- Local IPs (192.168.x.x) only work within the same WiFi network
- Mobile data connects through your carrier's network, not your home network

## HOW_APP_IS_RUNNING.md

# 🚀 How the App is Currently Running

... (session details, terminal commands, run instructions, and network setup)

## GPS_TESTING_GUIDE.md

# 🧪 GPS & 50m Constraint Testing Guide

... (testing steps for GPS, discovery radius, pin creation, performance tests, debugging tips)

