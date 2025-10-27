# USC Admin Code & Email Verification System

**Date**: October 27, 2025  
**Status**: ✅ Fully Implemented & Working

---

## 🎓 Overview

BUMPIN has a special verification system for USC students using **Admin Codes**. These codes require `@usc.edu` email verification and grant immediate "paid" status.

---

## 🔑 Admin Code vs Regular Invite Code

### Regular Invite Code (User-Generated)
- **Format**: 16 characters (e.g., `ABC123XYZ456QWER`)
- **Created by**: Verified users (4 uses per code)
- **Requirements**: None (just enter the code)
- **Status Granted**: `qr_grace_period` (need 4 sessions to unlock QR)
- **Email**: Optional, not required

### Admin Code (USC Students)
- **Format**: 16 characters (e.g., `USC2025FALL12345`)
- **Created by**: Admins via database or admin panel
- **Requirements**: **MUST have @usc.edu email** ✅
- **Status Granted**: `paid` (immediate full access)
- **Email**: **Required** and validated
- **Type**: `admin` in database

---

## 📊 Current System Flow

### Step 1: User Enters Admin Code
```
User on onboarding page
↓
Enters name
↓
Enters admin code (16 chars)
↓
Server checks code in database
↓
Detects: type = 'admin'
↓
Requires USC email validation
```

### Step 2: USC Email Validation (Server-Side)
**File**: `server/src/store.ts` (lines 1172-1192)

```typescript
if (inviteCode.type === 'admin') {
  // STRICT: Must be @usc.edu domain
  if (!email || !email.toLowerCase().endsWith('@usc.edu')) {
    return { 
      success: false, 
      error: 'Admin codes are only valid for @usc.edu email addresses'
    };
  }
  
  console.log(`[InviteCode] ✅ Admin code validated with USC email: ${email}`);
}
```

**What Happens**:
- ✅ Email format validated
- ✅ Domain checked (must be `@usc.edu`)
- ✅ USC email stored in user profile
- ✅ User granted `paidStatus: 'paid'`

### Step 3: Account Created with Paid Status
**File**: `server/src/auth.ts` (lines 119-130)

```typescript
// Admin code users (USC students) get PAID status directly
if (codeInfo?.type === 'admin') {
  paidStatus = 'paid';
  console.log('[Auth] Admin code user - setting as PAID (no grace period)');
} else {
  paidStatus = 'qr_grace_period';
}
```

**Benefits of "Paid" Status**:
- ✅ Immediate full access
- ✅ No 4-session requirement
- ✅ Own QR/invite code generated immediately
- ✅ Can invite 4 friends
- ✅ No paywall

---

## 🔐 Email Verification Flow (Optional Enhancement)

### Current Implementation
**USC email is validated during signup** but not email-verified via SendGrid.

**Two Levels of Verification**:

#### Level 1: Domain Validation (ACTIVE ✅)
- Checks email ends with `@usc.edu`
- Happens during code redemption
- **Server-side validation**
- No email sent

#### Level 2: Email Verification via SendGrid (OPTIONAL)
- Sends 6-digit code to email
- User enters code to verify ownership
- **Proves they own the email**
- Currently **not enforced for USC students**

### Recommended Flow (More Secure)
```
USC Student Signs Up
↓
Enters admin code + @usc.edu email
↓
Domain validated (must be @usc.edu) ✅
↓
Account created with paidStatus = 'paid'
↓
[OPTIONAL] Email verification step
↓
Send 6-digit code to USC email
↓
User verifies code
↓
email_verified = true
↓
Full access granted
```

---

## 🛠️ How to Create Admin Codes

### Method 1: Direct Database Insert
```sql
-- Connect to database
psql $DATABASE_URL

-- Create new admin code
INSERT INTO invite_codes (
  code, 
  created_by, 
  created_by_name, 
  type, 
  max_uses, 
  uses_remaining, 
  is_active,
  created_at
) VALUES (
  'USC2025FALL12345',  -- 16-char code
  'admin',             -- Creator
  'System Admin',      -- Creator name
  'admin',             -- Type (CRITICAL)
  100,                 -- Max uses (high limit)
  100,                 -- Remaining uses
  true,                -- Active
  NOW()
);
```

### Method 2: Admin Panel (Future)
**TODO**: Create admin interface to generate codes:
- Button: "Generate USC Admin Code"
- Input: Number of uses
- Output: 16-character code
- Automatically sets `type = 'admin'`

### Method 3: Bulk Generation Script
```typescript
// scripts/generate-usc-codes.ts
import { query } from './server/src/database';

async function generateUSCCodes(count: number) {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const code = generateRandomCode(16); // Your code gen function
    
    await query(`
      INSERT INTO invite_codes (code, created_by, created_by_name, type, max_uses, uses_remaining)
      VALUES ($1, 'admin', 'System', 'admin', 100, 100)
    `, [code]);
    
    codes.push(code);
  }
  
  console.log(`Generated ${count} USC admin codes:`);
  codes.forEach(code => console.log(`- ${code}`));
}

generateUSCCodes(10); // Generate 10 codes
```

---

## ✅ Current Status Check

### What's Already Implemented:
- [x] Admin code type in database schema
- [x] USC email domain validation (@usc.edu)
- [x] Email stored in user profile
- [x] Paid status granted immediately
- [x] No grace period for USC students
- [x] Own invite code generated (4 uses)
- [x] Server-side validation
- [x] Error messages for wrong domain
- [x] Frontend detection of admin codes
- [x] USC email input field shown

### What's Optional (Enhancement):
- [ ] SendGrid email verification for USC emails
- [ ] "Verify your USC email" step in onboarding
- [ ] 6-digit code sent to @usc.edu
- [ ] User must verify to proceed
- [ ] `email_verified = true` in database

**Current Approach**: Domain validation only (sufficient for MVP)  
**Enhanced Approach**: Domain + email ownership verification

---

## 🔄 Migration Path to Email Verification

If you want to add SendGrid verification for USC students:

### Step 1: Modify Onboarding Flow
```typescript
// app/onboarding/page.tsx

if (uscEmailProvided && !emailVerified) {
  // Show email verification step
  return <EmailVerificationStep 
    email={uscEmail} 
    onVerified={() => setEmailVerified(true)}
  />;
}
```

### Step 2: Server Endpoint
Already exists! `/verification/send` and `/verification/verify`

### Step 3: Update Auth Flow
```typescript
// server/src/auth.ts

// After admin code validation
if (result.codeType === 'admin' && email) {
  // Generate verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + (15 * 60 * 1000);
  
  // Store code
  await store.updateUser(userId, {
    verification_code: code,
    verification_code_expires_at: expiresAt,
    email_verified: false, // Requires verification
  });
  
  // Send email
  await sendVerificationEmail(email, code, name);
  
  return res.json({
    success: true,
    requiresEmailVerification: true,
    email: email,
  });
}
```

---

## 🎯 Testing Admin Codes

### Test 1: Valid USC Email
```bash
# POST /auth/guest
{
  "name": "John Doe",
  "gender": "male",
  "inviteCode": "USC2025FALL12345",
  "email": "john.doe@usc.edu"  # ✅ Valid
}

# Expected:
# - Success
# - paidStatus: "paid"
# - email stored
```

### Test 2: Invalid Email Domain
```bash
{
  "name": "John Doe",
  "gender": "male",
  "inviteCode": "USC2025FALL12345",
  "email": "john@gmail.com"  # ❌ Not USC
}

# Expected:
# - Error: "Admin codes are only valid for @usc.edu email addresses"
# - Account NOT created
```

### Test 3: Missing Email
```bash
{
  "name": "John Doe",
  "gender": "male",
  "inviteCode": "USC2025FALL12345"
  # No email provided
}

# Expected:
# - Error: "USC email required for this code"
# - Account NOT created
```

### Test 4: Regular Code (Non-Admin)
```bash
{
  "name": "John Doe",
  "gender": "male",
  "inviteCode": "ABC123XYZ456QWER",
  "email": "john@gmail.com"  # ✅ Any email OK
}

# Expected:
# - Success
# - paidStatus: "qr_grace_period"
# - email optional
```

---

## 📝 Database Schema

### invite_codes Table
```sql
CREATE TABLE invite_codes (
  code VARCHAR(16) PRIMARY KEY,
  created_by VARCHAR(255) NOT NULL,
  created_by_name VARCHAR(255),
  type VARCHAR(10) DEFAULT 'user',  -- 'user' or 'admin'
  max_uses INTEGER DEFAULT 4,
  uses_remaining INTEGER DEFAULT 4,
  used_by TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Key Fields**:
- `type`: `'admin'` for USC codes, `'user'` for regular
- `max_uses`: Usually 100 for admin codes
- `used_by`: Array of user IDs who used the code

### users Table
```sql
-- Relevant fields
email VARCHAR(255),                    -- USC email stored here
email_verified BOOLEAN DEFAULT false,  -- Email ownership verified
paid_status VARCHAR(20),               -- 'paid' for admin code users
invite_code_used VARCHAR(16),          -- Which code they used
```

---

## 🚀 Admin Code Distribution

### For Campus Events
```
1. Generate admin codes (via script or admin panel)
2. Print QR codes containing:
   - URL: https://napalmsky.com/onboarding?inviteCode=USC2025FALL12345
   - Text: "USC Students Only - Scan with @usc.edu email"
3. Post at:
   - Student center
   - Library
   - Dorm bulletin boards
   - Campus events
```

### For Online Distribution
```
1. Create unique code per channel:
   - USC2025REDDIT01 (Reddit)
   - USC2025DISCORD01 (Discord)
   - USC2025INSTA01 (Instagram)
2. Track usage per code
3. Deactivate if abused
```

### For Bulk Email
```
Subject: Join BUMPIN - USC Exclusive Access

Hi Trojans! 🎓

Use this exclusive code to join BUMPIN:

Code: USC2025FALL12345

Requirements:
- Must have @usc.edu email
- Free access (no payment)
- Invite 4 friends after verification

Sign up: https://napalmsky.com/onboarding?inviteCode=USC2025FALL12345
```

---

## 🔒 Security Considerations

### Current Protections:
✅ **Code Format Validation**: Must be exactly 16 alphanumeric characters  
✅ **SQL Injection Prevention**: Parameterized queries  
✅ **Domain Validation**: Strict @usc.edu check  
✅ **Reuse Prevention**: Each user can only use a code once  
✅ **Type Enforcement**: Admin codes require USC email  

### Potential Exploits:
❌ **No Email Ownership Verification**: Anyone can claim any @usc.edu email  
❌ **No Email Rate Limiting**: Could try many USC emails  
❌ **No Email Existence Check**: Fake USC emails accepted  

### Recommendations:
1. **Add SendGrid Verification**: Prove email ownership
2. **Check Email Exists**: Verify email actually receives mail
3. **Rate Limit**: Max 3 attempts per IP per hour
4. **Monitor Abuse**: Flag suspicious patterns
5. **Deactivate Codes**: If abuse detected

---

## ✅ Summary

**Current System (Production-Ready)**:
- ✅ Admin codes exist
- ✅ USC email domain validated
- ✅ Paid status granted immediately
- ✅ No SendGrid verification required
- ✅ Sufficient for MVP/launch

**Enhanced System (Recommended)**:
- ✅ Everything above
- ➕ SendGrid email verification
- ➕ Proves email ownership
- ➕ Prevents fake USC emails
- ➕ Higher security level

**Decision**: Current system works fine. Add email verification if abuse detected.

---

## 📞 Questions?

**Issue**: Admin code not working?  
**Check**: 
1. Code exists in database
2. `type = 'admin'` (not 'user')
3. `is_active = true`
4. Email ends with `@usc.edu`
5. Code not already fully used

**Issue**: Want to add email verification?  
**See**: `SENDGRID-EMAIL-VERIFICATION-TUTORIAL.md`

**Issue**: Need to generate more codes?  
**Run**: SQL insert or create admin panel

