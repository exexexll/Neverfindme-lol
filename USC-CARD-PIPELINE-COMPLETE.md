USC CARD ONBOARDING PIPELINE - COMPLETE STAGE ANALYSIS
======================================================

STAGE 1: Admin QR Detection
----------------------------
File: app/onboarding/page.tsx (line 146-163)

Actions:
✅ setInviteCode(invite) - Save admin QR code
✅ fetch('/payment/validate-code') - Check if admin code
✅ setNeedsUSCCard(true) - Flag USC requirement
✅ setNeedsUSCEmail(false) - Turn OFF email requirement
✅ setStep('usc-welcome') - Go to welcome popup

Storage:
- inviteCode: In state only
- USC card: NOT stored yet ✓

---

STAGE 2: USC Welcome Popup
---------------------------
File: app/onboarding/page.tsx (line 870-876)

Actions:
✅ Show USC-branded welcome screen
✅ onClick: setStep('usc-scan')

Storage:
- USC card: NOT stored yet ✓

---

STAGE 3: USC Card Scanner
--------------------------
File: app/onboarding/page.tsx (line 878-896)

Actions (line 879-893):
✅ Scanner detects barcode: "12683060215156"
✅ Calls /usc/verify-card endpoint
✅ Backend validates (8 layers)
✅ Backend LOGS to usc_scan_attempts (audit only)
✅ onSuccess callback:
   - setUscId(scannedUSCId) - State variable
   - sessionStorage.setItem('temp_usc_id') - TEMPORARY storage
   - sessionStorage.setItem('temp_usc_barcode') - TEMPORARY storage
   - sessionStorage.setItem('usc_card_verified', 'true') - Flag
✅ setStep('name') - Proceed to name/gender

Storage:
- USC card: sessionStorage ONLY (temporary) ✓
- Database: usc_scan_attempts (audit log) ✓
- Database: usc_card_registrations: EMPTY ✓ CORRECT

---

STAGE 4: Name + Gender Submission
----------------------------------
File: app/onboarding/page.tsx (line 308-327)

Actions:
✅ if (uscId) - Check if card scanned
✅ POST /auth/guest-usc
   Body: { name, gender, inviteCode }
   ❌ NO uscId sent
✅ Backend creates user (memory + PostgreSQL)
✅ paidStatus: 'qr_verified' (admin code verified)
✅ Response: { sessionToken, userId, accountType: 'guest' }

Storage:
- USC card: sessionStorage ONLY ✓
- Database: users table (user created)
- Database: usc_card_registrations: STILL EMPTY ✓ CORRECT

---

STAGE 5: Selfie
----------------
File: app/onboarding/page.tsx (line 426-457)

Actions:
✅ Camera starts (500ms delay after scanner release)
✅ Capture selfie
✅ Upload to Cloudinary
✅ setStep('video')

Storage:
- USC card: sessionStorage ONLY ✓
- Database: usc_card_registrations: STILL EMPTY ✓ CORRECT

---

STAGE 6: Video
---------------
File: app/onboarding/page.tsx (line 613-622)

Actions:
✅ Record video
✅ Upload to Cloudinary
✅ setStep('permanent')

Storage:
- USC card: sessionStorage ONLY ✓
- Database: usc_card_registrations: STILL EMPTY ✓ CORRECT

---

STAGE 7A: Skip (Continue as Guest)
-----------------------------------
File: app/onboarding/page.tsx (line 652-705)

Actions:
Line 653-654: Check if USC card scanned
  const tempUscId = uscId || sessionStorage.getItem('temp_usc_id')
  if (tempUscId) {

Line 658-673: ✅✅✅ CRITICAL - USC CARD SAVED HERE
  POST /usc/finalize-registration
  Body: { uscId: tempUscId, rawBarcodeValue, barcodeFormat, userId }
  
Backend (server/src/usc-verification.ts line 373):
  ✅ BEGIN transaction
  ✅ Check duplicate (SELECT FOR UPDATE)
  ✅ INSERT INTO usc_card_registrations
  ✅ UPDATE users SET usc_id = $1
  ✅ COMMIT transaction

Line 680: sessionStorage.removeItem('temp_usc_id')
Line 681: sessionStorage.removeItem('temp_usc_barcode')

Line 699: router.push('/main')

Storage:
- USC card: ✅✅✅ NOW IN DATABASE (usc_card_registrations)
- sessionStorage: CLEARED ✓
- User: usc_id field SET ✓

---

STAGE 7B: Make Permanent (Add Email)
-------------------------------------
File: app/onboarding/page.tsx (line 716-801)

Actions:
Line 760: linkAccount(sessionToken, email, password)

Line 762-789: ✅✅✅ CRITICAL - USC CARD SAVED HERE TOO
  const tempUscId = uscId || sessionStorage.getItem('temp_usc_id')
  if (tempUscId) {
    POST /usc/finalize-registration
    (Same as Stage 7A)
  }

Line 799: router.push('/main')

Storage:
- USC card: ✅✅✅ NOW IN DATABASE
- sessionStorage: CLEARED ✓

---

VERIFICATION - USC CARD SAVED ONLY AFTER COMPLETION
====================================================

✅ Scanner: NOT saved to usc_card_registrations
✅ Name/Gender: NOT saved to usc_card_registrations  
✅ Selfie: NOT saved to usc_card_registrations
✅ Video: NOT saved to usc_card_registrations
✅ ONLY AFTER clicking Skip OR Make Permanent: SAVED ✓✓✓

If user abandons onboarding:
- sessionStorage has temp data
- Database usc_card_registrations: EMPTY ✓
- USC card NOT blocked ✓
- User can try again ✓

SessionStorage Mechanism:
=========================
Set at scan (line 888-890):
- temp_usc_id: "1268306021"
- temp_usc_barcode: "12683060215156"
- usc_card_verified: "true"

Used at finalize (line 653-654, 762-763):
- Read temp_usc_id
- Read temp_usc_barcode
- Send to backend

Cleared after save (line 680-681, 791-792):
- Remove temp_usc_id
- Remove temp_usc_barcode
- Remove usc_card_verified

✅ PERFECT - USC card only saved when user completes onboarding!
