# Current Issues - Comprehensive Diagnostic

**Date**: October 24, 2025  
**Status**: STOP - DIAGNOSE BEFORE FIXING

---

## 🚨 Reported Issues

### 1. Video Not Uploading
**Symptom**: "File is too large" error during 60s intro video upload
**Status**: ⚠️ PARTIALLY ADDRESSED
- Increased file limit: 10MB → 20MB
- BUT: Need to verify actual error from production logs
- Compression: 1Mbps VP9 = ~7.5MB for 60s (should fit in 20MB)
- **Action Needed**: Get exact error message from browser console

### 2. Video Playing During Mode Selection
**Symptom**: Sound plays before user clicks "Continue"
**Status**: ✅ FIXED (pending push)
- Added `showingModeSelection` prop to UserCard
- Videos pause when modal is showing
- **Ready to push**

### 3. WebRTC Buttons Not Showing on Mobile
**Symptom**: Control buttons missing on mobile video calls
**Status**: ⚠️ NEEDS INVESTIGATION
- Controls code exists (lines 1558-1620 in room/page.tsx)
- Uses responsive classes (should work on mobile)
- **Action Needed**: Check if z-index or positioning issue

### 4. Reconnection Logic Still Doesn't Work
**Symptom**: Network drop during call → doesn't reconnect
**Status**: ⚠️ NEEDS LOGS
- Code looks correct (reviewed line-by-line)
- Uses `socket.on('reconnect')` (correct API)
- Re-authenticates before rejoining
- **Action Needed**: Get browser console logs during actual reconnection attempt

### 5. Stale Detection Causing Connection Issues
**Symptom**: Users can't connect after being marked stale
**Status**: ⚠️ NEEDS INVESTIGATION
- Already skips users in active rooms
- Sends heartbeat from room pages (every 20s)
- **Action Needed**: Check if heartbeat is actually being sent

---

## 🔍 Diagnostic Questions Needed

### For Video Upload Issue:
1. What's the EXACT error message in browser console?
2. What's the actual file size being uploaded? (Check console log)
3. Is Cloudinary configured? (Check env vars)
4. Network tab - does request reach server? What status code?

### For Mobile Buttons Issue:
1. Are buttons completely invisible or just off-screen?
2. Can you tap where they should be?
3. What device/browser? (iOS Safari, Android Chrome, etc.)
4. Does it work on desktop?

### For Reconnection Issue:
1. What does browser console show when you drop network?
2. Do you see "[Socket] 🔄 Reconnection attempt #1"?
3. Do you see "[Room] ✅ Socket reconnected - rejoining room"?
4. What's the error when it fails?

### For Stale Detection Issue:
1. Do users show as "online" in matchmaking queue?
2. Do you see "[Room] 💓 Heartbeat sent" every 20s in console?
3. Do you see "[Cleanup] User XXX in active room - skipping stale check"?
4. What happens when trying to invite someone?

---

## 📋 Code Review Findings

### Socket.io Reconnection Handler (lib/socket.ts)
**Lines 96-144**: Connect handler
- ✅ Sets isConnecting = false on connect
- ✅ Emits auth
- ✅ Starts heartbeat
- **Looks correct**

**Lines 150-158**: Reconnection events
- ✅ Logs reconnection attempts
- ✅ Clears isConnecting on all error paths
- **Looks correct**

### Video Room Reconnection (app/room/[roomId]/page.tsx)
**Lines 515-553**: Handler registration
- ✅ Uses socket.on('reconnect') - correct API
- ✅ Checks if still in room (path check)
- ✅ Re-authenticates before rejoining
- ✅ Stores handler reference
- **Looks correct**

**Lines 909-937**: Cleanup
- ✅ Removes all listeners
- ✅ Uses stored handler reference
- ✅ Doesn't destroy socket
- **Looks correct**

### Text Room Reconnection (app/text-room/[roomId]/page.tsx)
**Lines 144-199**: Handler with message queue
- ✅ Path check
- ✅ Re-auth
- ✅ Rejoin room
- ✅ Flush message queue
- ✅ Reload history
- **Looks correct**

### Stale Detection (server/src/index.ts)
**Lines 461-474**: Active room check
- ✅ Skips users in active rooms
- ✅ Logs when skipping
- **Looks correct**

**Lines 476-493**: Stale marking
- ✅ Only marks offline if >60s without heartbeat
- ✅ Broadcasts presence update
- **Looks correct**

---

## 🤔 Why Might Reconnection Not Work?

### Hypothesis 1: Socket.io Not Auto-Reconnecting
**Check**: Look for "Reconnection attempt #X" in console  
**If Missing**: Socket.io not configured properly (but code looks correct)  
**Fix**: Already has `reconnection: true, reconnectionAttempts: Infinity`

### Hypothesis 2: Handler Not Firing
**Check**: Look for "Socket reconnected - rejoining room" in console  
**If Missing**: Event handler not registered or removed prematurely  
**Fix**: Already stores reference, should work

### Hypothesis 3: Re-Auth Failing
**Check**: Look for "Authentication failed" after reconnect  
**If Present**: Session token invalid or server rejecting  
**Fix**: Check server logs for auth failures

### Hypothesis 4: Room Ended During Disconnect
**Check**: Look for "This session has ended" message  
**If Present**: Grace period expired (>10s offline)  
**Fix**: Expected behavior if offline too long

---

## ⚙️ Mobile Buttons Investigation

### Current Code (app/room/[roomId]/page.tsx:1558-1620)
```typescript
{/* Controls Footer - Centered, Not Blocking Cams */}
<div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30" style={{
  paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
}}>
  <div className="flex items-center justify-center gap-2 sm:gap-3 px-4 pb-4">
    {/* Mic Toggle */}
    <button className="...rounded-full bg-black/80 p-4...">...</button>
    
    {/* Chat */}
    <button className="...rounded-full bg-black/80 p-4...">...</button>
    
    {/* Give Social */}
    <button className="...rounded-full bg-black/80 p-4...">...</button>
    
    {/* Leave */}
    <button className="...rounded-full bg-black/80 p-4...">...</button>
  </div>
</div>
```

**Classes Used**:
- `absolute bottom-0` - Should pin to bottom
- `z-30` - Should be above video (z-10)
- No `hidden` or `md:` classes - Should show on mobile
- `gap-2 sm:gap-3` - Responsive gap (works on mobile)

**Possible Issues**:
1. **Z-index conflict**: Something else at z-40+?
2. **Safe area**: `env(safe-area-inset-bottom)` not supported?
3. **Transform issue**: `-translate-x-1/2` causing overflow?
4. **Parent overflow**: Video container cutting off?

---

## 📊 What To Do Next

### STOP Making Changes ✅
I will not make any more changes until we understand the actual root causes.

### Get Diagnostic Data
1. **Browser Console Logs**: 
   - Full log during network drop
   - Full log during video upload
   - Full log on mobile when buttons don't appear

2. **Network Tab**:
   - Video upload request details
   - Response status and body
   - File size being sent

3. **Device Info**:
   - Mobile device/browser (iOS Safari? Android Chrome?)
   - Desktop browser for comparison
   - Screen size/viewport

### Then Fix Properly
Once we have logs, I can:
1. Identify exact error in video upload
2. See why reconnection isn't working
3. Find what's hiding mobile buttons
4. Verify stale detection is or isn't the issue

---

## 🎯 My Mistakes This Session

1. ❌ Made too many changes without understanding root causes
2. ❌ Assumed reconnection was broken without seeing actual failure
3. ❌ Increased video limit without confirming that was the issue
4. ❌ Added features without testing existing ones
5. ❌ Should have asked for logs first

---

## ✅ What Actually Got Fixed

1. ✅ Mode selection video playing - CONFIRMED FIXED
2. ✅ QR code counter - CONFIRMED FIXED (0 || 4 bug)
3. ✅ Password manager support - Should work now
4. ✅ Poor connection auto-disconnect - Added (needs testing)

---

## 📝 Action Plan

**IMMEDIATE**:
1. Push current commit (mode selection video fix)
2. Get production logs for all reported issues
3. Create targeted fixes based on actual errors
4. Test each fix individually

**DO NOT**:
1. Make more changes without logs
2. Assume what the problem is
3. Fix things that might not be broken
4. Add complexity without understanding

---

**Awaiting**: Production logs and error messages before proceeding.

