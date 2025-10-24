# WebRTC Reconnection Logic - Complete Pipeline

## 🔄 Connection Flow Pipeline

### Initial Room Join (New Room)

```
1. User navigates to /room/[roomId]
   ↓
2. Component mounts, initializeRoom() runs
   ↓
3. Check sessionStorage:
   - storedRoomId = previous room (or null)
   - wasActiveCall = 'true' (from previous room)
   - roomId = NEW room ID
   ↓
4. Compare roomIds:
   if (storedRoomId !== roomId) {
     → Clear old session data
     → NOT a reconnection
     → connectionPhase = 'initializing'
   }
   ↓
5. Store NEW room info:
   - sessionStorage.setItem('current_room_id', NEW_ROOM_ID)
   - sessionStorage.setItem('room_join_time', NOW)
   - sessionStorage.setItem('room_connection_active', 'true')
   ↓
6. Connect WebRTC:
   - Create PeerConnection
   - Get user media
   - Exchange SDP offers/answers
   - connectionPhase: initializing → gathering → connecting
   ↓
7. On remote track received:
   - connectionPhase → 'connected'
   - Update timestamp in sessionStorage
   ↓
8. Start timer countdown
```

---

### Tab Reload (Same Room)

```
1. User presses Cmd+R during active call
   ↓
2. Page reloads, component remounts
   ↓
3. Check sessionStorage:
   - storedRoomId = CURRENT room ID
   - wasActiveCall = 'true'
   - lastJoinTime = recent timestamp
   - timeSinceJoin = ~2 seconds
   ↓
4. Reconnection detection:
   if (storedRoomId === roomId &&
       wasActiveCall === 'true' &&
       timeSinceJoin < 30000) {
     → IS a reconnection!
     → connectionPhase = 'reconnecting'
   }
   ↓
5. Socket reconnects automatically
   ↓
6. Server allows rejoin (grace period)
   ↓
7. WebRTC renegotiation:
   - ICE restart triggered
   - New offer/answer exchange
   - connectionPhase → 'connected'
   ↓
8. Call continues normally
```

---

### Network Disconnect (During Call)

```
1. User's WiFi drops during active call
   ↓
2. WebRTC state changes:
   - pc.connectionState: 'connected' → 'disconnected'
   ↓
3. onconnectionstatechange fires:
   - Check: if (connectionPhase !== 'connected') → ignore
   - connectionPhase IS 'connected' → proceed
   ↓
4. Enter grace period:
   - connectionPhase → 'reconnecting'
   - Show yellow banner
   - Start 10-second countdown
   ↓
5. Automatic reconnection attempts:
   - Attempt 1 at 2 seconds (ICE restart)
   - Attempt 2 at 5 seconds
   - Attempt 3 at 8 seconds
   ↓
6a. SUCCESS (WiFi back on):
    - pc.connectionState → 'connected'
    - connectionPhase → 'connected'
    - Clear banner
    - Call continues
    
6b. FAILURE (no reconnection after 10s):
    - Emit 'room:disconnected' to server
    - Show error message
    - End call gracefully
```

---

### Component Unmount (Leave Call)

```
1. User clicks "Leave" or timer expires
   ↓
2. handleEndCall() called
   ↓
3. Cleanup:
   - Clear all sessionStorage:
     * room_connection_active
     * room_join_time
     * current_room_id
   - Stop all media tracks
   - Close PeerConnection
   - Disconnect socket
   ↓
4. Navigate away
   ↓
5. Next room join will be treated as NEW room ✅
```

---

## 🐛 Bug Fixes Applied

### Bug 1: Reconnection Popup on New Room
**Problem**: When joining Room B after Room A, saw reconnection popup

**Root Cause**: 
```typescript
// sessionStorage from Room A:
room_connection_active = 'true'
current_room_id = 'room-A-id'

// User joins Room B:
wasActiveCall = 'true' ← Still true from Room A!
// Triggered false reconnection
```

**Fix**:
```typescript
const isSameRoom = storedRoomId === roomId;

if (isSameRoom && wasActiveCall && isRecentReload) {
  // Reconnection
} else if (!isSameRoom && wasActiveCall) {
  // NEW ROOM - clear old data
  sessionStorage.removeItem('room_connection_active');
  sessionStorage.removeItem('room_join_time');
  sessionStorage.removeItem('current_room_id');
}
```

---

### Bug 2: Immediate Disconnection on Initial Connection
**Problem**: Room created then immediately deleted/disconnected

**Root Cause**: False reconnection state triggered disconnection handler

**Fix**:
```typescript
if (state === 'disconnected') {
  // CRITICAL: Only handle if truly connected before
  if (connectionPhase !== 'connected' && connectionPhase !== 'reconnecting') {
    console.log('[WebRTC] Ignoring - not established yet');
    return;
  }
  
  // Don't trigger if already reconnecting
  if (connectionPhase === 'reconnecting') {
    console.log('[WebRTC] Already reconnecting - skip');
    return;
  }
  
  // Now handle real disconnection
}
```

---

### Bug 3: Sessions Ending Prematurely
**Problem**: Timer ending before reaching 0

**Root Cause**: Disconnection handler firing during normal ICE negotiation

**Fix**: Added connection phase validation (see Bug 2 fix above)

---

## ✅ Validation Checks

### On Initial Connection:
```javascript
// Console should show:
[Room] New room detected - clearing old session data
[WebRTC] PeerConnection created
[WebRTC] Connection state: connecting
[WebRTC] Connection state: connected
[Timer] Starting countdown from X seconds

// Should NOT show:
❌ [Room] Detected tab reload during active call
❌ [WebRTC] Already in reconnecting state
```

### On Tab Reload:
```javascript
// Console should show:
[Room] Detected tab reload during active call - attempting reconnection
[Room] Socket reconnected after disconnect - rejoining room
[WebRTC] Creating new offer for reconnection
[WebRTC] ✅ Reconnected successfully

// SessionStorage should have:
current_room_id = SAME_ROOM_ID ✅
room_join_time = recent timestamp ✅
room_connection_active = 'true' ✅
```

### On Network Disconnect:
```javascript
// Console should show:
[WebRTC] Connection disconnected - entering grace period
[WebRTC] Reconnection attempt 1/3
[WebRTC] Reconnection attempt 2/3
[WebRTC] Reconnection attempt 3/3
[WebRTC] ✅ Reconnected successfully
// OR
[WebRTC] Still disconnected after 10000ms grace period
```

---

## 🎯 SessionStorage States

| Scenario | current_room_id | room_connection_active | room_join_time |
|----------|----------------|----------------------|----------------|
| Before any call | null | null | null |
| During Room A (connected) | room-A-id | 'true' | timestamp-A |
| After leaving Room A | (removed) | (removed) | (removed) |
| Entering Room B | room-B-id | 'true' | timestamp-B |
| Tab reload Room B (< 30s) | room-B-id | 'true' | timestamp-B (old) |
| After reconnection | room-B-id | 'true' | timestamp-B (updated) |

---

## 🔍 Debugging Commands

### Check SessionStorage:
```javascript
// In browser console:
sessionStorage.getItem('current_room_id')
sessionStorage.getItem('room_connection_active')
sessionStorage.getItem('room_join_time')

// Check if room IDs match:
window.location.pathname.includes(sessionStorage.getItem('current_room_id'))
```

### Check Connection Phase:
```javascript
// Current state:
// (inspect React DevTools or add console.log)

// Time since join:
const lastJoin = parseInt(sessionStorage.getItem('room_join_time') || '0');
const timeSince = Date.now() - lastJoin;
console.log('Time since join:', timeSince / 1000, 'seconds');
```

### Force Clear SessionStorage:
```javascript
// If stuck in reconnection state:
sessionStorage.clear();
// Then reload page
```

---

## 📊 Expected Behavior Matrix

| Action | storedRoomId | currentRoomId | Match | Result |
|--------|-------------|---------------|-------|--------|
| First call ever | null | room-A | No | New room ✅ |
| Join Room B after A | room-A | room-B | No | New room ✅ |
| Reload Room B (< 30s) | room-B | room-B | Yes | Reconnection ✅ |
| Reload Room B (> 30s) | room-B | room-B | Yes (but timeout) | New connection ✅ |
| Join Room C after reload | room-B | room-C | No | New room ✅ |

---

## 🚀 Text Mode Compatibility

**Text mode is NOT affected** because:
1. Text mode uses different component (not `app/room/[roomId]/page.tsx`)
2. Text mode = socket-only messaging (no WebRTC)
3. Text mode has separate inactivity system (2 min + 60s)
4. Server handles both with `chatMode` field
5. Reconnection logic only applies to video/audio calls

**Text Mode Reconnection**:
- Uses Socket.io's built-in reconnection
- Room persists on server during brief disconnects
- No SDP/ICE negotiation needed
- Works independently from video reconnection logic

---

## ✅ Testing Checklist

- [ ] Join Room A (first time) → Shows normal loading, NOT reconnection
- [ ] Call runs full duration without premature ending
- [ ] Leave Room A → Join Room B → Shows normal loading, NOT reconnection
- [ ] During Room B: Reload tab → Shows reconnection screen → Reconnects successfully
- [ ] During call: Turn off WiFi 3s → Turn back on → Auto-reconnects
- [ ] During call: Turn off WiFi 15s → Shows error after 10s grace period
- [ ] Text mode chat → Works normally, no interference from video reconnection logic

---

**Version**: 3.0  
**Date**: October 24, 2025  
**Status**: Complete fix for false positive reconnection detection

