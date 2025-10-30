USC CARD USER PIPELINE - COMPLETE TRACE
========================================

## DATABASE STATUS ✅ CORRECT

User: "ukjhk"
- account_type: guest ✅
- paid_status: qr_verified ✅
- email: NULL ✅
- account_expires_at: 2025-11-06 ✅
- my_invite_code: UWJT193HKRQ525I0 ✅

## PIPELINE TRACE

### Step 1: User Creation (POST /auth/guest-usc)
File: server/src/auth.ts line 500-507

```typescript
const user: User = {
  userId,
  name: name.trim(),
  gender,
  accountType: 'guest',  // ✅ CORRECT
  // ...
  paidStatus: codeVerified ? 'qr_verified' : 'unpaid', // ✅ CORRECT
  accountExpiresAt: expiresAt.getTime(), // ✅ CORRECT
};
```

**Result:** User created as GUEST ✅

### Step 2: Payment Status Endpoint (GET /payment/status)
File: server/src/payment.ts line 460

```typescript
accountType: user.accountType, // Should return 'guest'
```

**Expected Response:**
```json
{
  "accountType": "guest",
  "paidStatus": "qr_verified",
  "accountExpiresAt": "2025-11-06...",
  "myInviteCode": "UWJT193HKRQ525I0"
}
```

### Step 3: Frontend Display
File: app/settings/page.tsx

Line 161-167: Account Type Badge
```tsx
<span className={`${
  session?.accountType === 'permanent'
    ? 'bg-green-500/20 text-green-300'
    : 'bg-yellow-500/20 text-yellow-300'
}`}>
  {session?.accountType === 'permanent' ? 'Permanent' : 'Guest'}
</span>
```

**Issue:** Uses `session?.accountType` from localStorage
**localStorage session:** Set during onboarding
**May be stale:** If user completed onboarding before accountType fix

Line 171: Upgrade Button Condition
```tsx
{!loadingPayment && paymentStatus?.accountType === 'guest' && paymentStatus?.accountExpiresAt && (
```

**Issue:** Uses `paymentStatus.accountType` from API
**Should be correct:** Backend returns 'guest'

---

## HYPOTHESIS

User's localStorage session has OLD data:
```json
{
  "accountType": "permanent"  // ❌ OLD/WRONG
}
```

But API returns correct data:
```json
{
  "accountType": "guest"  // ✅ CORRECT
}
```

Frontend shows:
- Badge uses localStorage → Shows "Permanent" ❌
- Upgrade button uses API → Should show if API correct ✅

---

## DIAGNOSIS NEEDED

Check debug output in settings page for:
1. Account Type: guest or permanent?
2. Should show button: YES or NO?

If debug shows accountType: 'permanent', then API is returning wrong data.
If debug shows accountType: 'guest', then button SHOULD be visible.
