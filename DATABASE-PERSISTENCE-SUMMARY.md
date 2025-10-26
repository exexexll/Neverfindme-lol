# Database Persistence Summary

**Date**: October 24, 2025  
**Database**: PostgreSQL  
**Status**: ✅ Most critical data persisted, 4 tables need addition

---

## ✅ Already Persisted in PostgreSQL

### User & Authentication
1. **users** - Profiles, settings, payment status, ban info ✅
2. **sessions** - Active sessions, expiry, device info ✅
3. **session_completions** - Video call tracking for QR unlock ✅

### Social & Matching
4. **cooldowns** - 24h cooldown between users ✅
5. **chat_history** - Past video/text conversations ✅
6. **referral_notifications** - Intro notifications ✅

### Moderation & Security
7. **reports** - User reports (now with session data) ✅
8. **ban_records** - Temporary/permanent bans ✅
9. **ip_bans** - IP-level blocking ✅

### Payment & Access
10. **invite_codes** - QR codes, usage tracking ✅

**Total**: 10 core tables ✅

---

## ⚠️ Currently In-Memory Only (Need Database)

### Critical (Should Add):

#### 1. **active_rooms** 🔴 CRITICAL
**Current**: In-memory Map in server/src/index.ts  
**Problem**: Server restart = all calls disconnected  
**Impact**: HIGH - Users lose ongoing calls  
**Migration**: ✅ Created - add-active-rooms-and-referrals.sql  

**Data Stored**:
```sql
- room_id (UUID)
- user_1, user_2 (who's in the call)
- started_at, duration
- chat_mode (video/text)
- status (active/grace_period/ended)
- user_1_connected, user_2_connected
- messages (in-call chat)
```

#### 2. **referral_mappings** 🟡 IMPORTANT
**Current**: In-memory Map in store.ts  
**Problem**: Intro links break after restart  
**Impact**: MEDIUM - Referral links stop working  
**Migration**: ✅ Created - add-active-rooms-and-referrals.sql

**Data Stored**:
```sql
- referral_code (unique link)
- target_user_id (who to introduce to)
- created_by_user_id (who made intro)
- names, timestamp
```

#### 3. **text_room_activity** 🟡 IMPORTANT
**Current**: In-memory Map in server/src/index.ts  
**Problem**: Torch rule resets after restart  
**Impact**: MEDIUM - Text chats lose activity state  
**Migration**: ✅ Created - add-active-rooms-and-referrals.sql

**Data Stored**:
```sql
- room_id
- user_1_last_message_at
- user_2_last_message_at
- warning_started_at (inactivity warning)
```

#### 4. **rate_limits** 🟢 OPTIONAL
**Current**: In-memory Map in store.ts  
**Problem**: Rate limits reset after restart  
**Impact**: LOW - Users can bypass temporarily  
**Migration**: ✅ Created - add-active-rooms-and-referrals.sql

---

## ✅ Correctly In-Memory Only

These SHOULD stay in-memory for performance:

### 1. **presence** (online/available status)
**Why**: Changes every second, would spam database  
**Impact of loss**: None - users rejoin queue on restart  
**Verdict**: ✅ KEEP IN-MEMORY

### 2. **activeInvites** (pending 20s invites)
**Why**: Expires in 20 seconds, temporary  
**Impact of loss**: Invites auto-expire, users can resend  
**Verdict**: ✅ KEEP IN-MEMORY

### 3. **seenInSession** (who you've seen this session)
**Why**: Session-specific, resets intentionally  
**Impact of loss**: Expected behavior  
**Verdict**: ✅ KEEP IN-MEMORY

---

## 📋 Migration Checklist

### New Tables Created:
- [x] active_rooms - Persist ongoing calls
- [x] referral_mappings - Persist intro links
- [x] text_room_activity - Persist torch rule state
- [x] rate_limits - Optional spam prevention

### Schema Updates:
- [x] chat_history.chat_mode - Track video vs text
- [x] reports.session_data - Store call/chat context

### To Run Migration:
```bash
# On Railway or your PostgreSQL:
psql $DATABASE_URL -f migrations/add-active-rooms-and-referrals.sql
```

---

## 🔄 What Happens on Server Restart

### Before Migration:
```
Server restarts:
├─ ❌ All ongoing calls disconnected
├─ ❌ Intro links stop working
├─ ❌ Text chat activity lost
├─ ✅ Users/sessions preserved (already in DB)
└─ ✅ Chat history preserved (already in DB)
```

### After Migration:
```
Server restarts:
├─ ✅ Ongoing calls can resume (10s grace period)
├─ ✅ Intro links keep working
├─ ✅ Text chat activity state preserved
├─ ✅ Users/sessions preserved
└─ ✅ Chat history preserved
```

---

## 🎯 Priority for Addition

### 🔴 High Priority:
1. **active_rooms** - Prevents call disconnection on restart

### 🟡 Medium Priority:
2. **referral_mappings** - Intro links reliability
3. **text_room_activity** - Text chat state

### 🟢 Low Priority:
4. **rate_limits** - Anti-spam across restarts

---

## 📝 Next Steps

1. **Run migration**:
   ```bash
   psql $DATABASE_URL -f migrations/add-active-rooms-and-referrals.sql
   ```

2. **Update store.ts** to save/load from these tables  
   (Currently saves to memory, need DB operations)

3. **Add recovery logic** on server startup  
   (Load active_rooms from DB, reconnect users)

4. **Test** restart recovery

---

**Created migration file**: `migrations/add-active-rooms-and-referrals.sql`  
**Ready to run**: Yes - safe to apply (uses IF NOT EXISTS)

Would you like me to also update the store.ts code to actually USE these new tables?

