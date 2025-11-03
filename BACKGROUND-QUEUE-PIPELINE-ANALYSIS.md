# Background Queue Pipeline - Complete Line-by-Line Analysis

## 🔍 COMPLETE FLOW BREAKDOWN

---

## STAGE 1: App Initialization (Page Load)

### File: `app/layout.tsx` (Root Layout - Server Component)

```typescript
// Line 103
<GlobalCallHandler />
```

**What happens:**
- Root layout mounts GlobalCallHandler as the **LAST component** in body
- This component persists across **ALL** page navigation
- Mounts on every page: /main, /settings, /profile, /history, /socials, etc.

---

## STAGE 2: GlobalCallHandler Initialization

### File: `components/GlobalCallHandler.tsx`

#### Lines 19-25: Session Check
```typescript
useEffect(() => {
  const session = getSession();
  if (!session) {
    console.log('[GlobalCallHandler] No session, skipping socket setup');
    return;
  }
```

**What happens:**
- Gets session from localStorage ('bumpin_session')
- If no session (user not logged in), skip everything
- If session exists, continue to socket setup

#### Lines 27-39: Socket Connection

```typescript
  console.log('[GlobalCallHandler] Initializing socket connection...');

  let socket = getSocket();
  if (!socket) {
    console.log('[GlobalCallHandler] No socket exists, creating new connection...');
    socket = connectSocket(session.sessionToken);
  } else if (!socket.connected) {
    console.log('[GlobalCallHandler] Socket exists but not connected, reconnecting...');
    socket = connectSocket(session.sessionToken);
  } else {
    console.log('[GlobalCallHandler] Reusing existing connected socket:', socket.id);
  }
```

**What happens:**
1. Check if socket already exists (from previous page or component)
2. **Case A**: No socket → Create new connection with `connectSocket()`
3. **Case B**: Socket exists but disconnected → Reconnect
4. **Case C**: Socket connected → Reuse it

`connectSocket()` does (from `lib/socket.ts`):
- Creates Socket.IO connection to server
- Sends session token in auth handshake
- Returns socket instance immediately (connection happens async)

#### Lines 41-44: Error Check
```typescript
  if (!socket) {
    console.error('[GlobalCallHandler] ❌ Failed to get/create socket - aborting setup');
    return;
  }
```

**What happens:**
- If socket creation failed, abort
- This should never happen unless major error

#### Lines 46-51: Background Queue Initialization

```typescript
  console.log('[GlobalCallHandler] Socket obtained, setting up listeners and background queue...');

  backgroundQueue.init(socket);
  console.log('[GlobalCallHandler] ✅ Background queue initialized with socket');
```

**What happens:**
- Calls `backgroundQueue.init(socket)` from `lib/backgroundQueue.ts`
- This is the **ONLY** place backgroundQueue should be initialized
- **CRITICAL**: Must happen before any page tries to use backgroundQueue

---

## STAGE 3: Background Queue Init

### File: `lib/backgroundQueue.ts`

#### Lines 21-38: init() Method

```typescript
init(socket: Socket) {
  // Update socket reference (might be new socket after reconnect)
  this.socket = socket;
  
  // Setup visibility/activity detection only once
  if (this.activityListeners.length === 0) {
    this.setupVisibilityDetection();
    this.setupActivityDetection();
    console.log('[BackgroundQueue] Visibility and activity detection setup');
  }
  
  // Setup call listeners only once
  if (!this.callListenersSetup) {
    this.setupGlobalCallListeners();
  } else {
    console.log('[BackgroundQueue] Already initialized (call listeners active)');
  }
}
```

**What happens:**
1. **Store socket reference** in `this.socket`
2. **Setup visibility detection** (only once):
   - Listens for tab hidden/visible
   - Starts 1-min countdown when tab hidden
   - Leaves queue if hidden for >1 min
3. **Setup activity detection** (only once):
   - Tracks mouse/keyboard/touch events
   - Leaves queue if idle for >5 min
4. **Setup call listeners** (only once):
   - Now just logs (listeners in GlobalCallHandler)

**Idempotent:** Safe to call multiple times (checks before setting up)

---

## STAGE 4: User Navigates to /main Page

### File: `app/main/page.tsx`

#### Lines 22-25: Component State
```typescript
const [loading, setLoading] = useState(true);
const [showMatchmake, setShowMatchmake] = useState(false);
const [directMatchTarget, setDirectMatchTarget] = useState<string | null>(null);
const [backgroundQueueEnabled, setBackgroundQueueEnabled] = useState(false);
```

#### Lines 44-46: Load Saved Toggle State
```typescript
useEffect(() => {
  const saved = localStorage.getItem('bumpin_background_queue');
  setBackgroundQueueEnabled(saved === 'true');
}, []);
```

**What happens:**
- Checks localStorage for saved toggle state
- If user previously enabled background queue, restore it

#### Lines 51-64: Sync Background Queue (FIXED - No Duplicate Init)

```typescript
useEffect(() => {
  console.log('[Main] Syncing background queue with toggle:', backgroundQueueEnabled);
  backgroundQueue.syncWithToggle(backgroundQueueEnabled);
  
  return () => {
    if (!backgroundQueueEnabled) {
      backgroundQueue.cleanup();
    }
  };
}, [backgroundQueueEnabled]);
```

**What happens:**
- **OLD CODE (BROKEN)**: Called `backgroundQueue.init(socket)` here
  - But socket might not be ready yet (race condition)
  - Caused "No socket" error
- **NEW CODE (FIXED)**: Only syncs toggle state
  - GlobalCallHandler already initialized background queue
  - This just calls joinQueue() or leaveQueue() based on toggle

---

## STAGE 5: User Enables Background Queue Toggle

### User Action: Clicks toggle on /main page

#### Lines 229-240: Toggle onChange Handler (Desktop)
```typescript
onChange={(enabled) => {
  setBackgroundQueueEnabled(enabled);
  localStorage.setItem('bumpin_background_queue', String(enabled));
  console.log('[Main] Background queue:', enabled ? 'ON' : 'OFF');
  
  if (enabled) {
    backgroundQueue.joinQueue();
  } else {
    backgroundQueue.leaveQueue();
  }
}}
```

**What happens:**
1. Update state: `setBackgroundQueueEnabled(true)`
2. Save to localStorage: `'bumpin_background_queue' = 'true'`
3. Call `backgroundQueue.joinQueue()`

---

## STAGE 6: Background Queue Join

### File: `lib/backgroundQueue.ts`

#### Lines 186-258: joinQueue() Method (With Debug Logging)

```typescript
async joinQueue() {
  // Lines 187-193: Debug logging
  console.log('[BackgroundQueue] ========== JOIN QUEUE CALLED ==========');
  console.log('[BackgroundQueue] Socket exists:', !!this.socket);
  console.log('[BackgroundQueue] Socket connected:', this.socket?.connected);
  console.log('[BackgroundQueue] Already in queue:', this.inQueue);
  console.log('[BackgroundQueue] Document hidden:', document.hidden);
  console.log('[BackgroundQueue] Background enabled:', this.isBackgroundEnabled());
  console.log('[BackgroundQueue] Current page:', window.location.pathname);
  
  // Lines 195-203: Socket checks
  if (!this.socket) {
    console.warn('[BackgroundQueue] ❌ No socket, cannot join queue');
    return; // ABORT - This was the error user saw!
  }
  
  if (!this.socket.connected) {
    console.warn('[BackgroundQueue] ❌ Socket not connected, cannot join queue');
    return; // ABORT
  }
  
  // Lines 206-209: Visibility check
  if (document.hidden) {
    console.log('[BackgroundQueue] ⚠️ Tab hidden, not joining queue');
    return;
  }
  
  // Lines 212-217: Page restriction when toggle OFF
  if (!this.isBackgroundEnabled()) {
    if (window.location.pathname !== '/main') {
      console.log('[BackgroundQueue] ⚠️ Background disabled, not on /main, not joining');
      return;
    }
  }
  
  // Lines 220-251: Profile completeness check
  if (!this.profileComplete) {
    const session = JSON.parse(localStorage.getItem('bumpin_session') || 'null');
    
    if (session) {
      const res = await fetch(`${API_BASE}/user/me`, {
        headers: { 'Authorization': `Bearer ${session.sessionToken}` },
      });
      
      const user = await res.json();
      
      if (!user.selfieUrl || !user.videoUrl) {
        console.warn('[BackgroundQueue] Profile incomplete, cannot join queue');
        return; // ABORT
      }
      
      this.profileComplete = true;
    }
  }
  
  // Lines 254-258: Actually join queue
  console.log('[BackgroundQueue] ✅ Emitting queue:join to server');
  this.socket.emit('queue:join');
  this.inQueue = true;
  this.lastActivity = Date.now();
  console.log('[BackgroundQueue] ✅ Successfully joined queue, inQueue =', this.inQueue);
}
```

**What happens:**
1. **Extensive checks** before joining (with debug logs)
2. **If socket exists and connected** → Proceed
3. **Check profile complete** (must have selfie AND video)
4. **Emit 'queue:join'** to server
5. **Set `inQueue = true`** locally

**BEFORE FIX:** this.socket was null (race condition)
**AFTER FIX:** this.socket set by GlobalCallHandler

---

## STAGE 7: User Navigates to /settings

### User Action: Clicks "Settings" button

#### File: `app/main/page.tsx` - Lines 282-285 (Desktop)
```typescript
<Link
  href="/settings"
  className="..."
>
  Settings
</Link>
```

**What happens:**
1. Next.js client-side navigation to /settings
2. Main page component unmounts
3. Settings page mounts
4. **GlobalCallHandler stays mounted** (in layout!)
5. **Socket stays connected** (GlobalCallHandler manages it)
6. **Background queue stays active** (if toggle ON)

#### Overlay Close Handler (if overlay was open) - Lines 379-395

```typescript
onClose={() => {
  console.log('[Main] Closing matchmaking overlay');
  
  // Check toggle state
  if (!backgroundQueueEnabled) {
    console.log('[Main] Background queue toggle OFF - leaving queue');
    backgroundQueue.leaveQueue();
  } else {
    console.log('[Main] Background queue toggle ON - staying in queue for other pages');
    // Stay in queue!
  }
  
  setShowMatchmake(false);
  setDirectMatchTarget(null);
}}
```

**What happens:**
- **Toggle OFF**: Leaves queue (user only wanted queue while on /main)
- **Toggle ON**: Stays in queue (user wants background queue on all pages)

---

## STAGE 8: Incoming Call While on /settings

### Server Action: Another user sends invite

#### Server emits: `call:notify` to User B's socket

**What happens on client:**

1. **Socket receives event** (socket connection still active)

2. **GlobalCallHandler listener fires** (Line 83 in GlobalCallHandler.tsx)
```typescript
socket.on('call:notify', handleCallNotify);

const handleCallNotify = (data: any) => {
  console.log('[GlobalCallHandler] ✅ INCOMING CALL:', data);
  setIncomingInvite(data);
};
```

3. **CalleeNotification renders** (Lines 98-132)
```typescript
{incomingInvite && (
  <CalleeNotification
    invite={incomingInvite}
    onAccept={(inviteId, requestedSeconds) => {
      // Emit call:accept
      getSocket().emit('call:accept', { inviteId, requestedSeconds });
      setIncomingInvite(null);
    }}
    onDecline={(inviteId) => {
      getSocket().emit('call:decline', { inviteId });
      setIncomingInvite(null);
    }}
  />
)}
```

4. **Modal appears on /settings page** ✅

---

## STAGE 9: User Accepts Call

### User Action: Clicks "Accept" button

#### GlobalCallHandler onAccept (Lines 101-117)

```typescript
onAccept={(inviteId, requestedSeconds) => {
  console.log('[GlobalCallHandler] ✅ Call ACCEPTED');

  const socket = getSocket();
  if (socket) {
    socket.emit('call:accept', {
      inviteId,
      requestedSeconds,
    });
  }

  setIncomingInvite(null);
  console.log('[GlobalCallHandler] Waiting for call:start...');
}}
```

**What happens:**
1. Emit `call:accept` to server immediately
2. Clear notification
3. Wait for server to emit `call:start`

---

## STAGE 10: Server Creates Room

### Server Action: Receives call:accept

**Server logic:**
1. Calculates agreed duration (average of requested times)
2. Creates room ID
3. Stores room in activeRooms Map
4. Emits `call:start` to **BOTH** users (sender and acceptor)

---

## STAGE 11: Navigate to Room

### Both users receive: `call:start` event

#### GlobalCallHandler listener (Lines 60-76)

```typescript
const handleCallStart = ({ roomId, agreedSeconds, isInitiator, chatMode, peerUser }) => {
  console.log('[GlobalCallHandler] ✅ CALL STARTING:', { roomId, agreedSeconds, chatMode });
  console.log('[GlobalCallHandler] Navigating to room from:', window.location.pathname);

  const mode = chatMode || 'video';

  if (mode === 'text') {
    router.push(`/text-room/${roomId}?duration=...`);
  } else {
    router.push(`/room/${roomId}?duration=...`);
  }
};
```

**What happens:**
1. **User A (sender)**: Navigates from wherever they are → `/room/{roomId}`
2. **User B (receiver)**: Navigates from `/settings` → `/room/{roomId}`
3. **Both enter room successfully** ✅

---

## 🐛 THE BUG THAT WAS FIXED

### OLD ARCHITECTURE (BROKEN):

```
App loads
  ↓
GlobalCallHandler mounts
  ├─ Starts connecting socket (ASYNC)
  └─ Will call backgroundQueue.init() when done
  
Main page mounts (SAME TIME)
  ├─ Immediately calls getSocket()
  ├─ Socket not ready yet → NULL
  ├─ Calls backgroundQueue.init(null)
  └─ ❌ Background queue has no socket!

User clicks toggle ON
  ↓
backgroundQueue.joinQueue()
  ↓
Check: if (!this.socket) return;
  ↓
❌ ERROR: "No socket, cannot join queue"
```

### NEW ARCHITECTURE (FIXED):

```
App loads
  ↓
GlobalCallHandler mounts
  ├─ Connects socket
  ├─ Calls backgroundQueue.init(socket) ✅
  └─ Socket available

Main page mounts
  ├─ Does NOT call init()
  └─ Only syncs toggle state

User clicks toggle ON
  ↓
backgroundQueue.joinQueue()
  ↓
Check: if (!this.socket) return;
  ↓
this.socket EXISTS (from GlobalCallHandler init) ✅
  ↓
✅ SUCCESS: Joins queue
```

---

## 📋 CRITICAL CODE LOCATIONS

### 1. Socket Creation
- **File:** `lib/socket.ts`
- **Function:** `connectSocket(sessionToken)`
- **Line:** 31-94
- **Purpose:** Create/reuse Socket.IO connection

### 2. Background Queue Singleton
- **File:** `lib/backgroundQueue.ts`
- **Line:** 307-308
- **Code:** `export const backgroundQueue = new BackgroundQueueManager();`
- **Purpose:** Single instance shared across entire app

### 3. GlobalCallHandler Mount
- **File:** `app/layout.tsx`
- **Line:** 103
- **Purpose:** Mount persistent handler in root layout

### 4. Background Queue Init
- **File:** `components/GlobalCallHandler.tsx`
- **Line:** 50
- **Code:** `backgroundQueue.init(socket);`
- **Purpose:** Initialize singleton with socket

### 5. Join Queue
- **File:** `app/main/page.tsx`
- **Lines:** 236, 321
- **Code:** `backgroundQueue.joinQueue();`
- **Purpose:** Add user to matchmaking queue

### 6. Socket Listeners
- **File:** `components/GlobalCallHandler.tsx`
- **Lines:** 83-84
- **Events:** `call:notify`, `call:start`
- **Purpose:** Receive call notifications on all pages

---

## 🔄 SEQUENCE DIAGRAM

```
[Page Load]
    ↓
[app/layout.tsx mounts]
    ↓
[GlobalCallHandler mounts]
    ↓
[Check session exists] ──NO──> [Skip setup]
    │
    YES
    ↓
[Connect socket] ──────────────────┐
    ↓                               │
[backgroundQueue.init(socket)] ←───┘
    ↓
[Setup call listeners]
    ↓
[✅ READY FOR CALLS]
    ↓
[User on /main]
    ↓
[Load toggle state from localStorage]
    ↓
[If was ON → syncWithToggle(true) → joinQueue()]
    ↓
[User clicks toggle ON]
    ↓
[backgroundQueue.joinQueue()] ←─── Socket already set! ✅
    ↓
[Checks pass]
    ↓
[socket.emit('queue:join')]
    ↓
[✅ IN QUEUE]
    ↓
[User navigates to /settings]
    ↓
[GlobalCallHandler still mounted] ←─── Persistent in layout
[Socket still connected] ←─────────── Managed by GlobalCallHandler
[Background queue still active] ←──── If toggle ON
    ↓
[Incoming call from another user]
    ↓
[Server emits call:notify]
    ↓
[GlobalCallHandler receives it] ←──── Listener still active!
    ↓
[CalleeNotification shows on /settings]
    ↓
[✅ SUCCESS - Got call while on /settings!]
```

---

## ⚠️ COMMON FAILURE POINTS (Now Fixed)

### ❌ Failure 1: Socket Not Available
**Symptom:** `[BackgroundQueue] No socket, cannot join queue`
**Cause:** Race condition - main page tried to init before GlobalCallHandler finished
**Fix:** Removed duplicate init from main page

### ❌ Failure 2: Duplicate Listeners
**Symptom:** Double notifications, glitching
**Cause:** Both GlobalCallHandler AND backgroundQueue had call listeners
**Fix:** Removed listeners from backgroundQueue

### ❌ Failure 3: Queue Auto-Disabled
**Symptom:** Queue leaves when closing overlay
**Cause:** Overlay onClose forced queue leave
**Fix:** Check toggle state before leaving

### ❌ Failure 4: No Socket on Other Pages
**Symptom:** Background queue only worked on /main
**Cause:** Socket only connected when overlay opened
**Fix:** GlobalCallHandler connects socket on ALL pages

---

## ✅ WHY IT WORKS NOW

1. **GlobalCallHandler in Root Layout**
   - Mounts before any page component
   - Stays mounted across navigation
   - Single source of truth for socket

2. **Background Queue Singleton**
   - Shared across entire app
   - Initialized once by GlobalCallHandler
   - All pages use same instance

3. **No Race Conditions**
   - GlobalCallHandler connects socket first
   - Then initializes background queue
   - Main page only syncs toggle (no init)

4. **Persistent Connection**
   - Socket managed by GlobalCallHandler
   - Never unmounts unless app closes
   - Background queue always has socket reference

5. **Smart Queue Management**
   - Toggle ON = stays active everywhere
   - Toggle OFF = only active in overlay
   - No auto-disable on navigation

---

## 🧪 TESTING VERIFICATION

### Expected Console Output:

```
// On ANY page load
[GlobalCallHandler] Initializing socket connection...
[GlobalCallHandler] No socket exists, creating new connection...
[Socket] Creating new socket connection to: wss://...
[Socket] ✅ Connected: abc123
[GlobalCallHandler] Socket obtained, setting up listeners and background queue...
[BackgroundQueue] Visibility and activity detection setup
[BackgroundQueue] Call listeners handled by GlobalCallHandler (no duplication)
[GlobalCallHandler] ✅ Background queue initialized with socket
[GlobalCallHandler] Setting up persistent call listeners
[GlobalCallHandler] ✅ Persistent socket listeners active (works on ALL pages)

// On /main page load
[Main] Syncing background queue with toggle: false

// User enables toggle
[Main] Background queue: ON
[BackgroundQueue] ========== JOIN QUEUE CALLED ==========
[BackgroundQueue] Socket exists: true
[BackgroundQueue] Socket connected: true
[BackgroundQueue] Already in queue: false
[BackgroundQueue] Document hidden: false
[BackgroundQueue] Background enabled: true
[BackgroundQueue] Current page: /main
[BackgroundQueue] ✅ Emitting queue:join to server
[BackgroundQueue] ✅ Successfully joined queue, inQueue = true

// User navigates to /settings
(No queue leave messages - stays active)

// Incoming call
[GlobalCallHandler] ✅ INCOMING CALL: {...}
```

---

## 🎯 SINGLE SOURCE OF TRUTH

| Responsibility | Owner | Location |
|----------------|-------|----------|
| Socket connection | GlobalCallHandler | components/GlobalCallHandler.tsx |
| Background queue init | GlobalCallHandler | components/GlobalCallHandler.tsx:50 |
| Call listeners | GlobalCallHandler | components/GlobalCallHandler.tsx:83-84 |
| Toggle UI | Main Page | app/main/page.tsx:228, 313 |
| Queue join/leave | Background Queue | lib/backgroundQueue.ts:186, 261 |
| Visibility detection | Background Queue | lib/backgroundQueue.ts:49-127 |

**No overlap, no duplication, no conflicts!** ✅

---

**Pipeline Analysis Complete** ✅

