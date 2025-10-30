FUNCTIONALITY CHECK - ALL ROUTES AFTER USC CHANGES
===================================================

## Changes Made to USC Verification

1. Changed from `export default router` to function export
2. Now requires `io` and `activeSockets` parameters
3. Used in index.ts as: createUSCVerificationRoutes(io, activeSockets)

---

## Checking All Affected Areas

### 1. Email Login Single Session
File: server/src/auth.ts line 387-411

Logic:
```typescript
let invalidatedCount = 0;
try {
  await store.createSession(session);  // Create new first
  invalidatedCount = await store.invalidateUserSessions(user.userId, sessionToken);  // Keep new, invalidate old
  // Notify old sessions via Socket.IO
  if (invalidatedCount > 0) {
    sockets.forEach(socketId => {
      io.to(socketId).emit('session:invalidated', {
        message: 'You have been logged out because you logged in from another device.',
        reason: 'new_login',
      });
    });
  }
} catch (sessionErr: any) {
  throw new Error('Failed to create session');
}
```

Status: ✅ CORRECT (creates new, invalidates old except new)

### 2. USC Login Single Session
File: server/src/usc-verification.ts line 353-388

Logic:
```typescript
try {
  await store.createSession(session);  // Create new first
  const invalidatedCount = await store.invalidateUserSessions(user.user_id, sessionToken);  // Keep new, invalidate old
  // Notify old sessions via Socket.IO
  if (invalidatedCount > 0) {
    sockets.forEach(socketId => {
      io.to(socketId).emit('session:invalidated', {...});
    });
  }
}
```

Status: ✅ CORRECT (same pattern as email login)

### 3. USC Route Registration
File: server/src/index.ts line 512

Before: app.use('/usc', apiLimiter, uscVerificationRoutes);
After:  app.use('/usc', apiLimiter, createUSCVerificationRoutes(io, activeSockets));

Status: ✅ CORRECT (passes required parameters)

---

## Testing All USC Endpoints

1. POST /usc/verify-card
   - Used during onboarding USC card scan
   - Validates and logs scan attempts
   - Status: ✅ Should work (no dependencies on io/sockets)

2. POST /usc/login-card
   - Used for USC card login
   - NOW notifies old sessions ✅
   - Status: ✅ IMPROVED

3. POST /usc/finalize-registration
   - Called after onboarding to save USC card
   - No session operations
   - Status: ✅ Should work (no dependencies on io/sockets)

---

## Checking Side Effects

### Import Change
Before: import uscVerificationRoutes from './usc-verification';
After:  import createUSCVerificationRoutes from './usc-verification';

Risk: Name change could break if used elsewhere
Check: Only used in one place (line 512) ✅

### Function Signature
Before: No parameters
After:  (io: SocketServer, activeSockets: Map<string, string>)

Risk: Must be called with parameters
Check: Called correctly in index.ts ✅

### Export
Before: export default router;
After:  return router; (inside function)
        export default (io, activeSockets) => createUSCRoutes(io, activeSockets);

Risk: Backward compatibility
Check: Default export still exists ✅

---

Checking for build errors...
