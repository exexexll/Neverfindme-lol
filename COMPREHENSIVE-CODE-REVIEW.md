# COMPREHENSIVE CODE REVIEW - ALL PIPELINES

## 1️⃣ VIDEO CHAT PIPELINE

### Flow:
1. User A invites User B
2. Socket: `call:invite` → Server creates room
3. Socket: `call:start` → Both redirect to `/room/[roomId]`
4. WebRTC connection established
5. Video chat happens
6. Socket: `call:end` → Session tracked

### Checkpoints:
- [ ] Socket events work?
- [ ] Room creation works?
- [ ] WebRTC signaling works?
- [ ] TURN credentials work?
- [ ] Event Mode blocking video rooms? ← SUSPECTED ISSUE

---

## 2️⃣ AUTHENTICATION PIPELINE

### User Auth:
- Login: `/auth/login` → sessionToken
- Middleware: `requireAuth` checks sessionToken
- Storage: PostgreSQL sessions table

### Admin Auth:
- Login: `/admin/login` → adminToken
- Middleware: `requireAdmin` checks adminToken
- Storage: Memory Map (adminSessions)

### Issue Found:
❌ Some routes had BOTH requireAuth + requireAdmin
✅ Fixed: Admin routes now ONLY use requireAdmin

---

## 3️⃣ EVENT MODE PIPELINE

### Middleware Application:
```typescript
app.use('/room', requireEventAccess, roomRoutes)
```

**PROBLEM:** This blocks ALL /room routes including:
- /room/queue ← Should block ✅
- /room/history ← Should block ✅
- /room/[roomId] ← Should NEVER block ❌ BREAKING VIDEO CHAT

### Fix Needed:
Move requireEventAccess to specific routes in room.ts, not app.use()

---

## 4️⃣ SOCKET CONNECTION ISSUES

### Multiple Connections:
- EventModeBanner: connectSocket()
- SessionInvalidatedModal: connectSocket()
- MatchmakeOverlay: connectSocket()
- Event-wait page: connectSocket()

**Each creates NEW connection → Connection spam**

### Fix Needed:
Reuse socket singleton from lib/socket.ts

---

## 5️⃣ REQUIREAUTH MIDDLEWARE CHECK

### Files with requireAuth:
- user.ts ✅ (checks isActive)
- media.ts ✅ (checks isActive)
- room.ts ✅ (checks isActive)
- turn.ts ✅ (checks isActive)
- report.ts ✅ (checks isActive)
- payment.ts ✅ (checks isActive)
- referral.ts ✅ (checks isActive)

All properly check session.isActive ✅

---

## 🔍 CRITICAL ISSUES FOUND

### Issue #1: Event Guard Blocks Video Rooms
**Severity:** 🔴 CRITICAL  
**Impact:** Users cannot video chat  
**Status:** FIXING NOW

### Issue #2: Socket Connection Spam
**Severity:** 🟡 MEDIUM  
**Impact:** Performance, error logs  
**Status:** Non-breaking but should fix

### Issue #3: Railway Not Deployed
**Severity:** 🟡 MEDIUM  
**Impact:** Admin panel 401s  
**Status:** Waiting for Railway

---

## ✅ FIXES BEING APPLIED

1. Remove requireEventAccess from app.use('/room')
2. Apply it selectively to /room/queue only
3. Video rooms will always work
