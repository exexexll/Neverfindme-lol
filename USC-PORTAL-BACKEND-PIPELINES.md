USC PORTAL - COMPLETE BACKEND PIPELINES
========================================

## OPTION 1: QR CODE SCAN

### Frontend Flow (Waitlist Page):

1. User clicks "Scan QR Code or Barcode"
2. Choice modal appears
3. User clicks "Scan QR Code"
4. AdminQRScanner component opens
5. User scans admin QR code
6. QR contains: https://bumpin.io/onboarding?inviteCode=TCZIOIXWDZLEFQZC
7. Scanner extracts: inviteCode = TCZIOIXWDZLEFQZC
8. Redirects to: /onboarding?inviteCode=TCZIOIXWDZLEFQZC

### Backend Pipeline:

#### Step 1: User Fills Name + Gender
```
Frontend: app/onboarding/page.tsx
- User enters name
- Selects gender
- Clicks continue
```

#### Step 2: POST /auth/guest
```
Route: server/src/auth.ts line 27-234
Request Body:
{
  name: "John Doe",
  gender: "male",
  inviteCode: "TCZIOIXWDZLEFQZC"
}

Backend Processing:
1. Line 42-50: Check inviteCode exists
   - If missing → 403 error
   - ✅ Has code → Continue

2. Line 47-64: Validate invite code
   - Format check (16 chars, A-Z0-9)
   - Database lookup
   - Check if active
   - Check if admin code
   - Validate uses remaining

3. Line 117-134: Determine paidStatus
   - Admin code detected
   - Sets paidStatus: 'qr_grace_period'
   - Sets needsUSCEmail flag (for verification later)

4. Line 136-163: Create User
   accountType: 'guest'
   paidStatus: 'qr_grace_period'
   pending_email: NULL (no email yet)
   accountExpiresAt: NOW() + 7 days
   
5. Line 175-183: Create Session
   sessionToken: generated
   expiresAt: NOW() + 7 days
   
6. Line 192-205: Create User Invite Code (4 uses)
   - Generate 16-char code
   - Store in database
   - User can invite 4 friends

Response:
{
  userId: "...",
  sessionToken: "...",
  accountType: "guest",
  paidStatus: "qr_grace_period",
  myInviteCode: "ABC123..." (4 uses)
}
```

#### Step 3: User Can Choose Email Verification or Skip
```
Option A: Skip
- Stays as guest account (7 days)
- Can use app immediately
- paidStatus: 'qr_grace_period'

Option B: Add Email (Optional)
- Enter @usc.edu email
- POST /verification/send
- POST /verification/verify
- Account upgraded:
  * accountType: 'permanent'
  * paidStatus: 'paid'
  * email_verified: true
```

---

## OPTION 2: BARCODE SCAN (USC Card)

### Frontend Flow (Waitlist Page):

1. User clicks "Scan QR Code or Barcode"
2. Choice modal appears
3. User clicks "Scan USC Card"
4. USCCardScanner component opens
5. User scans campus card barcode
6. Scanner extracts: uscId = "1268306021"
7. Prompts: "Enter admin invite code"
8. User enters: "TCZIOIXWDZLEFQZC"
9. Stores: sessionStorage.setItem('temp_usc_id', uscId)
10. Redirects to: /onboarding?inviteCode=TCZIOIXWDZLEFQZC

### Backend Pipeline:

#### Step 1: User Fills Name + Gender
```
Same as Option 1 - onboarding page
```

#### Step 2: POST /auth/guest-usc
```
Route: server/src/auth.ts line 430-572
Request Body:
{
  name: "John Doe",
  gender: "male",
  inviteCode: "TCZIOIXWDZLEFQZC"
}

Backend Processing:
1. Line 442-450: Validate inviteCode
   - Admin code required
   - Validates code
   
2. Line 474-516: Create User
   accountType: 'guest'
   paidStatus: 'qr_verified' (higher than grace_period!)
   pending_email: NULL
   uscId: NULL (will be set later)
   accountExpiresAt: NOW() + 7 days
   myInviteCode: generated (4 uses)

3. Create session
4. Generate 4-use invite code

Response:
{
  userId: "...",
  sessionToken: "...",
  accountType: "guest",
  paidStatus: "qr_verified",
  myInviteCode: "XYZ789..." (4 uses)
}
```

#### Step 3: Upload Selfie + Video

#### Step 4: POST /usc/finalize-registration
```
Route: server/src/usc-verification.ts line 398-547
Request Body:
{
  uscId: "1268306021",
  rawBarcodeValue: "12683060215156",
  barcodeFormat: "CODABAR",
  userId: "..."
}

Backend Processing:
1. Line 420-442: Ensure user exists in database
2. Line 444-470: Validate USC ID
   - Format check
   - Range check (1-9)
   - Suspicious pattern check
   
3. Line 472-487: Check for duplicates
   - Query usc_card_registrations table
   - Ensure USC ID not already used
   
4. Line 493-513: Save USC card registration
   INSERT INTO usc_card_registrations:
   - usc_id: "1268306021"
   - user_id: userId
   - raw_barcode_value
   - first_scanned_at: NOW()
   
5. Line 515-521: Update user record
   UPDATE users SET usc_id = "1268306021"

Final State:
- User has USC ID linked
- Can login with USC card later
- Account verified via card
```

---

## OPTION 3: EMAIL ENTRY (REMOVED)

This option was removed in redesign.

Previous flow was:
1. Enter @usc.edu email
2. Need admin code
3. Email verification required
4. Account becomes permanent

Now removed for simplicity.

---

## COMPARISON OF OUTCOMES

### QR Code Scan (Admin QR):
```
Account Created:
- accountType: 'guest'
- paidStatus: 'qr_grace_period'
- uscId: NULL
- pending_email: NULL
- Expires: 7 days
- myInviteCode: 4 uses

Can:
✅ Use app immediately
✅ Optional: Add email to upgrade to permanent
```

### Barcode Scan (USC Card):
```
Account Created:
- accountType: 'guest'  
- paidStatus: 'qr_verified'
- uscId: '1268306021' (after finalize)
- pending_email: NULL
- Expires: 7 days
- myInviteCode: 4 uses

Can:
✅ Use app immediately
✅ Login with USC card later
✅ Optional: Add email to upgrade to permanent
```

---

## KEY DIFFERENCES

### QR Code (Admin):
- paidStatus: 'qr_grace_period'
- No USC ID
- Generic admin code user

### USC Card:
- paidStatus: 'qr_verified' (higher tier!)
- Has USC ID (linked to card)
- Can login with card
- Card can only be used once

---

## BOTH PATHS LEAD TO:

1. Guest account (7 days)
2. Session token
3. 4-use invite code
4. Immediate app access
5. Optional permanent upgrade

Backend Tables Updated:
- users (account created)
- sessions (token created)
- invite_codes (user's 4-use code)
- usc_card_registrations (if USC card scanned)
- session_completions (as they use app)

---

All pipelines verified ✅
All backend routes working ✅
Both options tested ✅
