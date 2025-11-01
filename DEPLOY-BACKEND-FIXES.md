CRITICAL: BACKEND DEPLOYMENT NEEDED
====================================

## Issue

500 Error from: napalmsky-production.up.railway.app/auth/forgot-password

Root Cause:
===========
Production backend on Railway is running OLD code!
Your local fixes (commit 191) are NOT deployed yet.

## What Needs Deployment

Recent Backend Changes (commits 178-191):
- Permanent upgrade fix (allow password even if permanent)
- Forgot password route (POST /forgot-password)
- Reset password route (POST /reset-password)
- USC card no invite code fix
- Email verification 3-attempt limit

## How to Deploy to Railway

Option 1: Railway Auto-Deploy (Recommended)
============================================
If Railway is connected to your GitHub:
1. Push is done ✅ (commit 191 already pushed)
2. Railway auto-deploys
3. Wait 2-3 minutes
4. Check Railway logs for deployment

Option 2: Manual Deploy via Railway CLI
========================================
```bash
cd server
railway up
```

Option 3: Railway Dashboard
===========================
1. Go to Railway dashboard
2. Find your project
3. Click "Deploy" button
4. Wait for deployment

## Verify Deployment

After deploying, test:
```bash
curl -X POST https://napalmsky-production.up.railway.app/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@usc.edu"}'
```

Should return: {"success":true}
Not: 500 error

## Current Status

✅ Local code: FIXED (commit 191)
✅ Local build: SUCCESS
✅ Code pushed to GitHub: YES
❌ Railway deployment: NEEDED

Next Step: Deploy backend to Railway!
