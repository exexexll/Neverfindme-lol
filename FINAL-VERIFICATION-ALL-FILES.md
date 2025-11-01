FINAL VERIFICATION - ALL MODIFIED FILES
========================================

## FILES MODIFIED (2)

1. components/EmailVerification.tsx
2. server/src/auth.ts

## FILE 1: components/EmailVerification.tsx

Changes:
========

Line 20-21: Added resend attempt tracking
- resendAttempts state
- MAX_RESEND_ATTEMPTS = 3

Line 40-43: Check attempt limit before sending
- Blocks if >= 3 attempts
- Shows error message

Line 65-66: Increment counter on send
- Tracks each resend
- Logs attempt number

Line 169-176: Update resend button
- Shows counter (1/3, 2/3, 3/3)
- Disabled after 3 attempts
- Visual feedback

Result: ✅ 3-attempt limit enforced
Applies to: ALL email verification flows
- Onboarding permanent upgrade
- Settings account upgrade
- Waitlist USC email signup
- Forgot password (future)

## FILE 2: server/src/auth.ts

Changes:
========

Line 609-649: POST /forgot-password
- Accepts: email
- Finds user by email
- Check 3-attempt limit (verification_attempts)
- Generate 6-digit code
- Store in user.verification_code
- Set expiry (10 min)
- Send via SendGrid
- Increment verification_attempts
- Returns success

Line 651-707: POST /reset-password
- Accepts: email, code, newPassword
- Find user by email
- Verify code matches user.verification_code
- Check expiry
- Validate password strength (8+ chars, upper, lower, number, special)
- Hash with bcrypt (10 rounds)
- Update user.password_hash
- Clear verification fields
- Reset attempts to 0
- Returns success

Security:
=========
✅ Uses existing verification system (user.verification_code)
✅ 3-attempt limit (user.verification_attempts)
✅ Code expiry (10 minutes)
✅ Strong password validation
✅ bcrypt hashing
✅ Doesn't reveal if email exists
✅ Clears code after use

## VERIFICATION CHECKLIST

Backend:
✅ Compiles successfully (tsc)
✅ No TypeScript errors
✅ Uses correct field names (password_hash not password)
✅ Uses existing store methods
✅ 3-attempt limit implemented
✅ Code stored in user object
✅ Reuses verification system

Frontend:
✅ Compiles successfully
✅ No React errors
✅ EmailVerification component updated
✅ Login page has forgot password link
✅ Login page has reset modal
✅ 3-attempt limit shown in UI

Flow:
✅ Login → Forgot password? → Enter email
✅ Backend sends code (max 3x)
✅ Enter code + new password
✅ Password validated & reset
✅ Can login with new password

Integration:
✅ Reuses EmailVerification component
✅ Reuses verification_code fields
✅ Reuses SendGrid setup
✅ Consistent with existing patterns

All files verified ✅
Ready to commit ✅
