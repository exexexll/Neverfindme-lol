USC EMAIL VERIFICATION BYPASS - COMPLETE TRACE
==============================================

## User's Bypass Flow (Step by Step)

1. User scans admin QR code
   → URL: /onboarding?inviteCode=ADMINCODE

2. User enters name + USC email (e.g., test@usc.edu)
   → POST /auth/guest called
   → Account created with:
     - paidStatus: 'qr_grace_period'
     - pending_email: 'test@usc.edu'
     - email_verified: false
   → Session token saved to localStorage

3. User backs out (navigates to /)

4. User clicks "Connect Now" (or types /main directly)
   → Goes where?
   
   Option A: /check-access
   - My fix checks pendingEmail ✅
   - Should redirect to /onboarding ✅
   
   Option B: /main directly
   - ❌ BYPASS FOUND!
   
Let me check main/page.tsx...

---

## CHECKING app/main/page.tsx

Line 56-67:
```typescript
if (paymentData.accountType === 'guest' && paymentData.accountExpiresAt) {
  // Check expiry
}

const hasPaid = paymentData.paidStatus === 'paid' || 
                paymentData.paidStatus === 'qr_verified' || 
                paymentData.paidStatus === 'qr_grace_period'; // ❌ INCLUDES qr_grace_period!

if (!hasPaid) {
  router.push('/waitlist');
}
// ✅ User has qr_grace_period → hasPaid = true → ALLOWED IN!
```

❌ BUG FOUND: main/page.tsx doesn't check pending_email!

User with:
- paidStatus = 'qr_grace_period'
- pending_email = 'test@usc.edu'
- email_verified = false

Gets INTO the app without verifying email!

---

## THE FIX

main/page.tsx needs to check pending_email BEFORE allowing access:

```typescript
// CRITICAL: Check if email verification is pending
if (paymentData.pendingEmail && !paymentData.emailVerified) {
  console.log('[Main] Email verification pending - redirecting to onboarding');
  router.push('/onboarding');
  return;
}

const hasPaid = paymentData.paidStatus === 'paid' || 
                paymentData.paidStatus === 'qr_verified' || 
                paymentData.paidStatus === 'qr_grace_period';

if (!hasPaid) {
  router.push('/waitlist');
}
```

---

## OTHER FILES TO CHECK

Searching for all paidStatus checks...
