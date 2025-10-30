EMAIL VERIFICATION FLOW - COMPLETE ANALYSIS
============================================

## Flow 1: Admin QR Code User (Non-USC Card)

### Step 1: Signup with Admin QR + USC Email
File: server/src/auth.ts line 119-145

```typescript
if (codeInfo?.type === 'admin') {
  paidStatus = 'qr_grace_period';  // Pending verification
  uscEmailForVerification = email?.toLowerCase();  // Store temporarily
}

const user: User = {
  accountType: 'guest',  // Starts as guest
  pending_email: uscEmailForVerification,  // Email NOT saved yet
  paidStatus: 'qr_grace_period',  // Needs verification
};
```

### Step 2: Email Verification
File: server/src/verification.ts line 105-120

```typescript
await store.updateUser(req.userId, {
  email: email.toLowerCase(),  // NOW save email
  email_verified: true,  // Mark as verified
  accountType: 'permanent',  // ✅ Upgrade to permanent
  paidStatus: isAdminCodeUser ? 'paid' : user.paidStatus,  // ✅ Upgrade to paid
  pending_email: null,  // Clear temporary storage
});
```

Result: ✅ User becomes permanent with verified email

---

## Flow 2: USC Card User (Admin QR + USC Card)

### Step 1: Signup with Admin QR + USC Card Scan
File: server/src/auth.ts line 500-507 (guest-usc route)

```typescript
const user: User = {
  userId,
  accountType: 'guest',  // Starts as guest
  paidStatus: codeVerified ? 'qr_verified' : 'unpaid',  // qr_verified
  accountExpiresAt: expiresAt.getTime(),  // 7 days
  // NO email set yet
};
```

### Step 2: Optionally Upgrade to Permanent
File: app/onboarding/page.tsx line 729-733

```typescript
const tempUscId = uscId || sessionStorage.getItem('temp_usc_id');
if (tempUscId && !email.trim().toLowerCase().endsWith('@usc.edu')) {
  setError('USC card users must use @usc.edu email address for permanent account');
  return;
}
```

### Step 3: Link Account (Make Permanent)
File: server/src/auth.ts line 240-320 (/auth/link)

```typescript
// SECURITY: Check if user has pending USC email
if (user.pending_email && user.pending_email.endsWith('@usc.edu')) {
  return error('You signed up with a USC email. Please verify that email instead.');
}

// SECURITY: Check if already has verified USC email
if (user.email && user.email.endsWith('@usc.edu') && user.email_verified) {
  return error('Your account is already linked to a USC email');
}

// Update to permanent
await store.updateUser(user.userId, {
  accountType: 'permanent',
  email,
  password_hash,
});
```

---

## ISSUE: USC Card Users Email Requirement

### Current Behavior:
1. USC card user signs up (guest, qr_verified) ✅
2. User wants to make permanent
3. Frontend REQUIRES @usc.edu email ✅
4. But backend /auth/link does NOT enforce @usc.edu ❌

### The Gap:
- Frontend checks: email.endsWith('@usc.edu') ✅
- Backend checks: MISSING for USC card users ❌

### Required Fix:
Backend /auth/link should check if user has uscId and require @usc.edu

---

## Email Verification After Permanent

### Issue: Can email expire?

Currently:
- email_verified is set to TRUE on verification ✅
- Never expires ✅
- No re-verification required ✅

Should it expire?
- Security best practice: Re-verify annually
- Current implementation: No expiry
- Recommendation: Add email_verified_at timestamp

---

Checking if USC card permanent upgrade enforces @usc.edu...
