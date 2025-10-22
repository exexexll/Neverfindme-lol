# Mode Toggle Logic Flow

## Current Flow (Has Issues):
```
1. Open matchmaking → Toggle shows (top right, desktop only)
2. View users → Can still change mode ❌
3. Send invite with current mode
4. While waiting for response → Can still change mode ❌
5. Mode included in call:start
6. Route to correct room
```

**Problems:**
- Toggle hidden on mobile ❌
- Can change mode while waiting ❌
- Can change mode while viewing users ❌
- Not prominent enough ❌

---

## New Flow (Correct):

```
1. Open matchmaking
   ↓
2. FIRST SCREEN: Mode selection (center, large, both mobile + desktop)
   [📹 Video Chat] or [💬 Text Chat]
   ↓
3. User selects mode
   ↓
4. Load users, start browsing
   ↓
5. MODE LOCKED - Can't change anymore
   ↓
6. User browses, sends invite with locked mode
   ↓
7. Waiting for response - mode stays locked
   ↓
8. Call accepted - route to correct room type
   OR
9. Call declined - mode still locked (can't change mid-session)
   ↓
10. Close matchmaking → Reset mode for next time
```

**Benefits:**
- ✅ Deliberate choice (user thinks about mode)
- ✅ Can't accidentally change mid-session
- ✅ Clear UX (choose once, locked)
- ✅ Works on mobile
- ✅ Prevents confusion

---

## Implementation:

### States:
```typescript
const [chatMode, setChatMode] = useState<'video' | 'text'>('video');
const [modeLocked, setModeLocked] = useState(false); // Lock after user starts browsing
const [showModeSelection, setShowModeSelection] = useState(true); // Show selection screen first
```

### UI:
```
When showModeSelection === true:
  → Show full-screen mode selection
  → Large buttons: Video / Text
  → Explanation of each mode
  → "Continue" button

When showModeSelection === false:
  → Show normal matchmaking UI
  → Mode indicator at top (center, small, read-only)
  → Users can browse and invite
  → Mode is locked
```

### Lock Trigger:
```
Mode gets locked when:
- User selects mode and clicks "Continue"
- modeLocked = true
- showModeSelection = false
- Load users and show browsing UI

Mode unlocks when:
- User closes matchmaking (onClose)
- Reset: modeLocked = false, showModeSelection = true
```

---

## Mobile vs Desktop:

### Desktop:
```
Mode Selection Screen:
┌────────────────────────────────────┐
│                                    │
│     Choose Your Chat Mode          │
│                                    │
│  ┌────────────┐  ┌────────────┐   │
│  │     📹     │  │     💬     │   │
│  │            │  │            │   │
│  │   Video    │  │    Text    │   │
│  │   Chat     │  │    Chat    │   │
│  └────────────┘  └────────────┘   │
│                                    │
│        [Continue with Video]       │
│                                    │
└────────────────────────────────────┘

Browsing UI:
┌────────────────────────────────────┐
│  Matchmake    📹 Video    4 online │ ← Mode indicator (read-only)
│                                    │
│         [User Card]                │
│                                    │
└────────────────────────────────────┘
```

### Mobile:
```
Mode Selection (full screen):
┌──────────────────┐
│                  │
│  Choose Mode     │
│                  │
│  ┌────────────┐  │
│  │     📹     │  │
│  │   Video    │  │
│  └────────────┘  │
│                  │
│  ┌────────────┐  │
│  │     💬     │  │
│  │    Text    │  │
│  └────────────┘  │
│                  │
│   [Continue]     │
│                  │
└──────────────────┘

Browsing (locked indicator):
┌──────────────────┐
│ 📹 Video  4 ppl  │ ← Small, top center
│                  │
│   [User Card]    │
│                  │
└──────────────────┘
```

---

This ensures users make a deliberate choice and can't accidentally switch modes.

