# 🚨 EVENT MODE - SECURITY AUDIT & FIXES

**Audit Date:** October 19, 2025  
**Status:** 8 Critical Issues Found + Fixes Provided

---

## ❌ CRITICAL VULNERABILITIES FOUND

### 1. **CRITICAL: Admin Routes Have NO Authentication** 🔴

**Location:** `server/src/event-admin.ts` - ALL routes  
**Severity:** CRITICAL  
**Impact:** Anyone can change event settings without being admin

**Problem:**
```typescript
router.post('/event/settings', async (req, res) => {
  // NO AUTH CHECK! Anyone can call this
  await store.updateEventSettings(...);
});
```

**Exploit:**
```bash
# Any user can disable event mode or change times
curl -X POST https://yourapi.com/admin/event/settings \
  -H "Content-Type: application/json" \
  -d '{"eventModeEnabled": false}'
```

**User Logic Flow:**
```
Attacker → /admin/event/settings → NO CHECK → Settings changed ✗
Should be: Attacker → /admin/event/settings → requireAdmin → BLOCKED ✓
```

---

### 2. **HIGH: RSVP Spam - No Rate Limiting** 🔴

**Location:** `server/src/event.ts` - POST /event/rsvp  
**Severity:** HIGH  
**Impact:** User can spam thousands of RSVPs, inflate attendance graphs

**Problem:**
```typescript
router.post('/rsvp', async (req, res) => {
  // NO rate limiting!
  await store.saveEventRSVP(...);
});
```

**Exploit:**
```javascript
// Spam 1000 RSVPs to different dates
for (let i = 0; i < 1000; i++) {
  await fetch('/event/rsvp', {
    method: 'POST',
    body: JSON.stringify({
      preferredTime: '15:00:00',
      eventDate: `2025-10-${20 + i % 30}`
    })
  });
}
```

**User Logic Flow:**
```
User → RSVP submit → NO LIMIT → Database flooded ✗
Should be: User → RSVP submit → Rate limit (5/min) → Block spam ✓
```

---

### 3. **HIGH: Invalid Time Configuration** 🔴

**Location:** `server/src/event-admin.ts` - POST /admin/event/settings  
**Severity:** HIGH  
**Impact:** Admin can set end time before start time, breaking system

**Problem:**
```typescript
// Admin can set: start=18:00, end=15:00
// This breaks all time comparisons
if (eventStartTime && !/^\d{2}:\d{2}:\d{2}$/.test(eventStartTime)) {
  // Only checks format, not if start < end
}
```

**Exploit:**
```json
{
  "eventStartTime": "23:00:00",
  "eventEndTime": "01:00:00"
}
```

**User Logic Flow:**
```
Admin → Set end < start → Saved → isEventActive always false ✗
Should be: Admin → Set end < start → Validation error → Rejected ✓
```

---

### 4. **MEDIUM: Timezone Injection** 🟠

**Location:** `server/src/event-admin.ts` - POST /admin/event/settings  
**Severity:** MEDIUM  
**Impact:** Invalid timezone breaks time calculations

**Problem:**
```typescript
timezone: eventTimezone, // Any string accepted!
// Could be: "../../../../etc/passwd" or malicious string
```

**Exploit:**
```json
{
  "timezone": "'; DROP TABLE users; --"
}
```

**User Logic Flow:**
```
Admin → Set invalid timezone → Crashes isEventActive → All users blocked ✗
Should be: Admin → Invalid timezone → Whitelist check → Rejected ✓
```

---

### 5. **MEDIUM: Future Date Abuse** 🟠

**Location:** `server/src/event.ts` - POST /event/rsvp  
**Severity:** MEDIUM  
**Impact:** User can RSVP for dates years in the future

**Problem:**
```typescript
if (eventDate < today) {
  return res.status(400).json({ error: 'Cannot RSVP for past dates' });
}
// No upper limit! Can RSVP for 2099-12-31
```

**Exploit:**
```json
{
  "eventDate": "2099-12-31",
  "preferredTime": "15:00:00"
}
```

**User Logic Flow:**
```
User → RSVP 2099 → Accepted → Database bloat ✗
Should be: User → RSVP 2099 → Max 30 days check → Rejected ✓
```

---

### 6. **MEDIUM: Public Attendance Scraping** 🟠

**Location:** `server/src/event.ts` - GET /event/attendance/:date  
**Severity:** MEDIUM  
**Impact:** Anyone can scrape all attendance data for user profiling

**Problem:**
```typescript
router.get('/attendance/:date', async (req, res) => {
  // PUBLIC endpoint - no auth, no rate limit
  const attendance = await store.getEventAttendance(date);
});
```

**Exploit:**
```bash
# Scrape 365 days of data
for i in {1..365}; do
  curl "https://api.com/event/attendance/2025-10-$((i%30+1))"
done
```

**User Logic Flow:**
```
Attacker → Query 1000 dates → Gets all data → User profiling ✗
Should be: Attacker → Query 100/day → Rate limited → Can't scrape ✓
```

---

### 7. **LOW: Error Fails Open** 🟡

**Location:** `server/src/event-guard.ts` - requireEventAccess  
**Severity:** LOW  
**Impact:** Database errors grant access instead of blocking

**Problem:**
```typescript
} catch (error) {
  console.error('[EventGuard] Error checking event access:', error);
  next(); // FAILS OPEN - allows access on error
}
```

**User Logic Flow:**
```
DB error → Middleware crashes → next() called → User gets access ✗
Should be: DB error → Middleware catches → Block access → Security ✓
```

---

### 8. **LOW: Time Value Range** 🟡

**Location:** `server/src/event-admin.ts` - POST /admin/event/settings  
**Severity:** LOW  
**Impact:** Invalid hour values (25:00:00) accepted by regex

**Problem:**
```typescript
if (eventStartTime && !/^\d{2}:\d{2}:\d{2}$/.test(eventStartTime)) {
  // Accepts: "99:99:99" - Invalid but passes regex
}
```

---

## ✅ SECURITY FIXES

### Fix 1: Add Admin Authentication

**File:** `server/src/event-admin.ts`

```typescript
import { requireAdmin } from './admin-auth'; // IMPORT THIS

export function createEventAdminRoutes(io: SocketServer) {
  const router = express.Router();

  // ADD requireAdmin to ALL routes
  router.get('/event/settings', requireAdmin, async (req, res) => {
    // ... existing code
  });

  router.post('/event/settings', requireAdmin, async (req, res) => {
    // ... existing code
  });

  router.get('/event/attendance/:date', requireAdmin, async (req, res) => {
    // ... existing code
  });

  router.post('/event/cleanup-old-rsvps', requireAdmin, async (req, res) => {
    // ... existing code
  });

  return router;
}
```

**Or in index.ts:**
```typescript
// Apply admin auth middleware to all admin event routes
app.use('/admin/event', authLimiter, requireAdmin, createEventAdminRoutes(io));
```

---

### Fix 2: Add RSVP Rate Limiting

**File:** `server/src/rate-limit.ts` (create new limiter)

```typescript
export const rsvpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 RSVPs per minute per IP
  message: 'Too many RSVP submissions. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
```

**File:** `server/src/index.ts`

```typescript
import { rsvpLimiter } from './rate-limit';

// Apply to event routes
app.use('/event/rsvp', rsvpLimiter); // Add this line
app.use('/event', apiLimiter, eventRoutes);
```

---

### Fix 3: Validate Time Range

**File:** `server/src/event-admin.ts`

```typescript
router.post('/event/settings', requireAdmin, async (req, res) => {
  // ... existing validation ...

  // ADD: Validate time values and range
  if (eventStartTime) {
    const [h, m, s] = eventStartTime.split(':').map(Number);
    if (h > 23 || m > 59 || s > 59) {
      return res.status(400).json({ error: 'Invalid time values' });
    }
  }

  if (eventEndTime) {
    const [h, m, s] = eventEndTime.split(':').map(Number);
    if (h > 23 || m > 59 || s > 59) {
      return res.status(400).json({ error: 'Invalid time values' });
    }
  }

  // ADD: Validate start < end
  if (eventStartTime && eventEndTime) {
    if (eventStartTime >= eventEndTime) {
      return res.status(400).json({ 
        error: 'Event end time must be after start time' 
      });
    }
  }

  // ... rest of code
});
```

---

### Fix 4: Validate Timezone

**File:** `server/src/event-admin.ts`

```typescript
const VALID_TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
];

router.post('/event/settings', requireAdmin, async (req, res) => {
  // ... existing validation ...

  // ADD: Validate timezone
  if (timezone && !VALID_TIMEZONES.includes(timezone)) {
    return res.status(400).json({ 
      error: 'Invalid timezone. Must be one of: ' + VALID_TIMEZONES.join(', ')
    });
  }

  // ... rest of code
});
```

---

### Fix 5: Limit RSVP Date Range

**File:** `server/src/event.ts`

```typescript
router.post('/rsvp', async (req, res) => {
  // ... existing validation ...

  // ADD: Limit to next 30 days
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  if (eventDate < today) {
    return res.status(400).json({ error: 'Cannot RSVP for past dates' });
  }

  if (eventDate > maxDateStr) {
    return res.status(400).json({ 
      error: 'Cannot RSVP more than 30 days in advance' 
    });
  }

  // ... rest of code
});
```

---

### Fix 6: Rate Limit Public Endpoints

**File:** `server/src/index.ts`

```typescript
// Create specific rate limiter for public event data
const eventPublicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'Too many requests. Please try again later.',
});

// Apply to public event endpoints
app.use('/event/attendance', eventPublicLimiter);
app.use('/event/settings', eventPublicLimiter);
app.use('/event/status', eventPublicLimiter);
```

---

### Fix 7: Fail Closed on Errors

**File:** `server/src/event-guard.ts`

```typescript
export async function requireEventAccess(req, res, next) {
  try {
    // ... existing code ...
  } catch (error) {
    console.error('[EventGuard] Error checking event access:', error);
    
    // CHANGE: Fail closed (block access on error)
    return res.status(503).json({
      error: 'Event system temporarily unavailable',
      message: 'Please try again in a moment',
    });
    
    // REMOVE: next(); // Don't allow access on error
  }
}
```

---

### Fix 8: Validate Time Values

**File:** `server/src/event.ts`

```typescript
router.post('/rsvp', async (req, res) => {
  // ... existing validation ...

  // ADD: Validate time values
  if (preferredTime) {
    const [h, m, s] = preferredTime.split(':').map(Number);
    if (h > 23 || m > 59 || s > 59) {
      return res.status(400).json({ error: 'Invalid time values' });
    }
  }

  // ... rest of code
});
```

---

## 🔐 ADDITIONAL SECURITY MEASURES

### 1. Ban Status Check in Event Guard

**File:** `server/src/event-guard.ts`

```typescript
if (session) {
  const user = await store.getUser(session.userId);
  
  // ADD: Check if user is banned
  if (store.isUserBanned(session.userId)) {
    return res.status(403).json({
      error: 'Account suspended',
      banned: true,
    });
  }
  
  if (user?.canAccessOutsideEvents) {
    // ... existing code
  }
}
```

---

### 2. Audit Logging

**File:** `server/src/event-admin.ts`

```typescript
router.post('/event/settings', requireAdmin, async (req, res) => {
  // ... validation ...

  // ADD: Audit log
  console.log('[EventAdmin] AUDIT: Settings changed by admin', {
    adminId: (req as any).userId, // from requireAdmin middleware
    changes: { eventModeEnabled, eventStartTime, eventEndTime },
    timestamp: new Date().toISOString(),
    ip: (req as any).userIp,
  });

  await store.updateEventSettings({...});
  // ... rest
});
```

---

### 3. RSVP Validation Against Event Settings

**File:** `server/src/event.ts`

```typescript
router.post('/rsvp', async (req, res) => {
  // ... existing validation ...

  // ADD: Validate time is within event window
  const settings = await store.getEventSettings();
  
  if (preferredTime < settings.eventStartTime || 
      preferredTime > settings.eventEndTime) {
    return res.status(400).json({
      error: `Time must be between ${settings.eventStartTime} and ${settings.eventEndTime}`,
    });
  }

  // ... rest of code
});
```

---

### 4. Input Sanitization

**File:** All event routes

```typescript
// ADD to all routes that accept user input
const sanitize = (str: string) => {
  return str.replace(/[<>\"']/g, '').trim();
};

// Use in validation
const sanitizedTimezone = sanitize(timezone);
```

---

## 📋 SECURITY CHECKLIST

Before deploying, ensure:

### Authentication & Authorization
- [ ] All admin routes require `requireAdmin` middleware
- [ ] User routes verify session tokens
- [ ] Banned users are blocked from all event features
- [ ] VIP access is database-controlled only

### Input Validation
- [ ] All date inputs validated (format + range)
- [ ] All time inputs validated (format + values + range)
- [ ] Timezone whitelist enforced
- [ ] Event days array validated (0-6 only)
- [ ] Start time < End time enforced

### Rate Limiting
- [ ] RSVP endpoint: 5 per minute per user
- [ ] Public endpoints: 20 per minute per IP
- [ ] Admin endpoints: Use existing authLimiter

### Error Handling
- [ ] Event guard fails closed (blocks on error)
- [ ] All database errors caught and logged
- [ ] No sensitive data in error messages
- [ ] Proper HTTP status codes

### Data Protection
- [ ] SQL injection prevented (parameterized queries)
- [ ] No user PII exposed in public endpoints
- [ ] Audit logs for admin actions
- [ ] Rate limiting prevents data scraping

### Business Logic
- [ ] RSVP limited to 30 days ahead
- [ ] One RSVP per user per date (DB constraint)
- [ ] Invalid time configurations rejected
- [ ] Event mode changes broadcast to clients

---

## 🚀 DEPLOYMENT STEPS (SECURE)

1. **Apply ALL security fixes above**
2. **Test admin authentication:**
   ```bash
   # Should FAIL without admin token
   curl -X POST https://api.com/admin/event/settings
   ```

3. **Test rate limiting:**
   ```bash
   # Submit 10 RSVPs quickly - should get rate limited
   ```

4. **Test input validation:**
   ```bash
   # Try invalid timezone, times, dates - should be rejected
   ```

5. **Monitor logs for:**
   - Failed admin access attempts
   - Rate limit violations
   - Invalid input attempts
   - Database errors

---

## ⚠️ IMMEDIATE ACTION REQUIRED

**BEFORE deploying to production:**

1. ✅ Add `requireAdmin` to all admin event routes
2. ✅ Add RSVP rate limiting (5/min)
3. ✅ Validate time ranges (start < end)
4. ✅ Whitelist timezones
5. ✅ Limit RSVP date range (30 days)
6. ✅ Rate limit public endpoints
7. ✅ Change event guard to fail closed
8. ✅ Add audit logging

**Current Risk Level:** 🔴 **HIGH**  
**After Fixes:** 🟢 **LOW**

---

## 📝 SUMMARY

**8 vulnerabilities found:**
- 1 Critical (no admin auth)
- 2 High (RSVP spam, invalid times)
- 4 Medium (timezone, date range, scraping, fail open)
- 1 Low (time values)

**All fixes provided above.**

**Estimated fix time:** 30 minutes  
**Lines to change:** ~50 lines across 4 files

---

**Audit completed:** October 19, 2025  
**Next audit:** After fixes applied

