QR CODE SHARING RULES - ALL COMBINATIONS
=========================================

## NEW REQUIREMENTS

ONLY permanent users with verified email can share QR codes.
Guest account users (even with USC card) CANNOT share.

---

## ALL POSSIBLE USER STATUS COMBINATIONS

### Group 1: Guest Accounts (NO QR CODE SHARING)
-------------------------------------------------

1. Guest + USC Card + Admin QR Code
   - account_type: 'guest'
   - paid_status: 'qr_verified'
   - email: NULL
   - email_verified: NULL
   - my_invite_code: EXISTS (currently)
   - Decision: ❌ REMOVE QR code (guest can't share)

2. Guest + User Invite Code
   - account_type: 'guest'
   - paid_status: 'qr_grace_period'
   - email: NULL
   - email_verified: NULL
   - my_invite_code: EXISTS (currently)
   - Decision: ❌ REMOVE QR code (guest can't share)

3. Guest + No Code (Unpaid)
   - account_type: 'guest'
   - paid_status: 'unpaid'
   - email: NULL
   - email_verified: NULL
   - my_invite_code: NULL
   - Decision: ❌ No QR code (correct)

### Group 2: Permanent Accounts (CAN SHARE QR CODE)
---------------------------------------------------

4. Permanent + Paid via Stripe
   - account_type: 'permanent'
   - paid_status: 'paid'
   - email: EXISTS
   - email_verified: TRUE (required for payment)
   - my_invite_code: EXISTS
   - Decision: ✅ SHOW QR code (4 uses)

5. Permanent + Admin QR + Email Verified
   - account_type: 'permanent'
   - paid_status: 'qr_verified'
   - email: EXISTS (@usc.edu)
   - email_verified: TRUE
   - my_invite_code: EXISTS
   - Decision: ✅ SHOW QR code (4 uses)

6. Permanent + User Invite Code + Email Added
   - account_type: 'permanent'
   - paid_status: 'qr_grace_period' or 'qr_verified'
   - email: EXISTS
   - email_verified: TRUE
   - my_invite_code: EXISTS
   - Decision: ✅ SHOW QR code (4 uses)

### Group 3: Edge Cases
-----------------------

7. Permanent + Email NOT Verified
   - account_type: 'permanent'
   - paid_status: ANY
   - email: EXISTS
   - email_verified: FALSE
   - my_invite_code: EXISTS
   - Decision: ❌ NO QR code (email not verified)

8. Guest + Email Pending Verification
   - account_type: 'guest'
   - paid_status: ANY
   - pending_email: EXISTS
   - email_verified: FALSE
   - my_invite_code: NULL or EXISTS
   - Decision: ❌ NO QR code (still guest)

---

## IMPLEMENTATION LOGIC

### Backend (server/src/auth.ts)

Current (WRONG):
```typescript
// Line 75-95: Regular guest route
if (codeVerified) {
  newUserInviteCode = generate16CharCode(); // ❌ WRONG for guests
}

// Line 476-486: USC guest route  
if (codeVerified) {
  newUserInviteCode = generate16CharCode(); // ❌ WRONG for guests
}
```

New (CORRECT):
```typescript
// NEVER generate codes for guest accounts
// Only generate when account becomes permanent + email verified
```

### Frontend (app/settings/page.tsx)

Current (WRONG):
```typescript
// Line 245: Shows for qr_verified
{paymentStatus.paidStatus === 'qr_verified' && paymentStatus.myInviteCode && (
```

New (CORRECT):
```typescript
// Only show if:
// 1. account_type === 'permanent' AND
// 2. email_verified === true AND  
// 3. myInviteCode exists
{paymentStatus.accountType === 'permanent' && 
 paymentStatus.emailVerified && 
 paymentStatus.myInviteCode && (
```

---

## REQUIRED CHANGES

1. ✅ Stop generating invite codes for guest accounts
2. ✅ Only generate codes when upgrading to permanent
3. ✅ Require email verification for QR code sharing
4. ✅ Update frontend QR code visibility logic
5. ✅ Add email_verified to /payment/status response

---

Proceeding with implementation...
