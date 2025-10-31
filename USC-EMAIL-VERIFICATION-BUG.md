USC EMAIL VERIFICATION BUG - COMPLETE ANALYSIS
==============================================

## THE BUG

User Flow:
1. Scans admin QR code
2. Enters USC email
3. Verification code sent
4. User backs out to main page
5. Clicks "Connect Now"
6. Gets access WITHOUT email verification ❌

## ROOT CAUSE

### What Happens:

Step 1: Admin QR Code
- User scans QR with admin invite code
- Onboarding detects admin code
- Sets needsUSCEmail = true
- Shows email input

Step 2: Email Sent
- User enters @usc.edu email
- POST /verification/send called
- Email stored in pending_email (not email field)
- Verification code sent

Step 3: User Backs Out
- User navigates away before entering code
- Session token exists in localStorage
- pending_email exists in database
- email_verified = false (NOT verified yet)

Step 4: User Returns
- Clicks "Connect Now" → /check-access
- check-access finds session token
- Calls /payment/status
- Returns paidStatus (might be 'qr_grace_period')
- check-access allows access ❌ BUG!

## THE PROBLEM

check-access/page.tsx only checks:
- paidStatus === 'paid' | 'qr_verified' | 'qr_grace_period'

It does NOT check:
- ❌ Is email verification pending?
- ❌ Is pending_email set but not verified?

---

## ALL EDGE CASES

### EDGE CASE 1: USC Email Verification Incomplete
Current: Allows access ❌
Should: Block until email verified ✅

### EDGE CASE 2: Regular Guest With Pending Email
Current: Allows access (no email required for guest) ✅
Should: Keep as-is (email optional for regular guest) ✅

### EDGE CASE 3: User Completes Email Verification Later
Current: Email verified, upgraded to permanent ✅
Should: Keep as-is ✅

### EDGE CASE 4: USC Admin Code With Verified Email
Current: Full access ✅
Should: Keep as-is ✅

### EDGE CASE 5: User Has Multiple Sessions
Current: Each session valid ❌
Should: Check pending_email in ALL checks ✅

---

## FIX REQUIRED

### Fix 1: Add pending_email to /payment/status response
```typescript
// server/src/payment.ts
res.json({
  paidStatus: user.paidStatus,
  // ...
  pendingEmail: user.pending_email, // ADD THIS
  emailVerified: user.email_verified, // ADD THIS (if column exists)
});
```

### Fix 2: Check pending_email in check-access
```typescript
// app/check-access/page.tsx
if (res.ok) {
  const data = await res.json();
  
  // CRITICAL: Block if has pending email verification
  if (data.pendingEmail && !data.emailVerified) {
    console.log('[CheckAccess] Pending email verification - redirecting to onboarding');
    router.push('/onboarding?resumeVerification=true');
    return;
  }
  
  const hasAccess = data.paidStatus === 'paid' || ...
}
```

### Fix 3: Check pending_email in onboarding protection
```typescript
// app/onboarding/page.tsx line 90
if (session && !hasInviteCode && !hasUscScan) {
  fetch('/payment/status')
    .then(data => {
      // Check pending email FIRST
      if (data.pendingEmail && !data.emailVerified) {
        // Has pending email - allow to complete verification
        console.log('[Onboarding] Pending email found - allowing access to complete');
        return; // Stay on onboarding
      }
      
      const hasAccess = data.paidStatus === ...
    })
}
```

### Fix 4: Resume email verification if pending
```typescript
// app/onboarding/page.tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const resume = params.get('resumeVerification');
  
  if (resume && pendingEmail) {
    setStep('email-verify'); // Go back to verification step
  }
}, []);
```

---

Implementing fixes...
