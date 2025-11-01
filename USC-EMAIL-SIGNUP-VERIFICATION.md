USC EMAIL SIGNUP - COMPLETE FLOW VERIFICATION
==============================================

## BUTTON LOCATION

File: components/usc-verification/USCCardScanner.tsx
Line: 500-505

Button Text: "Skip - Use Email Verification Instead"
Location: Bottom of USC card scanner page
Visible: Always (below scanning tips)

## COMPLETE FLOW

Step 1: Waitlist Page
- User clicks "📱 Scan to Sign Up"

Step 2: Choice Modal Opens
- Two options:
  * Scan QR Code
  * Scan USC Card ← User clicks this

Step 3: USC Card Scanner Opens (Full Screen)
- Camera view in center
- Flashlight button (top right)
- Scanning tips (bottom)
- Button at very bottom: "Skip - Use Email Verification Instead"

Step 4: User Clicks "Skip - Use Email Verification Instead"
- Triggers: onSkipToEmail callback (line 501)
- Waitlist handler (line 319-323):
  ```typescript
  onSkipToEmail={() => {
    setShowBarcodeScanner(false);  // Close scanner
    setShowEmailSignup(true);      // Open email modal
  }}
  ```

Step 5: Email Signup Modal Opens
- Title: "Sign Up with USC Email"
- Field 1: USC Email (your@usc.edu)
- Field 2: Password (with strength validation)
- Buttons: Cancel, Send Code

Step 6: User Enters Email + Password
- Email validation: Must end with @usc.edu
- Password validation: 8+ chars, upper, lower, number, special
- Real-time feedback

Step 7: Click "Send Code"
- handleEmailSignup runs (line 51-111)
- POST /auth/guest-usc { name: 'User', gender: 'unspecified' }
- Backend creates account, returns sessionToken
- POST /verification/send { email }
- Backend sends 6-digit code to email
- Modal switches to verification UI

Step 8: Email Verification UI Shows
- Message: "We sent a 6-digit code to your@usc.edu"
- EmailVerification component
- 6-digit code input

Step 9: User Enters Code
- POST /verification/verify { code }
- Backend validates code
- Triggers handleEmailVerified (line 113-151)

Step 10: Account Linked
- POST /auth/link { email, password }
- Account upgraded to permanent
- saveSession({ sessionToken, userId, accountType: 'permanent' })
- Redirect: router.push('/onboarding')

Step 11: Onboarding
- Has session → Protection allows access
- Step: Name (updates 'User' to real name)
- Step: Photo
- Step: Video  
- Skip permanent (already permanent from email)
- Redirect to /main

## VERIFICATION CHECKLIST

✅ Button exists in USC scanner (line 500-505)
✅ Callback triggers email modal (line 319-323)
✅ Email modal has full UI (line 432-513)
✅ Email validation (@usc.edu required)
✅ Password validation (PasswordInput component)
✅ Email verification (EmailVerification component)
✅ Account creation (POST /auth/guest-usc)
✅ Code sending (POST /verification/send)
✅ Code verification (POST /verification/verify)
✅ Account linking (POST /auth/link)
✅ Session saving
✅ Onboarding redirect

## BACKEND SUPPORT

✅ /auth/guest-usc accepts temp name/gender (line 469-473)
✅ /verification/send works with sessionToken
✅ /verification/verify works
✅ /auth/link upgrades account

## TESTING STEPS

1. Go to bumpin.io/waitlist
2. Click "Scan to Sign Up"
3. Click "Scan USC Card"
4. Scroll down
5. Click "Skip - Use Email Verification Instead"
6. See email signup modal
7. Enter @usc.edu email + password
8. Click "Send Code"
9. Check email for 6-digit code
10. Enter code
11. Should redirect to onboarding

Expected: WORKS ✅
Actual: Need to test
