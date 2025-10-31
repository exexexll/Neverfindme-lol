IMMEDIATE CRITICAL ISSUES TO FIX
=================================

From screenshot analysis:

## 1. Chat Input Blocked on PC ❌
Screenshot shows: Chat drawer open, but user can't type
Possible causes:
- z-index conflict
- pointer-events: none
- Input behind another element
- Chat drawer not focused

## 2. Social Handles Not Links ❌
Screenshot shows plain text:
```
tiktok: appleuser5925246.1ZP-90JdXU6rW
twitter: yanhanson296052?1thBX9nX_O2Bx4
instagram: 2yy_gigshNTc4M11iwNjQ2Yq
```

Should be clickable links:
- https://tiktok.com/@appleuser5925246.1ZP-90JdXU6rW
- https://twitter.com/yanhanson296052?1thBX9nX_O2Bx4
- https://instagram.com/2yy_gigshNTc4M11iwNjQ2Yq

## 3. Video Reconnection Broken ❌
Reconnection handler exists but may not trigger WebRTC recovery
Need to check line by line:
- Socket reconnect handler
- Partner reconnect handler
- WebRTC renegotiation
- ICE restart logic

Fixing now...
