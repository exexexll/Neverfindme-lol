# USC Admin QR Code Pipeline - Complete Verification

## 🔄 Pipeline Stages Matched

### **ADMIN QR CODE ROUTE (USC Card Path)**

```
STAGE 1: QR Code Detection
════════════════════════════════════════
URL: /onboarding?inviteCode=ABC123XYZ456
  ↓
Check: /payment/validate-code
  Response: { valid: true, type: 'admin' }
  ↓
Actions:
  ✅ setNeedsUSCCard(true)
  ✅ setStep('usc-welcome')
```

```
STAGE 2: USC Welcome Popup
════════════════════════════════════════
Component: <USCWelcomePopup />
Display:
  ✅ USC gradient background (cardinal → gold)
  ✅ "Welcome to BUMPIN @ USC"
  ✅ 1-2 sentence description
  ✅ [Continue to Verification] button
  
Security:
  ✅ Full-screen overlay (z-100)
  ✅ Cannot skip this step
```

```
STAGE 3: USC Card Scanner
════════════════════════════════════════
Component: <USCCardScanner />
Security:
  ✅ Back button BLOCKED (popstate event trapped)
  ✅ Cannot bypass with browser back
  ✅ Cannot skip without "Use Email" button
  
Detection:
  ✅ Quagga2 library (Codabar reader)
  ✅ Large scan area (90% x 70%)
  ✅ Multi-read validation (3 consecutive)
  ✅ Auto-restart on error
  
On Success:
  ✅ Extract USC ID: "1268306021" from "12683060215156"
  ✅ Store TEMP in sessionStorage (NOT database)
  ✅ setUscId(scannedUSCId)
  ✅ setNeedsUSCEmail(false) ← CRITICAL FIX
  ✅ setNeedsUSCCard(false)
  ✅ Visual confirmation: "USC ID: ******6021"
  ✅ setStep('name')
  
On Skip:
  ✅ setNeedsUSCEmail(true) ← Switch to email path
  ✅ setUscId(null)
  ✅ Clear temp storage
  ✅ setStep('name')
```

```
STAGE 4: Name + Gender
════════════════════════════════════════
Display:
  ✅ Yellow notice: "Guest Account - 7 Day Trial"
  ✅ Name input
  ✅ Gender selection
  ✅ USC Email input: HIDDEN (needsUSCEmail=false, uscId exists)
  ✅ Legal consent checkbox
  
Validation (handleNameSubmit):
  ✅ Check name not empty
  ✅ if (!uscId) { check USC email } ← FIXED
  ✅ if (uscId) { skip email checks } ← FIXED
  ✅ Check terms agreed
  
API Call:
  POST /auth/guest-usc
  Body: { name, gender, inviteCode }
  ❌ NO uscId sent (card saved later)
  
Response:
  ✅ sessionToken
  ✅ userId  
  ✅ accountType: 'guest'
  ✅ expiresAt: NOW() + 7 days
```

```
STAGE 5: Selfie
════════════════════════════════════════
✅ Same as regular flow
✅ Camera capture
✅ Upload to Cloudinary
```

```
STAGE 6: Video
════════════════════════════════════════
✅ Same as regular flow
✅ Record intro video
✅ Upload to Cloudinary
```

```
STAGE 7: Permanent Account (Optional)
════════════════════════════════════════
Options:
  
  A) Skip (Continue as Guest):
     ✅ Call /usc/finalize-registration
     ✅ Save USC card to database NOW
     ✅ Link to user account
     ✅ Clear temp storage
     ✅ Go to /main
  
  B) Make Permanent (Add Email):
     ✅ Enter email + password
     ✅ Call /auth/link
     ✅ Call /usc/finalize-registration  
     ✅ Save USC card to database NOW
     ✅ Link to user account
     ✅ accountType → 'permanent'
     ✅ Go to /main
```

```
STAGE 8: Main Page
════════════════════════════════════════
Guest Account:
  ✅ Full access to all features
  ✅ Shows "Guest account - 6 days remaining"
  ✅ Can upgrade in Settings

Permanent Account:
  ✅ Full access forever
  ✅ No expiry warning
  ✅ Can login with email OR USC card
```

---

## 🔄 Pipeline Comparison

### **Path A: USC CARD (Admin QR + Card Scan)**

| Stage | What Happens | USC Email Required? | USC Card in DB? |
|-------|--------------|---------------------|-----------------|
| 1. QR Scan | Detect admin code | ❌ | ❌ |
| 2. Welcome | Show USC popup | ❌ | ❌ |
| 3. Card Scan | Scan → temp storage | ❌ | ❌ Temp only |
| 4. Name/Gender | Create guest account | ❌ **HIDDEN** | ❌ Not yet |
| 5. Selfie | Upload photo | ❌ | ❌ |
| 6. Video | Upload video | ❌ | ❌ |
| 7. Permanent | Skip or add email | ❌ Optional | ✅ **SAVED NOW** |
| 8. Main | App active | ❌ | ✅ Linked |

**Result**: 
- ✅ USC email **NEVER** required
- ✅ USC card saved **ONLY** after completion
- ✅ Guest account (7-day trial)

---

### **Path B: USC EMAIL (Admin QR + Skip Card)**

| Stage | What Happens | USC Email Required? | USC Card in DB? |
|-------|--------------|---------------------|-----------------|
| 1. QR Scan | Detect admin code | ✅ | ❌ |
| 2. Welcome | Show USC popup | ✅ | ❌ |
| 3. Card Scan | User clicks "Skip" | ✅ | ❌ |
| 4. Name/Gender | Input USC email | ✅ **SHOWN** | ❌ |
| 5. Email Verify | Verify @usc.edu | ✅ | ❌ |
| 6. Selfie | Upload photo | ✅ | ❌ |
| 7. Video | Upload video | ✅ | ❌ |
| 8. Permanent | Create account | ✅ | ❌ |
| 9. Main | App active | ✅ | ❌ |

**Result**:
- ✅ USC email **REQUIRED** (fallback path)
- ✅ No USC card saved
- ✅ Regular account

---

### **Path C: REGULAR SIGNUP (Payment QR / No QR)**

| Stage | What Happens | USC Email Required? | Payment Required? |
|-------|--------------|---------------------|-------------------|
| 1. Name/Gender | No USC checks | ❌ | Later |
| 2. Selfie | Upload | ❌ | Later |
| 3. Video | Upload | ❌ | Later |
| 4. Paywall | Pay $5 | ❌ | ✅ |
| 5. Permanent | Optional email | ❌ | ✅ Paid |
| 6. Main | App active | ❌ | ✅ |

**Result**:
- ✅ No USC requirements
- ✅ Payment required
- ✅ Normal flow unchanged

---

## ✅ Fixed Issues Verification

### **Issue: "USC email required for this code"**

**Before (BUG)**:
```typescript
Admin QR detected → needsUSCCard=true
USC card scanned → uscId set, needsUSCEmail unchanged
Name page → needsUSCEmail still true → Shows email input ❌
```

**After (FIXED)**:
```typescript
Admin QR detected → needsUSCCard=true
USC card scanned → uscId set, needsUSCEmail=false ✅
Name page → if (!uscId) check email → Email hidden ✅
```

### **Security: Cannot Bypass Scanner**
```typescript
✅ Back button blocked (popstate trapped)
✅ Forward button blocked (history.pushState)
✅ Only way out: Complete scan or click "Skip" button
```

### **Security: Card Saved ONLY on Completion**
```typescript
✅ Scan → sessionStorage temp
✅ Name → Create guest (NO usc_id field)
✅ Selfie/Video → Complete onboarding
✅ Final step → Call /usc/finalize-registration
✅ Database INSERT happens HERE (not before)
✅ Abandoned → Temp cleared, card not blocked
```

---

## 📊 State Management Verification

### **State Variables**:
```typescript
uscId: string | null                // USC ID from card scan
needsUSCCard: boolean              // Admin QR requires card
needsUSCEmail: boolean             // Admin QR fallback or regular
uscEmail: string                   // USC email input value
```

### **State Transitions**:

**Admin QR Detected**:
```
needsUSCCard: false → true
needsUSCEmail: false (unchanged)
step: 'name' → 'usc-welcome'
```

**Card Scanned Successfully**:
```
uscId: null → '1268306021'
needsUSCCard: true → false  ✅
needsUSCEmail: ? → false    ✅ CRITICAL FIX
step: 'usc-scan' → 'name'
```

**Skip to Email**:
```
uscId: '1268306021' → null
needsUSCCard: true → false
needsUSCEmail: false → true  ✅
step: 'usc-scan' → 'name'
```

---

## ✅ Final Verification

**USC Card Path (Admin QR)**:
- ✅ USC email **HIDDEN** after card scan
- ✅ Card saved **ONLY** after completion
- ✅ Cannot bypass with back button
- ✅ Visual confirmation shown
- ✅ Guest account (7-day trial)

**USC Email Path (Fallback)**:
- ✅ USC email **SHOWN** if user skips scanner
- ✅ Email verification required
- ✅ Regular account flow

**Regular Path (Non-USC)**:
- ✅ No USC requirements
- ✅ Payment required
- ✅ Unchanged

**All Paths Verified**: ✅ NO CONFLICTS

