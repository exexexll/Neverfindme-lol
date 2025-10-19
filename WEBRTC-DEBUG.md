# WebRTC Connection Debug

## Current Event Mode Status
**From logs:** Event Mode is ON, blocking queue access

## WebRTC Flow (Socket.IO - NOT HTTP)
1. Invitation: socket.on('call:invite') ✅ Socket event, not HTTP
2. Room creation: socket.on('call:start') ✅ Socket event, not HTTP
3. WebRTC signaling: socket.on('rtc:offer'), socket.on('rtc:answer') ✅ All socket
4. ICE candidates: socket.on('rtc:ice') ✅ Socket

**Conclusion:** WebRTC is NOT affected by HTTP middleware at all!

## Actual Problem
WebSocket connection failures are unrelated to Event Mode.
They're caused by multiple connection attempts or Railway WebSocket config.

Event Mode ONLY blocks:
- GET /room/queue (HTTP endpoint for matchmaking)

Event Mode does NOT block:
- Socket.IO connections
- WebRTC signaling
- Video rooms
- Active calls

**WebRTC should work regardless of Event Mode!**

