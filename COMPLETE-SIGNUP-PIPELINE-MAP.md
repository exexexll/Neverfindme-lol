COMPLETE SIGNUP PIPELINE - DETAILED MAP
========================================

## STARTING POINT: bumpin.io (Landing Page)

Page: app/page.tsx
Buttons:
- "Get Started" (line 44) → href="/check-access"
- "Log in" link (line 54) → href="/login"

---

## CHECKPOINT: /check-access

Page: app/check-access/page.tsx
Logic (line 16-67):
1. Check URL for inviteCode parameter
   - If exists → Redirect to /onboarding?inviteCode=X
   - If not → Check for existing session
2. Check existing session via /payment/status
   - If valid access → Redirect to /main
   - If pending email → Redirect to /onboarding
   - If no access → Redirect to /waitlist
3. Default → Redirect to /waitlist

---

## MAIN ENTRY: /waitlist

Page: app/waitlist/page.tsx

### Section 1: Waitlist Form (line 123-204)

Inputs:
- Full Name (line 133-143)
- Email (line 145-155)
- State dropdown (line 157-171)
- School (line 173-183)

Button: "Join Waitlist" (line 198-204)
Action: handleSubmit() → POST /waitlist/submit
Backend: server/src/waitlist.ts
- Rate limit check (3/hour/IP)
- Duplicate email check
- Insert into waitlist table
- Return success
Frontend Result: Shows success message, stays on waitlist page

──────── OR DIVIDER (line 202-206) ────────

### Section 2: USC Portal (line 208-225)

Title: "New USC Students - Sign Up"
Subtitle: "(First time users only)"

Button: "📱 Scan QR Code or Barcode to Sign Up" (line 219-224)
Action: onClick={() => setShowScanChoice(true)}
Result: Opens Scan Choice Modal

---

## MODAL 1: Scan Choice Modal (line 299-353)

Page: Still on /waitlist
Modal State: showScanChoice = true

Title: "Choose Scan Method"

### Option A: Scan QR Code Button (line 317-330)

Text: "📱 Scan QR Code"
Subtitle: "Admin QR from campus events"
Action: onClick={() => {
  setShowScanChoice(false);
  setShowQRScanner(true);
}}
Result: Opens QR Scanner Modal

### Option B: Scan USC Card Button (line 332-345)

Text: "🎓 Scan USC Card"
Subtitle: "Barcode on back of card"
Action: onClick={() => {
  setShowScanChoice(false);
  setShowBarcodeScanner(true);
}}
Result: Opens Barcode Scanner Modal

### Cancel Button (line 347-352)

Action: setShowScanChoice(false)
Result: Closes modal, back to waitlist

---

## MODAL 2A: QR Scanner Modal (line 236-258)

Page: Still on /waitlist
Component: AdminQRScanner
Modal State: showQRScanner = true

### QR Scanner Behavior:

Auto-starts camera (verbose: false)
Scanning logic (components/AdminQRScanner.tsx line 29-62):

1. Camera auto-requests on mount
2. Scans QR code
3. Check if URL:
   - Extract domain
   - Validate: napalmsky.com or bumpin.io
   - Extract inviteCode from URL params
4. Check if direct code (16 chars)
5. Validate format: /^[A-Z0-9]{16}$/

Success Callback (waitlist/page.tsx line 249-253):
```typescript
onScan={(inviteCode) => {
  console.log('[Waitlist] QR scanned:', inviteCode);
  setShowQRScanner(false);
  router.push(`/onboarding?inviteCode=${inviteCode}`);
}}
```

Result: Redirects to /onboarding?inviteCode=XXXXXXXXXXXXXXXX

---

## MODAL 2B: Barcode Scanner Modal (line 260-297)

Page: Still on /waitlist
Component: USCCardScanner
Modal State: showBarcodeScanner = true

### USC Card Scanner Behavior:

Full screen scanner (components/usc-verification/USCCardScanner.tsx)
- Quagga2 barcode scanner
- Optimized settings (16x faster)
- Scans CODABAR barcode
- Extracts USC ID (10 digits)

Success Callback (waitlist/page.tsx line 280-289):
```typescript
onSuccess={(uscId, rawValue) => {
  console.log('[Waitlist] USC card scanned:', uscId);
  setShowBarcodeScanner(false);
  sessionStorage.setItem('temp_usc_id', uscId);
  sessionStorage.setItem('temp_usc_barcode', rawValue);
  sessionStorage.setItem('usc_card_verified', 'true');
  router.push('/onboarding');
}}
```

Result: Redirects to /onboarding (no inviteCode in URL)

---

## DESTINATION: /onboarding

Page: app/onboarding/page.tsx

### Protection Check (line 77-146)

useEffect runs immediately:

1. Get inviteCode from URL: params.get('inviteCode')
2. Get stored invite: sessionStorage.getItem('onboarding_invite_code')
3. Get USC scan: sessionStorage.getItem('temp_usc_id')
4. Get email to verify: sessionStorage.getItem('usc_email_for_verification')
5. Get existing session: getSession()

Calculate access:
- hasInviteCode = inviteParam || storedInvite
- hasUscScan = tempUsc
- hasEmailToVerify = uscEmailForVerification

Check (line 99-108):
```typescript
if (!hasInviteCode && !hasUscScan && !session && !hasEmailToVerify) {
  console.log('[Onboarding] BLOCKED');
  router.push('/waitlist');
  return;
}
```

ALLOWED IF:
✅ QR code scanned (has inviteCode in URL)
✅ USC card scanned (has temp_usc_id in sessionStorage)
✅ Existing valid session
✅ Email to verify

---

## ONBOARDING STEP 1: Name & Gender (line 1147-1237)

Initial State: step = 'name'

UI Elements:
- Title: "What's your name?"
- Name input (line 1163-1172)
- Gender selection (line 1174-1215)
  * Female
  * Male  
  * Non-binary
  * Prefer not to say
- Terms checkbox (line 1217-1227)

Button: "Continue" (line 1229-1235)
Action: handleNameSubmit()

### handleNameSubmit() Function (line 351-480):

Validation:
1. Check name exists (line 352-355)
2. If no USC card: Check USC email if needed (line 358-372)
3. Check terms agreed (line 374-377)

API Call Logic:

#### Path A: USC Card User (line 386-407)
```typescript
if (uscId) {
  POST /auth/guest-usc {
    name, gender, 
    inviteCode: inviteCode || undefined
  }
}
```

Backend: server/src/auth.ts /guest-usc (line 463-612)
- NO invite code required (line 504-509: codeVerified = true)
- Creates guest account
- paidStatus: 'qr_verified'
- accountType: 'guest'
- Generates 4-use invite code
- Creates session
- Returns: { sessionToken, userId, accountType, myInviteCode }

#### Path B: Regular User (line 408-417)
```typescript
POST /auth/guest {
  name, gender, referralCode, inviteCode, uscEmail
}
```

Backend: server/src/auth.ts /guest (line 27-234)
- Requires inviteCode (line 43-50)
- Validates invite code
- Creates guest account
- paidStatus: depends on code type
- Returns session data

Frontend After API Success (line 418-467):
- Saves sessionToken and userId to state
- Saves session to localStorage
- Checks if needs to pay (line 438-444)
- Checks if email verification needed (line 459-463)
- Sets step = 'selfie' (line 467)

---

## ONBOARDING STEP 2: Selfie (line 1265-1343)

State: step = 'selfie'

UI Elements:
- Title: "Take a selfie"
- Video element (camera feed) (line 1287-1293)
- Canvas (hidden, for capture) (line 1286)

### If No Photo Captured:

Button: "Start camera" (line 1295-1301)
Action: startCamera()
- Requests camera permission
- Shows live feed

Button: "📸 Capture" (line 1303-1309)
Action: captureSelfie()
- Draws video to canvas
- Creates data URL
- Sets capturedPhoto state
- Pauses camera

### If Photo Captured:

Shows: Preview image (line 1266-1271)

Buttons (line 1314-1330):
1. "🔄 Retake" → retakePhoto()
   - Clears capturedPhoto
   - Resumes camera
2. "✓ Confirm & Upload" → confirmPhoto()
   - Converts canvas to blob
   - Compresses image
   - POST /user/selfie (uploadSelfie function)
   - Shows progress bar
   - On success: setStep('video')

---

## ONBOARDING STEP 3: Video (line 1355-1498)

State: step = 'video'

UI Elements:
- Title: "Record a short intro"
- Video element (camera feed or preview) (line 1366-1390)

### If No Video Recorded:

Button: "Start camera" → startCamera()
Button: "🔴 Start recording" → startRecording()
- Starts MediaRecorder
- Shows timer
- Records video

While Recording:
- Timer display (line 1441-1445)
- Button: "Stop recording" → stopRecording()
  - Stops MediaRecorder
  - Stops camera
  - Sets recordedChunks

### After Recording (preview):

useEffect creates preview (line 676-688):
- Creates blob from chunks
- Creates preview URL
- Sets videoPreviewUrl

Shows: Video preview with controls (line 1358-1363)

Buttons (line 1419-1447):
1. "🔄 Retake" → retakeVideo()
   - Clears chunks and preview
2. "✓ Confirm & Upload" → confirmVideo()
   - POST /user/video (uploadVideo function)
   - Shows progress bar
   - On success: setStep('permanent')

Skip Button (line 1482-1492):
- "Skip for now" → handleSkipVideo()
- Sets step = 'permanent'

---

## ONBOARDING STEP 4: Make Permanent (line 1504-1610)

State: step = 'permanent'

### USC User Path (has temp_usc_id):

UI (line 1521-1536):
- Message: "Add your USC email to upgrade"
- Blue box: "must use your @usc.edu email address"
- Label: "USC Email"
- Placeholder: "your@usc.edu"

### Regular User Path:

UI (line 1533-1536):
- Message: "Link an email and password"

### Form Inputs:

Email (line 1539-1550):
- Dynamic label (USC Email vs Email)
- Dynamic placeholder

Password (line 1552-1566):
- PasswordInput component
- Strength validation
- Real-time feedback

### Buttons (line 1590-1604):

Button 1: "Skip for now" / "Continue as Guest (7 days)" (line 1591-1596)
Action: handleSkip()

handleSkip Function (line 779-834):
1. If USC card user:
   - POST /usc/finalize-registration
   - Saves USC card to database
   - Links card to user account
2. Saves session to localStorage
3. Sets onboardingComplete = true
4. router.push('/main')

Button 2: "Make permanent" / "Upgrade to Permanent" (line 1597-1603)
Action: handleMakePermanent()

handleMakePermanent Function (line 856-899):
1. Validate email + password exists
2. USC user check (line 862-867):
   ```typescript
   if (tempUscId && !email.endsWith('@usc.edu')) {
     setError('Must use @usc.edu');
     return;
   }
   ```
3. Validate password strength
4. POST /verification/send → Sends 6-digit code
5. Sets showPermanentEmailVerify = true
6. Shows email verification UI

### Email Verification (line 1569-1581):

Component: EmailVerification
User enters 6-digit code
Callback: handlePermanentEmailVerified()

handlePermanentEmailVerified Function (line 794-852):
1. POST /auth/link { email, password }
   - Links email to account
   - Hashes password
   - Sets accountType: 'permanent'
2. If USC card user:
   - POST /usc/finalize-registration
   - Saves card to database
3. Saves session
4. Sets onboardingComplete = true
5. router.push('/main')

---

## FINAL DESTINATION: /main

Page: app/main/page.tsx
User is now in the main app!

---

## SUMMARY - TWO COMPLETE PATHS

### PATH 1: QR Code Scan
```
Waitlist → Click "Scan QR/Barcode" → Choose "QR Code" 
→ AdminQRScanner opens → Auto-requests camera → Scan QR 
→ Extract inviteCode → Close scanner 
→ Redirect /onboarding?inviteCode=X

Onboarding → Protection check (inviteCode in URL) → ALLOWED
→ Name & Gender → POST /auth/guest (with inviteCode)
→ Account created (qr_grace_period)
→ Photo → Upload selfie → POST /user/selfie
→ Video → Record & upload → POST /user/video
→ Permanent (optional):
  * Skip → handleSkip() → /main
  * Upgrade → Email + Password → Email verify → POST /auth/link → /main
```

### PATH 2: USC Card Scan
```
Waitlist → Click "Scan QR/Barcode" → Choose "USC Card"
→ USCCardScanner opens → Scan card barcode
→ Extract USC ID (12345678901)
→ Store in sessionStorage → Close scanner
→ Redirect /onboarding (no inviteCode)

Onboarding → Protection check (temp_usc_id in sessionStorage) → ALLOWED
→ Name & Gender → POST /auth/guest-usc (no inviteCode needed!)
→ Account created (qr_verified)
→ Photo → Upload selfie → POST /user/selfie
→ Video → Record & upload → POST /user/video
→ Permanent (optional):
  * Skip → POST /usc/finalize-registration → /main
  * Upgrade → USC Email + Password → Must be @usc.edu
    → Email verify → POST /auth/link
    → POST /usc/finalize-registration → /main
```

---

## API ENDPOINTS CALLED

1. POST /waitlist/submit (if user fills waitlist form)
2. POST /auth/guest (QR code users)
3. POST /auth/guest-usc (USC card users)
4. POST /user/selfie (photo upload)
5. POST /user/video (video upload)
6. POST /verification/send (permanent upgrade)
7. POST /verification/verify (email code)
8. POST /auth/link (link email + password)
9. POST /usc/finalize-registration (USC card users)

---

## COMPLETE BUTTON CLICK MAP

Waitlist Page:
- "Join Waitlist" → POST /waitlist/submit → Success message
- "Scan QR/Barcode" → Opens choice modal
- "📱 Scan QR Code" → Opens QR scanner → Scan → /onboarding?inviteCode=X
- "🎓 Scan USC Card" → Opens barcode scanner → Scan → /onboarding
- "Log in here" → /login page

Onboarding - Name:
- "Continue" → POST /auth/guest or /auth/guest-usc → Selfie step

Onboarding - Selfie:
- "Start camera" → Requests camera
- "📸 Capture" → Captures photo → Shows preview
- "🔄 Retake" → Clears photo → Shows camera
- "✓ Confirm" → POST /user/selfie → Video step

Onboarding - Video:
- "Start camera" → Requests camera
- "🔴 Start recording" → Records video
- "⏹ Stop recording" → Stops → Shows preview
- "🔄 Retake" → Clears video → Shows camera
- "✓ Confirm" → POST /user/video → Permanent step
- "Skip for now" → Permanent step

Onboarding - Permanent:
- "Skip for now" → POST /usc/finalize-registration (if USC) → /main
- "Make permanent" → POST /verification/send → Email verify UI
- (After email verify) Auto → POST /auth/link → /main

---

COMPLETE! All flows mapped! ✅
