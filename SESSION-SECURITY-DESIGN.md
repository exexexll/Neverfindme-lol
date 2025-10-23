# Session Security & Reconnection System

## Requirements:

1. ✅ Text room fixed layout (no page movement)
2. ✅ Video mobile vertical cam auto-sizing
3. ✅ Session ends when participant exits
4. ✅ 10-second reconnection grace period
5. ✅ Prevent entering ended rooms
6. ✅ Allow reconnection during grace period
7. ✅ Block unauthorized room access

---

## Database Schema Addition:

```sql
-- Track active sessions with reconnection state
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS 
  room_status VARCHAR(20) DEFAULT 'active' 
  CHECK (room_status IN ('active', 'grace_period', 'ended'));

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS
  grace_period_expires_at TIMESTAMP;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS
  participant_1_connected BOOLEAN DEFAULT TRUE;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS
  participant_2_connected BOOLEAN DEFAULT TRUE;
```

---

## Server-Side Logic:

### Room Access Control:
```typescript
socket.on('room:join', ({ roomId }) => {
  const room = activeRooms.get(roomId);
  
  // Case 1: Room doesn't exist → Invalid
  if (!room) {
    return socket.emit('room:invalid');
  }
  
  // Case 2: User not in room → Unauthorized
  if (room.user1 !== currentUserId && room.user2 !== currentUserId) {
    return socket.emit('room:unauthorized');
  }
  
  // Case 3: Room ended → Check grace period
  if (room.status === 'ended') {
    return socket.emit('room:ended');
  }
  
  // Case 4: Grace period → Allow reconnect
  if (room.status === 'grace_period') {
    const gracePeriodExpired = Date.now() > room.gracePeriodExpires;
    if (gracePeriodExpired) {
      return socket.emit('room:ended');
    }
    // Allow reconnection
    room.status = 'active';
    markUserConnected(room, currentUserId);
    io.to(roomId).emit('room:reconnected', { userId: currentUserId });
  }
  
  // Case 5: Normal join → Success
  socket.join(roomId);
  markUserConnected(room, currentUserId);
});
```

### Disconnect Handling:
```typescript
socket.on('disconnect', () => {
  const room = findRoomByUser(currentUserId);
  if (!room) return;
  
  markUserDisconnected(room, currentUserId);
  
  // Start 10-second grace period
  room.status = 'grace_period';
  room.gracePeriodExpires = Date.now() + 10000;
  
  // Notify other user
  socket.to(room.roomId).emit('partner:disconnected', {
    gracePeriodSeconds: 10
  });
  
  // Schedule room end if no reconnection
  setTimeout(() => {
    if (room.status === 'grace_period') {
      endRoomDueToDisconnect(room);
    }
  }, 10000);
});
```

### Manual Leave:
```typescript
socket.on('call:end', ({ roomId }) => {
  const room = activeRooms.get(roomId);
  if (!room) return;
  
  // Immediate end (no grace period for manual leave)
  room.status = 'ended';
  
  // Notify both users
  io.to(roomId).emit('session:finalized');
  
  // Clean up
  activeRooms.delete(roomId);
});
```

---

## Frontend Logic:

### Text Room - Fixed Layout:
```tsx
<main className="fixed inset-0 overflow-hidden bg-[#0a0a0c]">
  {/* Content doesn't scroll or move */}
</main>
```

### Video Room - Vertical Cam Sizing:
```tsx
// Detect orientation
const isVertical = videoHeight > videoWidth;

<video className={
  isVertical 
    ? "h-full w-auto" // Vertical: full height
    : "w-full h-auto" // Horizontal: full width
} />
```

### Reconnection UI:
```tsx
{showReconnecting && (
  <Modal>
    🔄 Partner disconnected
    Waiting to reconnect... {countdown}s
    
    {countdown === 0 && "Session ended"}
  </Modal>
)}
```

### Room Access Check:
```tsx
useEffect(() => {
  socket.on('room:invalid', () => {
    alert('This room does not exist');
    router.push('/main');
  });
  
  socket.on('room:unauthorized', () => {
    alert('You are not authorized to join this room');
    router.push('/main');
  });
  
  socket.on('room:ended', () => {
    alert('This session has ended');
    router.push('/history');
  });
  
  socket.on('partner:disconnected', ({ gracePeriodSeconds }) => {
    setShowReconnecting(true);
    setReconnectCountdown(gracePeriodSeconds);
  });
  
  socket.on('room:reconnected', () => {
    setShowReconnecting(false);
  });
}, []);
```

---

## Security Guarantees:

✅ User can only join rooms they're part of  
✅ Ended rooms are inaccessible  
✅ Grace period allows accidental disconnects  
✅ Manual leave = immediate end  
✅ Unauthorized access = redirect to main  
✅ All state tracked server-side (can't be spoofed)  

---

Implementation order:
1. Database migration
2. Server-side logic
3. Frontend reconnection UI
4. Access control checks
5. Text room fixed layout
6. Video vertical cam sizing

All security-focused, carefully designed.

