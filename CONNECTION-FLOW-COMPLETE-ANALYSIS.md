# Complete Connection & Reconnection Flow Analysis

## VIDEO MODE CONNECTION FLOW

### Stage 1: Initial Connection (New Room)
```
User A invites User B → Both accept
  ↓
Server creates room with UUID
Room added to activeRooms Map
  ↓
Both users navigate to /room/{roomId}
  ↓
CLIENT CHECKS (app/room/[roomId]/page.tsx line 455-479):
  storedRoomId = sessionStorage.getItem('current_room_id')
  wasActiveCall = sessionStorage.getItem('room_connection_active')
  lastJoinTime = sessionStorage.getItem('room_join_time')
  
  Compare: storedRoomId === roomId?
  - Different room → Clear old sessionStorage
  - Same room + recent → This is reconnection
  
  New room: All checks fail (no stored data)
  ↓
CLIENT EMITS (line 482):
  socket.emit('room:join', { roomId })
  ↓
SERVER VALIDATES (server/src/index.ts line 1007-1020):
  - Room exists in activeRooms? 
    NO → emit('room:invalid')
    YES → continue
  - User is user1 or user2?
    NO → emit('room:unauthorized')  
    YES → continue
  - Room status === 'ended'?
    YES → emit('room:ended')
    NO → continue
  ↓
SERVER MARKS USER AS CONNECTED (line 1066-1068):
  room.user1Connected = true (or user2Connected)
  socket.join(roomId)
  ↓
SERVER EMITS CONFIRMATION (line 1075):
  socket.emit('room:joined', { roomId })
  ↓
CLIENT RECEIVES room:joined (app/room/[roomId]/page.tsx line 502-506):
  sessionStorage.setItem('current_room_id', roomId)
  sessionStorage.setItem('room_join_time', Date.now())
  sessionStorage.setItem('room_connection_active', 'true')
  ✅ STORED SUCCESSFULLY
  ↓
WebRTC Connection Process Begins:
  getUserMedia → Create PeerConnection → Exchange SDP → Connected
  ↓
ON SUCCESSFUL CONNECTION (line 275-277):
  sessionStorage.setItem('room_join_time', Date.now())
  ✅ TIMESTAMP UPDATED
```

### Stage 2: Tab Reload During Call
```
User refreshes browser tab (Cmd+R)
  ↓
Page reloads, component mounts
  ↓
CLIENT CHECKS sessionStorage (line 455-479):
  storedRoomId = current_room_id (from before reload)
  roomId = URL parameter (same room)
  wasActiveCall = 'true'
  lastJoinTime = timestamp from before reload
  timeSinceJoin = now - lastJoinTime
  
  CHECK: isSameRoom? YES
  CHECK: wasActiveCall? YES
  CHECK: timeSinceJoin < 30000? Depends on reload speed
  
  If YES to all → This is a reconnection attempt
  ↓
CLIENT EMITS (line 482):
  socket.emit('room:join', { roomId })
  ↓
SERVER RECEIVES (line 1030-1038):
  Room in grace_period?
    YES → Allow reconnection
    NO → Check if still active
  ↓
IF GRACE PERIOD:
  room.status = 'active'
  room.user1Connected (or user2) = true
  io.to(roomId).emit('room:partner-reconnected')
  ↓
CLIENT RECEIVES room:joined (line 502-506):
  sessionStorage updated AGAIN (timestamp refreshed)
  ✅ RECONNECTION SUCCESSFUL
  ↓
WebRTC re-establishes:
  Create new offer → Exchange SDP → Connected
```

### Stage 3: Network Disconnect (< 10s)
```
User's WiFi drops during active call
  ↓
WebRTC detects: connectionState = 'disconnected'
  ↓
CLIENT HANDLER FIRES (app/room/[roomId]/page.tsx line 346-446):
  CHECK: connectionPhase === 'connected'? 
    YES → Proceed
    NO → Ignore (not yet established)
  
  CHECK: Already reconnecting?
    YES → Skip duplicate
    NO → Continue
  ↓
CLIENT ENTERS GRACE PERIOD:
  setConnectionPhase('reconnecting')
  Show reconnecting banner
  
  Schedule 3 reconnection attempts:
    setTimeout(attemptReconnect, 2000)
    setTimeout(attemptReconnect, 5000)
    setTimeout(attemptReconnect, 8000)
  ↓
EACH ATTEMPT:
  pc.restartIce()
  If initiator: create new offer with iceRestart: true
  emit('rtc:offer', { roomId, offer })
  ↓
PARTNER RECEIVES OFFER:
  Sets remote description
  Creates answer
  Sends back answer
  ↓
CONNECTION RE-ESTABLISHES or FAILS
  ↓
IF SUCCESS (within 10s):
  pc.connectionState = 'connected'
  setConnectionPhase('connected')
  Clear reconnecting banner
  ✅ CALL CONTINUES
  
IF FAILURE (after 10s):
  emit('room:disconnected', { roomId })
  Server starts grace period
  Session ends if no reconnect
```

### Stage 4: Socket Disconnect (Server-side)
```
User's entire socket disconnects (not just WebRTC)
  ↓
SERVER DETECTS (server/src/index.ts line 1621-1656):
  Find user's active room
  Mark user as disconnected:
    room.user1Connected = false (or user2)
  ↓
START GRACE PERIOD:
  room.status = 'grace_period'
  room.gracePeriodExpires = now + 10000ms
  ↓
NOTIFY PARTNER:
  io.to(partnerSocketId).emit('room:partner-disconnected', {
    gracePeriodSeconds: 10
  })
  ↓
PARTNER SEES:
  "Partner Disconnected (10s countdown)"
  ↓
SCHEDULE CLEANUP (setTimeout 10s):
  If room still in grace_period:
    Save history
    Set cooldown
    Delete room
    Notify both users: room:ended-by-disconnect
  ↓
IF USER RECONNECTS (< 10s):
  Socket reconnects
  socket.on('reconnect') fires on client
  emit('room:join', { roomId })
  
  Server receives:
    room.status === 'grace_period'? YES
    Allow rejoin
    room.status = 'active'
    emit('room:partner-reconnected')
  
  ✅ RECONNECTION SUCCESSFUL
```

---

## TEXT MODE CONNECTION FLOW

### Stage 1: Initial Join
```
User A invites User B for text chat
  ↓
Server creates room (chatMode: 'text')
  ↓
CLIENT NAVIGATES to /text-room/{roomId}
  ↓
CLIENT CHECKS sessionStorage (app/text-room/[roomId]/page.tsx line 88-104):
  storedRoomId = current_text_room_id
  wasActive = text_room_active
  lastJoinTime = text_room_join_time
  
  Compare roomIds...
  New room: Different or no stored data
  ↓
CLIENT EMITS (line 112):
  socket.emit('room:join', { roomId })
  ↓
SERVER VALIDATES (same as video mode)
  ↓
SERVER EMITS (line 1075):
  socket.emit('room:joined', { roomId })
  ↓
CLIENT RECEIVES room:joined (line 110-114):
  sessionStorage.setItem('current_text_room_id', roomId)
  sessionStorage.setItem('text_room_join_time', Date.now())
  sessionStorage.setItem('text_room_active', 'true')
  ✅ STORED
  ↓
Torch Rule Begins:
  Server background job initializes activity tracking
  Both users' lastMessageAt = now
```

### Stage 2: Torch Rule Inactivity
```
Users chatting actively
  ↓
2 minutes pass with no messages
  ↓
SERVER BACKGROUND JOB (30s check):
  user1Inactive or user2Inactive > 120000ms?
    YES → Start warning
  ↓
EMIT WARNING:
  io.to(roomId).emit('textroom:inactivity-warning', { secondsRemaining: 60 })
  ↓
CLIENT RECEIVES:
  setInactivityWarning(true)
  setInactivityCountdown(60)
  Shows: "⚠️ Inactive: 60s"
  ↓
Every 30s:
  emit('textroom:inactivity-countdown', { remaining })
  Client updates: setInactivityCountdown(remaining)
  ↓
IF MESSAGE SENT:
  Update activity timestamp
  Clear warningStartedAt
  emit('textroom:inactivity-cleared')
  Client: setInactivityWarning(false)
  ✅ TORCH RELIT
  
IF NO MESSAGE (60s expires):
  emit('textroom:ended-inactivity')
  Save history, set cooldown, delete room
  Client: router.push('/history')
  ✅ SESSION ENDED
```

### Stage 3: Text Mode Reconnection
```
User's WiFi drops during text chat
  ↓
Socket.io detects disconnect
  ↓
CLIENT: socket.on('disconnect') fires (line 190-193):
  setShowReconnecting(true)
  setReconnectCountdown(10)
  Shows reconnecting modal
  ↓
SERVER: User's socket disconnects (line 1621-1656):
  Find user's room
  Mark disconnected
  Start grace period
  emit('room:partner-disconnected')
  ↓
PARTNER SEES:
  Reconnecting modal with countdown
  ↓
USER'S WIFI RETURNS (< 10s):
  Socket.io auto-reconnects
  ↓
CLIENT: socket.on('reconnect') fires (line 122-125):
  setShowReconnecting(false)
  emit('room:join', { roomId })
  ↓
SERVER: room:join received:
  room.status === 'grace_period'? YES
  Allow rejoin
  Reset activity timestamps (lines 1046-1058):
    activity.user1LastMessageAt = now
    Clear warningStartedAt
    emit('textroom:inactivity-cleared')
  
  emit('room:joined', { roomId })
  emit('room:partner-reconnected')
  ↓
CLIENT RECEIVES room:joined (line 110-114):
  sessionStorage updated
  ✅ RECONNECTION COMPLETE
  
Torch rule continues from where it left off
```

---

## ⚠️ BUGS FOUND IN REVIEW

### BUG 1: Video Playing Outside Overlay
**Location**: components/matchmake/UserCard.tsx line 163-177

**Current Code**:
```typescript
if (isActive && !isVideoPaused && overlayOpen) {
  video.play()
}
```

**Problem**: `overlayOpen` prop IS being passed, BUT:
- Only checks when `isActive` changes
- Doesn't re-check when `overlayOpen` changes

**Fix Needed**: Add `overlayOpen` to useEffect dependencies

---

### BUG 2: sessionStorage Race Condition
**Location**: Both room files

**Current Flow**:
```
1. Emit room:join
2. Wait for room:joined
3. Store sessionStorage
```

**Problem**: If socket disconnects between step 1 and 2, sessionStorage never stored.

**Impact**: Low - next reconnect will still work, just won't have stored data

---

### BUG 3: Text Mode Tab Reload Logic
**Location**: app/text-room/[roomId]/page.tsx lines 88-104

**Current Code Checks**:
- isSameRoom
- wasActive  
- isRecentReload

**Problem**: Sets showReconnecting(true) but server might have deleted room if > 10s

**Fix Needed**: Also check if room still exists before showing reconnecting

---

Let me fix these now...
