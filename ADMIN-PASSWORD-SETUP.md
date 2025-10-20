# 🔑 Admin Password Environment Variable Setup

**CRITICAL SECURITY UPDATE**  
**Date:** October 20, 2025  
**Action Required:** Set ADMIN_PASSWORD_HASH before deploying

---

## ⚠️ WHAT CHANGED

**Before (INSECURE):**
```typescript
// Hardcoded in source code - DANGEROUS!
const ADMIN_PASSWORD_HASH = '$2b$12$51/ipDaDcOudvkQ8KZBdlOtlieovXEWfQcCW4PMC.ml530T7umAD2';
// Password: 328077
```

**After (SECURE):**
```typescript
// From environment variable - SECURE!
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
```

**Why This Matters:**
- Hardcoded credentials = major security vulnerability
- Uber's 2022 breach included hardcoded admin credentials
- If your code repo leaks, admin access is compromised
- Environment variables keep secrets OUT of code

---

## 🚀 SETUP INSTRUCTIONS

### Step 1: Generate New Admin Password Hash (2 minutes)

**Option A: Using Node.js (Recommended)**

```bash
# Open terminal and run:
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('328077', 12).then(hash => console.log(hash));"

# Replace YOUR_NEW_ADMIN_PASSWORD with your actual password
# Example output:
# $2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123
```

**Option B: Using Online bcrypt Generator**

1. Go to: https://bcrypt-generator.com/
2. Enter your password
3. Select **12 rounds**
4. Click "Generate"
5. Copy the hash (starts with `$2b$12$`)

**⚠️ Choose a STRONG password:**
- At least 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- NOT: 328077, password, admin123, etc.
- Example: `Admin2025!Secure#Napalm`

---

### Step 2: Add to Railway Environment (3 minutes)

1. **Go to Railway Dashboard:**
   - https://railway.app/dashboard
   - Click your Napalmsky project
   - Click your **backend service**

2. **Click "Variables" tab**

3. **Add New Variable:**
   - **Key:** `ADMIN_PASSWORD_HASH`
   - **Value:** `$2b$12$abcdefg...` (your hash from Step 1)
   - Click **"Add"**

4. **Optional: Set Admin Username:**
   - **Key:** `ADMIN_USERNAME`
   - **Value:** `Hanson` (or whatever you want)
   - Default is `admin` if not set

5. **Save**

Railway will automatically redeploy (~2-3 minutes)

---

### Step 3: Update Local Development (If Testing Locally)

Create `server/.env` file:

```bash
# Admin credentials
ADMIN_USERNAME=Hanson
ADMIN_PASSWORD_HASH=$2b$12$[your_hash_here]

# Other variables...
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_test_...
```

---

### Step 4: Verify It Works

1. **Wait for Railway deployment** to complete (2-3 min)

2. **Go to:** https://napalmsky.com/admin-login

3. **Login:**
   - Username: `Hanson` (or whatever you set as ADMIN_USERNAME)
   - Password: `YOUR_NEW_ADMIN_PASSWORD` (the plaintext password you chose)

4. **Should work!** ✅

If you see an error about ADMIN_PASSWORD_HASH, the environment variable isn't set correctly.

---

## 🔒 SECURITY NOTES

### DO:
- ✅ Use a strong, unique password for admin
- ✅ Store hash in Railway environment variables
- ✅ Keep hash secret (don't share, don't commit)
- ✅ Use different password than your personal accounts
- ✅ Change password every 90 days

### DON'T:
- ❌ Commit hash to Git
- ❌ Share hash publicly
- ❌ Use weak password (123456, password, etc.)
- ❌ Reuse password from other sites
- ❌ Hardcode in source code ever again

---

## 🔄 To Change Admin Password Later:

1. Generate new hash (Step 1 above)
2. Update Railway variable `ADMIN_PASSWORD_HASH`
3. Railway auto-redeploys
4. Login with new password

Easy and secure!

---

## ⚡ Quick Reference

**Generate Hash:**
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YOUR_PASSWORD', 12).then(h => console.log(h));"
```

**Railway Variables Needed:**
```bash
ADMIN_USERNAME=Hanson
ADMIN_PASSWORD_HASH=$2b$12$[your_hash_here]
```

**Login URL:**
```
https://napalmsky.com/admin-login
```

---

## 🆘 Troubleshooting

### "Fatal: ADMIN_PASSWORD_HASH not configured"

**Cause:** Environment variable not set

**Fix:**
1. Check Railway → Variables → ADMIN_PASSWORD_HASH exists
2. Check spelling is exactly `ADMIN_PASSWORD_HASH`
3. Wait for deployment to complete
4. Check Railway logs for startup errors

### "Invalid credentials" when logging in

**Cause:** Wrong password or hash doesn't match

**Fix:**
1. Verify you're using the plaintext password (not the hash) to login
2. Regenerate hash and update Railway variable
3. Make sure hash was copied completely (they're long!)

### Backend won't start

**Cause:** Missing ADMIN_PASSWORD_HASH causes server to exit

**Fix:**
1. Add the variable IMMEDIATELY
2. Railway will auto-restart
3. Check logs to confirm started successfully

---

**This security fix is CRITICAL - set it up before your next deployment!** 🔐

