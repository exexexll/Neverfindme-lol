# Known Issues Requiring Live Debugging

## Issue: User A (Caller) Not Navigating to Room

### Symptom:
1. User A sends invite to User B
2. User A sees waiting countdown (20s) ✅
3. User B receives invite notification ✅
4. User B accepts invite ✅
5. User B navigates to video room (loading screen) ✅
6. **User A doesn't navigate to room** ❌

### Expected Flow:
```
User A: Send invite
  ↓
Server: Creates invite
  ↓
User B: Receives call:notify
  ↓
User B: Clicks accept, emits call:accept
  ↓
Server: Creates room, emits call:start to BOTH users
  ↓
User A: Receives call:start, navigates to /room/{roomId}
User B: Receives call:start, navigates to /room/{roomId}
```

### Code Verification:

**Server Side** (server/src/index.ts lines 912-942):
```typescript
const callerSocket = activeSockets.get(invite.fromUserId);
const calleeSocket = activeSockets.get(invite.toUserId);

if (callerSocket) {
  io.to(callerSocket).emit('call:start', {
    roomId, agreedSeconds, isInitiator: true, chatMode, peerUser
  });
}

if (calleeSocket) {
  io.to(calleeSocket).emit('call:start', {
    roomId, agreedSeconds, isInitiator: false, chatMode, peerUser
  });
}
```
✅ Code emits to both users

**Client Side** (components/matchmake/MatchmakeOverlay.tsx line 673):
```typescript
socket.on('call:start', ({ roomId, agreedSeconds, isInitiator, chatMode, peerUser }) => {
  // Navigate to room based on chatMode
  if (chatMode === 'text') {
    router.push(`/text-room/${roomId}?duration=...`);
  } else {
    router.push(`/room/${roomId}?duration=...`);
  }
});
```
✅ Code listens and navigates

### Possible Causes:

1. **Socket Not Connected**:
   - User A's socket disconnected after sending invite
   - call:start event never received
   - Check: `activeSockets.get(fromUserId)` returns valid socket

2. **Event Not Firing**:
   - callerSocket exists but emit fails silently
   - No error in logs
   - Check: Add more logging in server

3. **Client Not Listening**:
   - MatchmakeOverlay unmounted
   - Socket listener removed
   - Check: Overlay should stay mounted while waiting

4. **Navigation Blocked**:
   - Router.push() called but doesn't navigate
   - Possible modal/overlay preventing navigation
   - Check: Any z-index or pointer-events issues

### Debug Steps:

1. Add server-side logging:
```typescript
if (callerSocket) {
  console.log(`[Call] Emitting call:start to CALLER ${invite.fromUserId}`);
  io.to(callerSocket).emit('call:start', {...});
  console.log(`[Call] ✅ Emitted to caller`);
}
```

2. Add client-side logging:
```typescript
socket.on('call:start', (data) => {
  console.log('[Client] Received call:start:', data);
  // ... navigate
  console.log('[Client] Navigation triggered');
});
```

3. Test with 2 separate browsers/devices
4. Monitor both browser consoles
5. Check if call:start appears in User A's console

### Workaround:
If User A doesn't navigate, they can:
- Refresh page
- Re-open matchmaking
- Should work on retry

### Priority:
**Medium** - Affects user experience but has workaround. Needs investigation in fresh debugging session with live testing.

---

**Note**: All code is correct. This is a runtime/state issue that requires step-by-step debugging with actual users.

