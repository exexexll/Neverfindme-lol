COMPLETE ONBOARDING FLOW ANALYSIS - FINDING ALL GAPS
====================================================

## ALL POSSIBLE ONBOARDING PATHS

### PATH 1: Friend Invite Code (User QR)
==========================================
1. User scans friend's QR → /onboarding?inviteCode=USER16CHARS
2. onboarding protection: Has inviteCode → ALLOWED
3. User enters name + gender
4. POST /auth/guest with inviteCode
5. Backend validates code (user type)
6. Account created:
   - paidStatus: 'qr_grace_period'
   - pending_email: NULL
   - Account type: guest
7. Upload selfie + video
8. Can SKIP or make permanent
9. If skip → Session saved, redirect to main
10. Main checks: paidStatus = qr_grace_period → ALLOWED ✅

GAPS TO CHECK:
- ❓ Does pending_email stay NULL? (no email required for friend invite)
- ❓ Can they access app?

VERIFICATION: ✅ SHOULD WORK (no email required for regular guest)

---

### PATH 2: USC Card User (Admin QR + Barcode)
==============================================
1. User scans admin QR → /onboarding?inviteCode=ADMIN16CHARS
2. onboarding protection: Has inviteCode → ALLOWED
3. Admin code detected → Shows USC welcome popup
4. User clicks "Scan Card"
5. USC card barcode scanned → uscId extracted
6. User enters name + gender
7. POST /auth/guest-usc with inviteCode
8. Backend validates admin code
9. Account created:
   - paidStatus: 'qr_verified'
   - pending_email: NULL (no email entered)
   - uscId: '1268306021'
   - Account type: guest
10. Upload selfie + video
11. Can SKIP or make permanent
12. If skip → Session saved, redirect to main
13. Main checks: 
    - pending_email = NULL ✅
    - paidStatus = qr_verified → ALLOWED ✅

GAPS TO CHECK:
- ❓ Does this bypass email completely?
- ❓ Can they upgrade later with any email?

VERIFICATION: 
✅ Should work (email optional for USC card path)
⚠️ MUST enforce @usc.edu when they upgrade to permanent

---

### PATH 3: Admin QR + Email (No Card Scan)
===========================================
1. User scans admin QR → /onboarding?inviteCode=ADMIN16CHARS
2. Admin code detected → Shows USC welcome popup
3. User clicks "Skip to Email Verification"
4. Sets: needsUSCEmail = true, uscId = null
5. User enters name + USC email
6. POST /auth/guest with inviteCode + email
7. Backend: Admin code detected + email provided
8. Account created:
   - paidStatus: 'qr_grace_period'
   - pending_email: 'user@usc.edu'
   - uscId: NULL
   - Account type: guest
9. Verification code sent to email
10. User must enter 6-digit code

CRITICAL: What if user backs out here?

11a. User backs out → Goes to main
    - Main checks pending_email → MY FIX redirects to onboarding ✅

11b. User enters code correctly
    - POST /verification/verify
    - Updates:
      * email: 'user@usc.edu'
      * email_verified: true
      * accountType: 'permanent'
      * paidStatus: 'paid'
      * pending_email: NULL
    - Redirect to selfie

GAPS TO CHECK:
- ❓ What if they type /main before verifying?
- ✅ FIXED: main checks pending_email

---

### PATH 4: Existing User Returning
===================================
1. User has session in localStorage
2. Clicks "Connect Now" → /check-access
3. check-access finds session
4. Calls /payment/status
5. Checks pending_email

Case A: No pending email
- paidStatus checked → Has access → /main ✅

Case B: Has pending email
- ✅ MY FIX: Redirects to /onboarding
- Sets email + step to email-verify
- User completes verification

VERIFICATION: ✅ FIXED

---

### PATH 5: User Mid-Onboarding Refresh
======================================
1. User on selfie step
2. Refreshes page
3. onboarding protection runs:
   - inviteCode: Might be in sessionStorage
   - session: Exists in localStorage
   
4. What happens?
   - Line 80: hasInviteCode = stored invite OR null
   - Line 81: hasUscScan = temp_usc_id OR null
   - Line 75: session = exists
   - Line 83: if (!hasInviteCode && !hasUscScan && !session) → FALSE
   - Line 90: if (session && !hasInviteCode && !hasUscScan) → TRUE
   - Checks /payment/status
   - If pending_email → Stays on onboarding ✅
   - If has access → Blocks redirect ✅

GAPS:
- ❓ What if they already uploaded selfie but not video?
- ❓ What if they're on permanent step?

VERIFICATION: Need to check if session check blocks legitimate flows

---

## POTENTIAL GAPS FOUND

### GAP 1: history/page.tsx, refilm/page.tsx, tracker/page.tsx
All 3 files check hasPaid but NOT pending_email!

User with pending email could:
- Access history page ❌
- Access refilm page ❌  
- Access tracker page ❌

FIX NEEDED: Add pending_email check to all 3 files

---

### GAP 2: Session Check Too Aggressive?
onboarding line 90: if (session && !hasInviteCode && !hasUscScan)

Scenario: User mid-onboarding, has session, refreshes
- inviteCode might be in sessionStorage (hasInviteCode = true)
- If not, goes to API check
- Could redirect to waitlist mid-onboarding?

FIX NEEDED: Check onboarding step/progress before redirecting

---

### GAP 3: paywall/page.tsx redirect
Line 48: router.push('/paywall')

Should be: router.push('/waitlist')

---

Implementing fixes for all gaps...
