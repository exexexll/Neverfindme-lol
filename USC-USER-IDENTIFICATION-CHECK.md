USC USER IDENTIFICATION - VERIFYING @USC.EDU REQUIREMENT
=========================================================

## REQUIREMENT

USC card users (paidStatus = 'qr_verified') MUST use @usc.edu email when upgrading to permanent.
Regular users (friend invite, qr_grace_period) can use any email.

## CURRENT CHECK (app/settings/page.tsx line 88-92)

```typescript
const hasUSCCard = paymentStatus?.uscId || session.uscId;
if (hasUSCCard && !email.trim().toLowerCase().endsWith('@usc.edu')) {
  alert('USC card users must use @usc.edu email address for permanent account');
  return;
}
```

### Issue Analysis:

1. Checks: paymentStatus?.uscId OR session.uscId
2. paymentStatus comes from /payment/status API
3. API returns uscId field (line 433 in payment.ts)
4. uscId is set when USC card is scanned

Question: Does the API ACTUALLY return uscId for USC users?

---

## VERIFYING API RESPONSE

### Check 1: payment.ts Manual User Object (line 406-419)

```typescript
user = {
  userId: row.user_id,
  name: row.name,
  paidStatus: row.paid_status,
  // ...
  accountType: row.account_type,
  accountExpiresAt: row.account_expires_at ? new Date(...).getTime() : undefined,
  // ❓ Is uscId included here?
};
```

Looking at line 406-419... CHECKING if uscId is in manual object...

---

## DATABASE CHECK

Need to verify:
1. Does users table have usc_id column?
2. Is usc_id populated for USC card users?
3. Is uscId returned in payment status API?

---

Checking code...
