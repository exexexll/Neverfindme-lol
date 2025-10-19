# 🔴 CRITICAL: Admin Session & WebSocket Issues

**Date:** October 19, 2025  
**Issues:** Admin 401 errors + WebSocket connection failures

---

## 🐛 Problem Summary

### Issue #1: Admin Session Lost (401 on `/admin/verify`)
**Error:** `Failed to load resource: the server responded with a status of 401`

**Root Cause:**
- Admin sessions are stored **in-memory** (`Map` in `admin-auth.ts`)
- Railway containers restart periodically (every 24-48 hours or on deploy)
- When container restarts → **all admin sessions wiped out**!
- Admin token in localStorage becomes invalid
- All admin API calls return 401

**Impact:**
- ❌ Admin panel stops working after backend restart
- ❌ QR code generation fails
- ❌ Event settings can't be saved
- ❌ Reports can't be reviewed

### Issue #2: WebSocket Connection Failing
**Error:** `WebSocket connection to 'wss://napalmsky-production.up.railway.app/socket.io/' failed`

**Possible Causes:**
1. Backend restarting during connection attempt
2. WebSocket upgrade not properly configured
3. Railway proxy issues
4. CORS/security headers blocking WebSocket

---

## ✅ Solution #1: Persist Admin Sessions to Database

### Current Code (server/src/admin-auth.ts):
```typescript
// ❌ IN-MEMORY: Lost on restart!
const adminSessions = new Map<string, { username: string; createdAt: number }>();
```

### Fixed Code:
```typescript
// ✅ DATABASE: Persists across restarts!
import { query } from './database';

// Create admin_sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

// Store session in database
async function createAdminSession(username: string): Promise<string> {
  const token = uuidv4();
  await query(
    'INSERT INTO admin_sessions (token, username, created_at) VALUES ($1, $2, $3)',
    [token, username, Date.now()]
  );
  return token;
}

// Verify session from database
async function verifyAdminSession(token: string): Promise<boolean> {
  const result = await query(
    'SELECT * FROM admin_sessions WHERE token = $1 AND created_at > $2',
    [token, Date.now() - ADMIN_SESSION_EXPIRY]
  );
  return result.rows.length > 0;
}
```

---

## ✅ Solution #2: Better Error Handling in Admin Panel

### Update app/admin/page.tsx:

```typescript
// Better error handling with auto-redirect
useEffect(() => {
  const adminToken = localStorage.getItem('napalmsky_admin_token');
  
  if (!adminToken) {
    router.push('/admin-login');
    return;
  }

  // Verify admin token
  fetch(`${API_BASE}/admin/verify`, {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  })
    .then(res => {
      if (!res.ok) {
        // Session expired or invalid
        console.log('[Admin] Session invalid, redirecting to login...');
        localStorage.removeItem('napalmsky_admin_token');
        router.push('/admin-login');
        return;
      }
      return res.json();
    })
    .then((data) => {
      if (data) {
        console.log('[Admin] Session verified, loading data...');
        loadData();
      }
    })
    .catch((err) => {
      console.error('[Admin] Verification failed:', err);
      localStorage.removeItem('napalmsky_admin_token');
      router.push('/admin-login');
    });
}, [router]);
```

---

## ✅ Solution #3: Fix WebSocket Connection

### Check Railway Configuration

**1. Verify WebSocket support in Railway:**
- Railway supports WebSockets by default
- But proxy timeout might be too short

**2. Update Socket.io connection options:**

```typescript
// lib/socket.ts
import { io } from 'socket.io-client';

export function connectSocket(sessionToken: string) {
  const socket = io(SOCKET_URL, {
    auth: { sessionToken },
    transports: ['websocket', 'polling'], // Try polling as fallback
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    timeout: 20000, // Increase timeout
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
    // Fallback to polling
    socket.io.opts.transports = ['polling', 'websocket'];
  });

  return socket;
}
```

**3. Check server CORS configuration (server/src/index.ts):**

```typescript
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Support older clients
});
```

---

## 🚀 Immediate Fixes to Deploy

### Fix #1: Admin Page Error Handling (Quick Fix)

Update `app/admin/page.tsx` to show helpful error when session invalid:

```typescript
// Add state for session error
const [sessionError, setSessionError] = useState(false);

// In verification
.catch(() => {
  setSessionError(true);
  setTimeout(() => {
    localStorage.removeItem('napalmsky_admin_token');
    router.push('/admin-login');
  }, 2000);
});

// Show error UI
if (sessionError) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
      <div className="text-center">
        <div className="mb-4 text-4xl">🔒</div>
        <p className="text-[#eaeaf0] text-xl mb-2">Session Expired</p>
        <p className="text-[#eaeaf0]/70">Redirecting to login...</p>
      </div>
    </div>
  );
}
```

### Fix #2: Database Migration for Admin Sessions (Proper Fix)

```sql
-- Add to your database schema
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  last_activity BIGINT NOT NULL
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires 
ON admin_sessions(expires_at);
```

Update `server/src/admin-auth.ts` to use database instead of Map.

---

## 🔍 Debugging Steps

### Check if admin session exists:

```bash
# In browser console on admin page
console.log('Admin token:', localStorage.getItem('napalmsky_admin_token'));

# Then in Railway logs, search for:
"[Admin] Admin logged in:"
"[Admin] Session invalid:"
```

### Test WebSocket connection:

```javascript
// In browser console
const socket = io('https://napalmsky-production.up.railway.app', {
  transports: ['websocket']
});

socket.on('connect', () => console.log('✅ Connected'));
socket.on('connect_error', (err) => console.error('❌ Error:', err));
```

### Check Railway backend status:

1. Go to Railway dashboard
2. Check if backend service is "Active" (green)
3. Look at logs for errors
4. Check last deployment time

---

## 📝 Current Workaround

### Until database fix is deployed:

1. **Admin session lost?**
   - Go to `/admin-login`
   - Login again (Username: Hanson, Password: 328077)
   - Token will work until next backend restart

2. **WebSocket failing?**
   - Refresh the page
   - Socket.io will fallback to polling automatically
   - Check console for "Socket.io polling" messages

---

## 🎯 Long-term Solution

### Priority 1: Admin Sessions → PostgreSQL
- Store in database table
- Persist across restarts
- ETA: 2-3 hours implementation

### Priority 2: WebSocket Reliability
- Add connection retry logic
- Better error messages
- Fallback to polling
- ETA: 1 hour implementation

### Priority 3: Redis (Optional)
- Use Redis for admin sessions
- Use Redis for Socket.io adapter (scales to multiple servers)
- ETA: 4-6 hours setup

---

## 🔒 Security Note

Admin credentials are currently hardcoded:
```typescript
const ADMIN_USERNAME = 'Hanson';
const ADMIN_PASSWORD_HASH = '$2b$12$51/ipDaDcOudvkQ8KZBdlO...';
// Password: 328077 (bcrypt hashed)
```

**For production:**
- Move to environment variables
- Support multiple admin users
- Add password reset flow
- Add 2FA for admin accounts

---

## ✅ Testing Checklist

After deploying fixes:

- [ ] Admin login works
- [ ] Admin session persists after backend restart
- [ ] QR code generation works
- [ ] Event settings save successfully
- [ ] WebSocket connects without errors
- [ ] Socket reconnects automatically on disconnect
- [ ] Admin can review reports
- [ ] All admin API calls succeed

---

**Status:** Issues identified, fixes ready to implement  
**Impact:** HIGH (admin panel unusable after restarts)  
**Priority:** CRITICAL  
**Recommendation:** Deploy database fix ASAP

