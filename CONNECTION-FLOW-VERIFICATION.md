# CalleeNotification → GlobalCallHandler → BackgroundQueue Connection Verification

## 🔍 COMPLETE FLOW TRACE

---

## PART 1: GlobalCallHandler Setup

### File: `components/GlobalCallHandler.tsx`

#### Step 1: Import CalleeNotification (Line 8)
```typescript
import { CalleeNotification } from '@/components/matchmake/CalleeNotification';
```
✅ Component imported

#### Step 2: State for Incoming Invite (Line 16)
```typescript
const [incomingInvite, setIncomingInvite] = useState<any>(null);
```
✅ State to track incoming calls

#### Step 3: Socket Listener for call:notify (Lines 88-89)
```typescript
socket.on('call:notify', handleCallNotify);

// Handler defined at lines 49-54:
const handleCallNotify = (data: any) => {
  console.log('[GlobalCallHandler] ✅ INCOMING CALL:', data);
  console.log('[GlobalCallHandler] From:', data.fromUser?.name);
  console.log('[GlobalCallHandler] Current page:', window.location.pathname);
  setIncomingInvite(data);  // ← Sets state, triggers re-render
};
```
✅ Listener connected
✅ Sets state when call received

#### Step 4: Render CalleeNotification (Lines 117-151)
```typescript
{incomingInvite && (
  <CalleeNotification
    invite={incomingInvite}
    onAccept={(inviteId, requestedSeconds) => {
      // Lines 120-137
      const socket = getSocket();
      socket.emit('call:accept', { inviteId, requestedSeconds });
      setIncomingInvite(null);
    }}
    onDecline={(inviteId) => {
      // Lines 138-149
      const socket = getSocket();
      socket.emit('call:decline', { inviteId });
      setIncomingInvite(null);
    }}
  />
)}
```
✅ CalleeNotification renders when invite exists
✅ onAccept emits call:accept
✅ onDecline emits call:decline

#### Step 5: Socket Listener for call:start (Line 89)
```typescript
socket.on('call:start', handleCallStart);

// Handler defined at lines 57-73:
const handleCallStart = ({ roomId, agreedSeconds, isInitiator, chatMode, peerUser }) => {
  const mode = chatMode || 'video';
  
  if (mode === 'text') {
    router.push(`/text-room/${roomId}?...`);
  } else {
    router.push(`/room/${roomId}?...`);
  }
};
```
✅ Listener connected
✅ Navigates to room when both users accepted

---

## PART 2: BackgroundQueue Integration

### File: `lib/backgroundQueue.ts`

#### Line 40-47: setupGlobalCallListeners()
```typescript
private setupGlobalCallListeners() {
  // NOTE: Socket call listeners are handled by GlobalCallHandler
  // Background queue only manages queue state (join/leave/sync)
  // No need for call listeners here - GlobalCallHandler persists across all pages
  
  this.callListenersSetup = true;
  console.log('[BackgroundQueue] Call listeners handled by GlobalCallHandler (no duplication)');
}
```
✅ No duplicate listeners
✅ Acknowledges GlobalCallHandler handles calls

#### Lines 186-258: joinQueue() Method
```typescript
async joinQueue() {
  // Extensive checks with logging
  
  if (!this.socket) {
    console.warn('[BackgroundQueue] ❌ No socket, cannot join queue');
    return;
  }
  
  if (!this.socket.connected) {
    console.warn('[BackgroundQueue] ❌ Socket not connected, cannot join queue');
    return;
  }
  
  // ... profile checks ...
  
  this.socket.emit('queue:join');
  this.inQueue = true;
}
```
✅ Checks socket exists and connected
✅ Emits queue:join to mark user as available

---

## PART 3: Connection Verification

### Test 1: Is socket properly passed from GlobalCallHandler to backgroundQueue?

**GlobalCallHandler (Line 80):**
```typescript
backgroundQueue.init(socket);
```

**BackgroundQueue.init() (Line 23):**
```typescript
this.socket = socket;
```

✅ **CONNECTED** - Socket reference stored

---

### Test 2: Are listeners set up in correct order?

**Order:**
1. Socket connects (via socket.once('connect'))
2. backgroundQueue.init(socket) called
3. socket.on('call:notify') added
4. socket.on('call:start') added

✅ **CORRECT ORDER** - Background queue has socket before listeners added

---

### Test 3: Does CalleeNotification get data?

**Flow:**
1. Server emits `call:notify` → Socket receives it
2. GlobalCallHandler listener fires → `handleCallNotify(data)`
3. `setIncomingInvite(data)` → State updates
4. Component re-renders → `{incomingInvite && <CalleeNotification ...`
5. CalleeNotification mounts with `invite={incomingInvite}`

✅ **DATA FLOWS CORRECTLY**

---

### Test 4: Do CalleeNotification actions work?

**onAccept Flow:**
1. User clicks "Accept" in CalleeNotification
2. `onAccept(inviteId, requestedSeconds)` callback fires
3. GlobalCallHandler handler (line 120):
   - Gets socket: `const socket = getSocket()`
   - Emits: `socket.emit('call:accept', ...)`
   - Clears: `setIncomingInvite(null)`
4. Server receives call:accept
5. Server creates room and emits `call:start` to both users
6. GlobalCallHandler `call:start` listener fires
7. Navigates to room

✅ **ACCEPT FLOW WORKS**

**onDecline Flow:**
1. User clicks "Decline" in CalleeNotification
2. `onDecline(inviteId)` callback fires
3. GlobalCallHandler handler (line 138):
   - Gets socket: `const socket = getSocket()`
   - Emits: `socket.emit('call:decline', { inviteId })`
   - Clears: `setIncomingInvite(null)`
4. Server receives call:decline
5. Notification disappears

✅ **DECLINE FLOW WORKS**

---

## PART 4: Background Queue Sync Check

### Scenario: User on /settings with Background Queue ON

**State:**
- GlobalCallHandler: Mounted (from layout) ✅
- Socket: Connected ✅
- backgroundQueue.socket: Set ✅
- backgroundQueue.inQueue: true ✅
- Socket listeners: Active ✅

**Event: Another user sends invite**

```
Server emits: call:notify
  ↓
Socket receives event
  ↓
GlobalCallHandler listener fires (line 88)
  ↓
handleCallNotify() called (line 49)
  ↓
setIncomingInvite(data) ← State update
  ↓
Component re-renders
  ↓
{incomingInvite && ...} evaluates to true
  ↓
<CalleeNotification> renders
  ↓
Modal appears on /settings page ✅
```

**User clicks Accept:**

```
onAccept callback fires (line 120)
  ↓
getSocket() returns socket reference
  ↓
socket.emit('call:accept', ...) ← Send to server
  ↓
setIncomingInvite(null) ← Clear notification
  ↓
Server creates room
  ↓
Server emits call:start to BOTH users
  ↓
GlobalCallHandler call:start listener fires (line 89)
  ↓
handleCallStart() called (line 57)
  ↓
router.push('/room/{roomId}...') ← Navigate
  ↓
Both users enter room ✅
```

---

## PART 5: Potential Issues Check

### ❓ Issue 1: Is getSocket() in onAccept/onDecline reliable?

**Code:**
```typescript
const socket = getSocket();
if (socket) {
  socket.emit('call:accept', ...);
}
```

**Analysis:**
- getSocket() returns the singleton socket from lib/socket.ts
- Same socket that was passed to backgroundQueue.init()
- Should always exist if setup completed

✅ **RELIABLE** - But has null check for safety

---

### ❓ Issue 2: Could socket disconnect between setup and usage?

**Scenario:**
1. Socket connects
2. Background queue initialized
3. Socket disconnects (network issue)
4. User receives call
5. onAccept tries to emit but socket disconnected

**Current Protection:**
```typescript
if (socket) {
  socket.emit('call:accept', ...);
}
```

**Potential Issue:**
- Checks if socket exists, NOT if socket.connected
- If socket disconnected, emit might fail silently

🔶 **POTENTIAL ISSUE** - Should check socket.connected

---

### ❓ Issue 3: Does backgroundQueue.inQueue persist correctly?

**Check:**
- backgroundQueue is singleton (one instance for entire app)
- this.inQueue is private property
- Set to true in joinQueue()
- Set to false in leaveQueue()

✅ **PERSISTS CORRECTLY** - Singleton pattern works

---

## VERIFICATION RESULTS

### ✅ WORKING:
1. Socket connection to backgroundQueue
2. call:notify listener setup
3. call:start listener setup
4. CalleeNotification data flow
5. State management (incomingInvite)
6. Modal rendering on all pages
7. BackgroundQueue singleton

### 🔶 POTENTIAL IMPROVEMENT:
1. Check socket.connected in onAccept/onDecline, not just if socket exists

---

## RECOMMENDATION

Add connection check in onAccept/onDecline:

```typescript
onAccept={(inviteId, requestedSeconds) => {
  const socket = getSocket();
  if (socket && socket.connected) {  // ← Add .connected check
    socket.emit('call:accept', { inviteId, requestedSeconds });
  } else {
    console.error('[GlobalCallHandler] Socket not connected, cannot accept');
    // Show error to user?
  }
  setIncomingInvite(null);
}}
```

This would make it more robust against network disconnections.

---

**Overall Status:** ✅ **CONNECTED AND IN SYNC**

The flow is properly wired. CalleeNotification → GlobalCallHandler → backgroundQueue
are all connected correctly. The only improvement would be adding socket.connected
checks in the callbacks for extra robustness.
