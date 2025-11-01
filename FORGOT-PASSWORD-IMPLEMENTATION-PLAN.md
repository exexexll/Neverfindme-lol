FORGOT PASSWORD + LOGIN EMAIL VERIFICATION
===========================================

## FEATURES TO ADD

1. Forgot Password Link on Login Page
2. Password Reset Flow (email verification)
3. Email Verification Check on Login

## IMPLEMENTATION PLAN

### PART 1: Forgot Password

Flow:
1. Login page → "Forgot password?" link
2. Modal opens → Enter email
3. Backend sends reset code to email
4. User enters 6-digit code
5. User enters new password
6. Password reset → Can login

Frontend (app/login/page.tsx):
- Add state: showForgotPassword, resetEmail, resetCode, newPassword
- Add modal UI
- Add handleSendResetCode function
- Add handleResetPassword function

Backend (server/src/auth.ts):
- POST /auth/forgot-password → Send reset code
- POST /auth/reset-password → Verify code + update password

### PART 2: Email Verification on Login

Flow:
1. User tries to login
2. Backend checks: email_verified = false?
3. If not verified → Return special error
4. Frontend shows verification UI
5. User verifies email
6. Can then login normally

Backend (server/src/auth.ts /login):
- Check email_verified field
- Return error if false
- Error includes: requiresVerification: true

Frontend (app/login/page.tsx):
- Catch error
- If requiresVerification → Show EmailVerification component
- After verified → Auto-login or show success

## DATABASE REQUIREMENTS

Users table needs:
- email_verified (BOOLEAN) - Already exists ✅
- pending_email (TEXT) - Already exists ✅

Verification codes:
- Store in verification_codes table OR
- Use same /verification/send endpoint ✅

## FILES TO MODIFY

1. app/login/page.tsx - Add UI + handlers
2. server/src/auth.ts - Add forgot/reset routes
3. components/EmailVerification.tsx - Reuse existing

## ESTIMATE

Lines: ~200 lines
Files: 2 files
Time: 1 hour
Complexity: Medium (reusing email verification)
