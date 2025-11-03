BACKGROUND QUEUE - COMPLETE FLOW ANALYSIS
==========================================

## USER INTERACTION FLOWS

### Flow 1: Toggle ON → Join Queue
===================================
User clicks toggle ON
  ↓
onChange handler fires
  ↓
setBackgroundQueueEnabled(true)
  ↓
localStorage.setItem('bumpin_background_queue', 'true')
  ↓
backgroundQueue.joinQueue() called
  ↓
Checks:
  1. Socket exists? (if no → abort)
  2. Tab hidden? (if yes → abort)
  3. Profile complete? (fetch /user/me)
     - Has selfieUrl? (if no → abort)
     - Has videoUrl? (if no → abort)
  ↓
If all pass:
  socket.emit('queue:join')
  inQueue = true

### Flow 2: Toggle OFF → Leave Queue
====================================
User clicks toggle OFF
  ↓
onChange handler fires
  ↓
setBackgroundQueueEnabled(false)
  ↓
localStorage.setItem('bumpin_background_queue', 'false')
  ↓
backgroundQueue.leaveQueue() called
  ↓
socket.emit('queue:leave')
  ↓
inQueue = false

### Flow 3: User Opens Matchmaking (Toggle OFF)
================================================
Toggle is OFF
  ↓
User clicks "Matchmake Now"
  ↓
onClick handler fires
  ↓
setShowMatchmake(true) → Opens overlay
  ↓
backgroundQueue.joinQueue() called
  ↓
Checks background enabled:
  - If OFF → Check if on /main page
  - If not /main → Don't join
  - If /main → Join queue
  ↓
MatchmakeOverlay opens
  ↓
MatchmakeOverlay also emits queue:join (line 562)
  ↓
User is in queue while overlay open

When user closes overlay:
  ↓
If background queue OFF:
  overlay emits queue:leave
  User removed from queue

### Flow 4: User Opens Matchmaking (Toggle ON)
===============================================
Toggle is ON (already in queue)
  ↓
User clicks "Matchmake Now"
  ↓
backgroundQueue.joinQueue() called again (redundant but safe)
  ↓
MatchmakeOverlay opens
  ↓
MatchmakeOverlay emits queue:join (line 562) - duplicate!
  ↓
Backend handles duplicate queue:join (idempotent)
  ↓
User stays in queue

When user closes overlay:
  - Background queue ON → Stay in queue ✅
  - Can browse other pages
  - Still in queue

### Flow 5: Tab Hidden with Toggle ON
======================================
User switches tabs
  ↓
document.visibilitychange event fires
  ↓
document.hidden = true
  ↓
handleVisibility() called
  ↓
Starts 1-minute timer:
  setTimeout(() => {
    if (document.hidden && inQueue) {
      leaveQueue()
    }
  }, 60000)
  ↓
TWO OUTCOMES:

A) User returns within 1 minute:
   ↓
   document.hidden = false
   ↓
   handleVisibility() called again
   ↓
   clearTimeout(timer)
   ↓
   Grace period cancelled
   ↓
   User stays in queue ✅

B) User gone > 1 minute:
   ↓
   Timer expires
   ↓
   Checks: document.hidden && inQueue
   ↓
   If both true: leaveQueue()
   ↓
   User removed from queue ✅

### Flow 6: Window Minimized with Toggle ON
============================================
User minimizes window
  ↓
window.blur event fires
  ↓
handleBlur() called
  ↓
Starts 1-minute timer:
  setTimeout(() => {
    if (inQueue) {
      leaveQueue()
    }
  }, 60000)
  ↓
TWO OUTCOMES:

A) User returns within 1 minute:
   ↓
   window.focus event fires
   ↓
   handleFocus() called
   ↓
   clearTimeout(timer)
   ↓
   User stays in queue ✅

B) Window minimized > 1 minute:
   ↓
   Timer expires
   ↓
   Checks: inQueue
   ↓
   leaveQueue()
   ↓
   User removed from queue ✅

### Flow 7: User Idle with Toggle ON
=====================================
User stops moving mouse/typing
  ↓
lastActivity timestamp stops updating
  ↓
Every 30 seconds, check runs:
  const idle = Date.now() - lastActivity > 5 * 60 * 1000
  ↓
If idle > 5 minutes AND inQueue:
  ↓
  leaveQueue()
  ↓
  User removed from queue ✅

## ISSUES FOUND

### Issue 1: Timer Conflicts
============================
Problem: handleVisibility and handleBlur use SAME timer variable
- tabHiddenTimeout used for both
- If user switches tab THEN minimizes:
  - First timer gets overwritten
  - First countdown lost!

Fix needed: Separate timers
- visibilityTimeout for tab hidden
- blurTimeout for window minimized

### Issue 2: Timer Not Cleared on Visibility Change
===================================================
Problem: When tab becomes visible:
- clearTimeout called
- But timer might have already fired
- Race condition possible

Fix needed: Check if timer exists before clearing

### Issue 3: Device Compatibility
=================================
Problem: Different devices fire events differently
- iOS: Might not fire blur on app switch
- Android: Different visibility behavior
- Desktop: Works as expected

Fix needed: Test multiple event sources

### Issue 4: Backend Not Removing User
======================================
Problem: Frontend leaves queue (socket.emit('queue:leave'))
- But backend might not process immediately
- User still appears online to others
- Backend needs to handle properly

Fix needed: Verify backend handles queue:leave

### Issue 5: Profile Check on Every Join
========================================
Problem: Fetches /user/me on EVERY joinQueue() call
- Performance issue
- Unnecessary API calls

Fix needed: Cache profile completeness
- Check once per session
- Only re-check if profile updated

## FIXES TO IMPLEMENT

Priority 1: Separate Timers (CRITICAL)
Priority 2: Profile Check Caching
Priority 3: Device Compatibility Testing
Priority 4: Backend Queue:Leave Verification

Implementing fixes now...
