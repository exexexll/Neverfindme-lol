PERMANENT UPGRADE PIPELINE - DEBUGGING
=======================================

Issue: Account stays 'guest' after email verification

## EXPECTED FLOW

Step 1: User clicks "Make Permanent"
- Enter email + password
- handleMakePermanent() called

Step 2: Frontend sends verification code
- POST /verification/send
- Backend sends 6-digit code

Step 3: User enters code
- EmailVerification component
- onVerified callback triggers

Step 4: Frontend links account
- handlePermanentEmailVerified() or similar
- POST /auth/link { email, password }

Step 5: Backend should:
- Verify code
- Hash password
- Update user:
  * accountType: 'permanent' ← CRITICAL
  * email: verified email
  * email_verified: true
  * password_hash: hashed password

Step 6: Account upgraded ✅

## CHECKING ACTUAL CODE

Location 1: Onboarding Permanent Upgrade
File: app/onboarding/page.tsx
Handler: handleMakePermanent (line ~856)
Handler: handlePermanentEmailVerified (line ~794)

Location 2: Settings Permanent Upgrade  
File: app/settings/page.tsx
Handler: handleMakePermanent
Handler: handleVerifyAndUpgrade

Location 3: Backend
File: server/src/auth.ts
Route: POST /auth/link

Need to check:
1. Does /auth/link set accountType: 'permanent'?
2. Does frontend save updated session?
3. Does database actually update?

Checking now...

## ISSUE FOUND!

Conflicting upgrade logic:

Route 1: /verification/verify (verification.ts line 109)
- Sets accountType: 'permanent' ✅
- Sets email_verified: true ✅
- But does NOT hash password! ❌

Route 2: /auth/link (auth.ts line 329)
- Expects accountType: 'guest'
- Line 272: Returns error if already permanent! ❌
- Hashes password ✅
- Sets accountType: 'permanent' ✅

Problem:
========
1. User verifies email → /verification/verify
2. Account becomes 'permanent' (no password yet)
3. Frontend calls /auth/link
4. Backend sees accountType === 'permanent'
5. Returns error "Already permanent"
6. Password never set!

Or alternatively:
1. /verification/verify doesn't actually save to database?
2. Account stays 'guest'?
3. Need to check database logs

Solution Options:
=================

Option A: /auth/link should accept pending_email && email_verified
- Check if email just verified
- Allow linking password even if already permanent
- Update password_hash

Option B: /verification/verify should also hash password
- Accept password in request
- Hash and save in same transaction
- No need for separate /auth/link call

Option C: Frontend calls in wrong order
- Should call /auth/link BEFORE /verification/verify?
- Or call different endpoint?

Checking frontend flow now...
