FORGOT PASSWORD PIPELINE - DATABASE UPDATE VERIFICATION
========================================================

## COMPLETE PIPELINE

Step 1: User clicks "Forgot password?" on login
================================================
Frontend: app/login/page.tsx
- Shows modal
- User enters email
- Clicks "Send Code"

Step 2: Frontend sends request
================================
Handler: handleSendResetCode() (line 71)
- POST /auth/forgot-password { email }

Step 3: Backend receives request
==================================
Route: server/src/auth.ts line 614-680
- Find user by email
- Check 3-attempt limit
- Generate 6-digit code
- Store in user.verification_code
- Set verification_code_expires_at
- Increment verification_attempts
- Send email via sendVerificationEmail()
- Return success

Database Changes:
- user.verification_code = "123456"
- user.verification_code_expires_at = timestamp
- user.verification_attempts = 1

Step 4: User receives email and enters code
============================================
Frontend: app/login/page.tsx
- Modal shows code input + new password input
- User enters 6-digit code
- User enters new password
- Clicks "Reset Password"

Step 5: Frontend sends reset request
=====================================
Handler: handleResetPassword() (line 100)
- POST /auth/reset-password { email, code, newPassword }

Step 6: Backend processes reset
================================
Route: server/src/auth.ts line 682-723
Line 687: Find user by email
Line 693-695: Verify code matches
Line 698-700: Check expiry
Line 703-710: Validate password strength
Line 712-713: Hash password with bcrypt
Line 716-721: UPDATE DATABASE:
```typescript
await store.updateUser(user.userId, {
  password_hash: hashedPassword, // ← DATABASE UPDATE
  verification_code: null,
  verification_code_expires_at: null,
  verification_attempts: 0,
});
```

Database Changes:
- user.password_hash = "$2b$10$..." (bcrypt hash)
- user.verification_code = null (cleared)
- user.verification_code_expires_at = null (cleared)
- user.verification_attempts = 0 (reset)

Step 7: Response
================
Line 724: Returns { success: true }
Frontend: Shows success alert
User: Can now login with new password

## VERIFICATION CHECKLIST

Does it update database?
========================

Line 716-721: await store.updateUser(user.userId, {...})

Checking store.updateUser():
- Updates users table in PostgreSQL ✅
- Uses parameterized query ✅
- Returns updated user ✅

Field name check:
- password_hash (correct field in users table) ✅
- Not "password" ✅

Hash strength:
- bcrypt.hash(newPassword, 10) ✅
- 10 salt rounds ✅

Clear verification fields:
- verification_code: null ✅
- verification_code_expires_at: null ✅
- verification_attempts: 0 ✅

Potential Issues:
=================

1. ❓ Does store.updateUser actually execute SQL?
   - Need to check store.ts implementation
   - Check if useDatabase is true
   - Check if SQL query runs

2. ❓ Does transaction commit?
   - PostgreSQL transaction handling
   - Auto-commit vs manual commit

3. ❓ Does password_hash field exist in database?
   - Check schema
   - Migration may be needed

Let me verify store.updateUser()...

## STORE.UPDATEUSER() VERIFICATION

Found at: server/src/store.ts line 276-326

Analysis:
=========

Line 276: async updateUser(userId: string, updates: Partial<User>): Promise<void>

Line 278-281: Updates memory first
- Updates in-memory map
- Invalidates caches

Line 289-326: Updates database if available
- Line 289: if (this.useDatabase) → Checks if PostgreSQL connected
- Line 292-315: Builds dynamic UPDATE query
- Line 298: Handles password_hash field ✅
  ```typescript
  if (updates.password_hash !== undefined) {
    setClauses.push(`password_hash = $${paramIndex++}`);
    values.push(updates.password_hash);
  }
  ```
- Line 318-321: Executes SQL UPDATE ✅
  ```typescript
  await query(
    `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id = $${paramIndex}`,
    values
  );
  ```
- Line 322: Logs success

Verification Fields Handling:
==============================

Line 298: password_hash ✅ (our field)

But wait... where are verification_code fields?

Checking for verification_code, verification_code_expires_at, verification_attempts...

NOT IN THE LIST! ❌

These fields are NOT being saved to database!
They're only in memory!

This means:
- verification_code stored in memory ✅
- password_hash stored in memory ✅
- But when server restarts → lost! ❌

For production with Railway:
- Need to add these fields to updateUser SQL

Let me add them now...
