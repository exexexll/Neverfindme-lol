# 🗄️ Comprehensive Data Persistence Plan

## 🔴 CRITICAL ISSUE: Memory vs Database

**Current Problem**:
- Dual-storage pattern: Memory PRIMARY, Database SECONDARY
- Server restart → Memory wiped → Data lost
- Some data (invite codes, QR codes, cooldowns) may not persist properly

**Solution**: Ensure ALL critical data writes to PostgreSQL

---

## 📊 Data Persistence Audit

### **✅ Currently Persisted to Database**

| Data | Table | Status | Survives Restart |
|------|-------|--------|------------------|
| Users | `users` | ✅ Persisted | YES |
| Sessions | `sessions` | ✅ Persisted | YES |
| Chat History | `chat_history` | ✅ Persisted | YES |
| Reports | `reports` | ✅ Persisted | YES |
| Bans | `user_bans` | ✅ Persisted | YES |
| IP Bans | `ip_bans` | ✅ Persisted | YES |
| Session Completions | `session_completions` | ✅ Persisted | YES |
| Invite Codes | `invite_codes` | ✅ Persisted | YES |
| Referrals | `referral_mappings` | ✅ Persisted | YES |
| USC Card Registrations | `usc_card_registrations` | ✅ Persisted | YES |
| USC Scan Attempts | `usc_scan_attempts` | ✅ Persisted | YES |

### **❌ Memory-Only (Lost on Restart)**

| Data | Location | Issue | Fix Needed |
|------|----------|-------|------------|
| Presence | `store.presence Map` | Lost on restart | Use Redis or accept (realtime only) |
| Active Rooms | `activeRooms Map` | Lost on restart | ✅ Already backed up to `active_rooms` table |
| Active Invites | `store.activeInvites` | Lost on restart | OK (ephemeral, 20s timeout) |
| Cooldowns | `store.cooldowns` | Lost on restart | ⚠️ NEEDS FIX |
| Rate Limits | `store.rateLimits` | Lost on restart | OK (security, resets acceptable) |
| Timer Totals | `store.timerTotals` | Lost on restart | ⚠️ NEEDS FIX |

---

## 🔧 Critical Fixes Needed

### **1. Cooldowns Must Persist**

**Current**: In-memory Map (lost on restart)  
**Issue**: Users could bypass 24h cooldown by restarting server  

**Fix**: Add to users table
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooldowns JSONB DEFAULT '{}'::jsonb;
-- Format: {"userId123": 1730000000000, "userId456": 1730000000000}
```

### **2. Timer Totals Must Persist**

**Current**: Partially synced (updated on session end)  
**Issue**: In-memory total may be stale  

**Fix**: Already in `users.timer_total_seconds` ✅ (verify sync)

### **3. USC Card Data Verification**

**Check**: Is `finalize-registration` endpoint actually being called?

---

## 📋 Database Wipe & Fresh Start Script

### **Complete Database Reset**
```sql
-- ===== COMPREHENSIVE DATABASE WIPE =====
-- Deletes ALL data for fresh start
-- USE WITH CAUTION!

BEGIN;

-- 1. Drop all USC card data
TRUNCATE TABLE usc_card_registrations CASCADE;
TRUNCATE TABLE usc_scan_attempts CASCADE;

-- 2. Drop all user data
TRUNCATE TABLE session_completions CASCADE;
TRUNCATE TABLE chat_history CASCADE;
TRUNCATE TABLE reports CASCADE;
TRUNCATE TABLE user_bans CASCADE;
TRUNCATE TABLE ip_bans CASCADE;
TRUNCATE TABLE sessions CASCADE;
TRUNCATE TABLE users CASCADE;

-- 3. Drop invite codes
TRUNCATE TABLE invite_codes CASCADE;

-- 4. Drop referrals
TRUNCATE TABLE referral_mappings CASCADE;
TRUNCATE TABLE referral_notifications CASCADE;

-- 5. Drop active rooms
TRUNCATE TABLE active_rooms CASCADE;

-- 6. Drop text chat
TRUNCATE TABLE text_chat_messages CASCADE;

-- 7. Drop location data
TRUNCATE TABLE user_locations CASCADE;

-- 8. Drop Instagram posts
UPDATE users SET instagram_posts = '[]'::jsonb WHERE instagram_posts IS NOT NULL;

-- 9. Reset sequences
ALTER SEQUENCE session_completions_id_seq RESTART WITH 1;
ALTER SEQUENCE reports_report_id_seq RESTART WITH 1;

COMMIT;

-- Verify cleanup
SELECT 'users' as table_name, COUNT(*) as rows FROM users
UNION ALL
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL
SELECT 'chat_history', COUNT(*) FROM chat_history
UNION ALL
SELECT 'usc_card_registrations', COUNT(*) FROM usc_card_registrations
UNION ALL
SELECT 'invite_codes', COUNT(*) FROM invite_codes;
-- Should all show 0
```

---

## 🔄 Email Verification for USC Card Users

### **Current Gap**:
- USC card users can add email on permanent step
- No email verification required
- Could use fake @usc.edu

### **Fix**: Add email verification step

```typescript
// app/onboarding/page.tsx - handleMakePermanent

// After USC email validation
if (uscId && email.toLowerCase().endsWith('@usc.edu')) {
  // Send verification code to USC email
  await sendUSCEmailVerification(email, sessionToken);
  
  // Show verification step
  setStep('usc-email-verify-permanent');
  return;
}
```

---

## ✅ Comprehensive Persistence Checklist

### **Before Server Restart:**
- [ ] All users saved to PostgreSQL
- [ ] All sessions saved to PostgreSQL  
- [ ] All chat history saved to PostgreSQL
- [ ] All invite codes saved to PostgreSQL
- [ ] All USC card registrations saved to PostgreSQL
- [ ] Cooldowns backed up (if critical)

### **After Server Restart:**
- [ ] Users load from database ✅
- [ ] Sessions load from database ✅
- [ ] Invite codes load from database ✅
- [ ] USC card registrations intact ✅
- [ ] Cooldowns restored (if implemented)

---

## 🎯 Implementation Priority

### **HIGH PRIORITY (Must Fix)**:
1. ✅ Verify USC card finalize-registration is called
2. ✅ Add email verification for USC permanent accounts
3. ⚠️ Ensure cooldowns persist (or accept reset)

### **MEDIUM PRIORITY**:
4. Create database wipe script (for fresh starts)
5. Add data export/backup script
6. Monitor persistence on server restart

### **LOW PRIORITY**:
7. Migrate presence to Redis (optional)
8. Add data retention policies
9. Implement auto-archival

---

## 🔍 USC Card Data Flow Verification

```
USC Card Scan → sessionStorage temp
Name/Gender → Create guest user (NO uscId)
Selfie → Upload
Video → Upload
Permanent Step:
  [Skip] → Call /usc/finalize-registration
         → INSERT INTO usc_card_registrations ← SAVES HERE
         → UPDATE users SET usc_id = $1 ← SAVES HERE
  
  [Make Permanent] → Link email
                   → Call /usc/finalize-registration
                   → INSERT INTO usc_card_registrations ← SAVES HERE
                   → UPDATE users SET usc_id = $1 ← SAVES HERE
```

**Verification Needed**: Check if finalize-registration is actually being called!

---

## 📝 Next Steps

1. **Immediate**: Verify USC card data is saved to database
2. **Immediate**: Add email verification for USC permanent accounts
3. **Soon**: Create database wipe script
4. **Later**: Implement cooldown persistence

