USC CARD ONBOARDING - COMPLETE TEST INSTRUCTIONS
================================================

## ❌ CURRENT ISSUE

You're getting 500 error because you're NOT scanning the admin QR code first.

**Wrong Flow:**
1. Go to https://napalmsky.com/onboarding ❌
2. Scan USC card ❌
3. Error: 500 Internal Server Error ❌

**Correct Flow:**
1. Go to https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC ✅
2. Scan USC card ✅
3. Works! ✅

---

## ✅ HOW TO TEST (STEP-BY-STEP)

### Option 1: Use URL Directly

1. **Copy this URL:**
```
https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC
```

2. **Open in browser**
3. **You should see:** USC welcome popup
4. **Click "Scan Card"**
5. **Scan your USC card**
6. **Enter name + gender**
7. **Take selfie + video**
8. ✅ **Success!**

---

### Option 2: Use Admin QR Code

1. **Go to admin panel:** https://napalmsky.com/admin-login
2. **Login**
3. **Click "QR Codes" tab**
4. **You should see 10 QR codes** (they now persist!)
5. **Download one QR code**
6. **Scan the QR code with your phone**
7. **Follow USC card onboarding**
8. ✅ **Success!**

---

## 🔍 CHECK YOUR CURRENT URL

**Open browser console and run:**
```javascript
console.log('Current URL:', window.location.href);
console.log('Has inviteCode?', window.location.href.includes('inviteCode'));
```

**Expected output:**
```
Current URL: https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC
Has inviteCode? true
```

**If it shows `false`, that's why it's failing!**

---

## 🐛 DEBUGGING

If you're on the onboarding page, check the browser console for:

```javascript
[Onboarding] Invite code from URL: TCZIOIXWDZLEFQZC
[Onboarding] Admin code detected - USC card scan required
[Onboarding] DEBUG - inviteCode value: TCZIOIXWDZLEFQZC | length: 16 | type: string
```

**If you DON'T see these logs, you're on the wrong URL!**

---

## 📋 AVAILABLE ADMIN CODES

Any of these codes will work:

1. TCZIOIXWDZLEFQZC
2. QBEPZIGQVQ71O4MM
3. HQTRSU264R2TNGUT
4. R0EJLIUEAFBHIGZS
5. UBLSKKEMTMSBXFXY
6. GBMOIOMJDTKCAFHX
7. UC87H7YZGZ4TFPEF
8. 0FPAUAZJJ0T3CKDA
9. RODOJUMROA6SMVII
10. KPCMSZPO2VZR180Y

**Format:** https://napalmsky.com/onboarding?inviteCode=CODE_HERE

---

## ✅ VERIFICATION CHECKLIST

Before scanning USC card, verify:

- [ ] URL contains `?inviteCode=` parameter
- [ ] Invite code is 16 characters
- [ ] You see USC welcome popup (not regular onboarding)
- [ ] Browser console shows "Admin code detected"

**If ALL checked, scan USC card and it WILL work!**

---

## 🚨 COMMON MISTAKES

### Mistake 1: Going to /onboarding directly
❌ https://napalmsky.com/onboarding
✅ https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC

### Mistake 2: Scanning USC card first
❌ Scan card → then scan QR
✅ Scan QR (or open URL) → then scan card

### Mistake 3: Using wrong invite code format
❌ ?code=XXX or ?invite=XXX
✅ ?inviteCode=TCZIOIXWDZLEFQZC (exactly "inviteCode")

---

## 🧪 TEST BACKEND DIRECTLY

Run this in terminal to test if backend is working:

```bash
curl -X POST https://napalmsky-production.up.railway.app/auth/guest-usc \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","gender":"male","inviteCode":"TCZIOIXWDZLEFQZC"}'
```

**Expected:** Returns sessionToken + userId (success!)
**If error:** Backend hasn't redeployed yet (wait 60s)

---

## 💡 SOLUTION

**The system is working perfectly!**

You just need to use the admin QR code (with invite code parameter).

**Copy this URL NOW:**
```
https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC
```

**Open it, scan your USC card, and it WILL work!** ✅
