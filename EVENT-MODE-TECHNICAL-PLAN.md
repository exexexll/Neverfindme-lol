# EVENT MODE - TECHNICAL IMPLEMENTATION PLAN

**Feature:** Scheduled Matchmaking Events  
**Purpose:** Admin-controlled time windows for platform access  
**Complexity:** HIGH - Major architectural change  
**Estimated Work:** 1000+ lines across 20+ files

---

## 🎯 FEATURE OVERVIEW

### What It Does:

**Admin Panel:**
- Toggle: Event Mode ON/OFF
- Set event window: Start time → End time (e.g., 3pm-6pm PST)
- View expected attendance (user RSVPs)

**User Experience (Event Mode ON):**
- Signup users: Complete onboarding → Wait page
- Logged users: Any route → Redirected to wait page
- Wait page: Select time slot + see attendance graph
- Option to update profile photo/video while waiting
- When event starts → Access unlocked → Can matchmake

**User Experience (Event Mode OFF):**
- Normal operation (current behavior)
- No restrictions, access anytime

---

## 📊 DATABASE SCHEMA CHANGES

### New Table: `event_settings`
```sql
CREATE TABLE event_settings (
  id SERIAL PRIMARY KEY,
  event_mode_enabled BOOLEAN DEFAULT FALSE,
  event_start_time TIME NOT NULL,  -- e.g., '15:00:00' (3pm)
  event_end_time TIME NOT NULL,    -- e.g., '18:00:00' (6pm)
  timezone VARCHAR(50) DEFAULT 'America/Los_Angeles', -- PST
  event_days JSONB DEFAULT '[]', -- Which days: [0,1,2,3,4,5,6] (Sun-Sat)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Only one row - singleton pattern
INSERT INTO event_settings (event_mode_enabled, event_start_time, event_end_time)
VALUES (FALSE, '15:00:00', '18:00:00');
```

### New Table: `event_rsvps`
```sql
CREATE TABLE event_rsvps (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  preferred_time TIME NOT NULL,  -- What time they plan to join
  event_date DATE NOT NULL,      -- Which day
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, event_date)  -- One RSVP per user per day
);

CREATE INDEX idx_rsvps_event_date ON event_rsvps(event_date);
CREATE INDEX idx_rsvps_preferred_time ON event_rsvps(preferred_time);
```

### Update `users` table:
```sql
ALTER TABLE users ADD COLUMN can_access_outside_events BOOLEAN DEFAULT FALSE;
-- For VIP users who can bypass event restrictions
```

---

## 🔧 BACKEND IMPLEMENTATION

### 1. New Route: `/admin/event-settings`

**GET** - Get current settings
**POST** - Update settings (admin only)

```typescript
// server/src/event-admin.ts
router.get('/settings', requireAdmin, async (req, res) => {
  const settings = await store.getEventSettings();
  res.json(settings);
});

router.post('/settings', requireAdmin, async (req, res) => {
  const { eventModeEnabled, startTime, endTime, timezone, eventDays } = req.body;
  await store.updateEventSettings({...});
  
  // Broadcast to all connected clients
  io.emit('event:settings-changed', { eventModeEnabled, startTime, endTime });
  
  res.json({ success: true });
});
```

### 2. New Route: `/event/rsvp`

**POST** - Submit time slot preference
**GET** - Get attendance data

```typescript
// server/src/event.ts
router.post('/rsvp', requireAuth, async (req, res) => {
  const { preferredTime, eventDate } = req.body;
  await store.saveEventRSVP(req.userId, preferredTime, eventDate);
  res.json({ success: true });
});

router.get('/attendance/:date', async (req, res) => {
  const { date } = req.params;
  const attendance = await store.getEventAttendance(date);
  // Returns: { '15:00': 12, '15:30': 18, '16:00': 25, ... }
  res.json(attendance);
});
```

### 3. Middleware: `requireEventAccess`

```typescript
// server/src/event-guard.ts
export async function requireEventAccess(req, res, next) {
  const settings = await store.getEventSettings();
  
  if (!settings.eventModeEnabled) {
    // Event mode off - allow all access
    return next();
  }
  
  // Check if current time is within event window
  const now = new Date();
  const currentTime = now.toLocaleTimeString('en-US', { 
    timeZone: settings.timezone,
    hour12: false 
  });
  
  const isWithinWindow = currentTime >= settings.eventStartTime && 
                         currentTime <= settings.eventEndTime;
  
  if (isWithinWindow) {
    return next(); // Allow access during event
  }
  
  // Outside event window
  const user = await store.getUser(req.userId);
  if (user?.canAccessOutsideEvents) {
    return next(); // VIP bypass
  }
  
  return res.status(403).json({
    error: 'Event not active',
    eventMode: true,
    nextEventStart: settings.eventStartTime,
    timezone: settings.timezone,
  });
}
```

### 4. Apply to Routes

```typescript
// server/src/index.ts
app.use('/room/queue', requireEventAccess, ...);
app.use('/matchmaking', requireEventAccess, ...);
```

---

## 🎨 FRONTEND IMPLEMENTATION

### 1. Wait Page (`app/event-wait/page.tsx`)

**Features:**
- Display event window (3pm-6pm)
- Countdown to event start
- Time slot selector (when are you joining?)
- Attendance bar graph
- Profile update option
- Real-time attendance updates

**Layout:**
```typescript
- Header: "Event starts at 3:00 PM PST"
- Countdown: "2 hours 34 minutes"
- Time Picker: "When will you join?" [Dropdown: 3:00pm, 3:30pm, ...]
- Bar Graph: Expected attendance by time
- Button: "Update Photo" / "Update Video"
- Info: "Come back at 3pm to start matchmaking!"
```

### 2. Admin Panel Updates (`app/admin/page.tsx`)

**New Tab: "Event Settings"**
- Toggle: Event Mode ON/OFF
- Start Time picker
- End Time picker
- Timezone selector
- Active days selector (Mon-Sun checkboxes)
- Live attendance preview

### 3. Global Event Banner

**Component: `EventModeBanner.tsx`**
- Shows when event mode is ON but event hasn't started
- Displays countdown
- Sticky top banner on all pages
- "Event starts in X hours"

### 4. Redirect Logic

**In `AuthGuard.tsx`:**
```typescript
useEffect(() => {
  // Check event mode status
  fetch('/event/status').then(data => {
    if (data.eventModeEnabled && !data.isEventActive) {
      // Redirect to wait page
      if (!pathname.includes('/event-wait')) {
        router.push('/event-wait');
      }
    }
  });
}, [pathname]);
```

---

## 📈 BAR GRAPH IMPLEMENTATION

### Library: Recharts or Chart.js

```typescript
import { BarChart, Bar, XAxis, YAxis } from 'recharts';

const data = [
  { time: '3:00pm', users: 12 },
  { time: '3:30pm', users: 18 },
  { time: '4:00pm', users: 25 },
  // ... etc
];

<BarChart data={data}>
  <XAxis dataKey="time" />
  <YAxis />
  <Bar dataKey="users" fill="#ff9b6b" />
</BarChart>
```

---

## 🔐 SECURITY CONSIDERATIONS

### Vulnerabilities to Address:

1. **Time Zone Manipulation**
   - Server-side time checks only
   - No client-side time validation
   - Use server timestamp, not client Date()

2. **RSVP Gaming**
   - Limit RSVPs to realistic numbers
   - One RSVP per user per day
   - Can change time slot, not add multiple

3. **VIP Bypass Abuse**
   - Only admin can set canAccessOutsideEvents
   - Database flag, not localStorage
   - Audit log for VIP access

4. **Clock Sync Issues**
   - All times in UTC in database
   - Convert to timezone for display
   - Consistent timezone across server instances

---

## 🔄 MIGRATION PLAN

### Phase 1: Database (30 min)
- Run schema updates
- Create event_settings table
- Create event_rsvps table
- Add user column

### Phase 2: Backend (2 hours)
- Store methods for event settings
- Event admin routes
- Event RSVP routes
- Event guard middleware
- Apply to protected routes

### Phase 3: Frontend (3 hours)
- Event wait page
- Time slot picker
- Attendance graph
- Profile update UI
- Event banner component
- Admin event settings panel

### Phase 4: Integration (1 hour)
- Redirect logic
- Socket events for real-time updates
- Testing across flows

### Phase 5: Testing (1 hour)
- Admin toggle ON → All users redirected
- RSVP submission → Graph updates
- Event starts → Access granted
- Event ends → Access revoked
- Toggle OFF → Normal operation

**Total Estimated Time:** 7-8 hours

---

## 📝 FILES TO CREATE/MODIFY

### New Files (8):
1. `server/src/event-admin.ts` - Admin routes
2. `server/src/event.ts` - User event routes
3. `server/src/event-guard.ts` - Access middleware
4. `app/event-wait/page.tsx` - Wait page
5. `components/EventModeBanner.tsx` - Status banner
6. `components/AttendanceGraph.tsx` - Bar chart
7. `components/TimeSlotPicker.tsx` - Time selector
8. `server/event-migration.sql` - Database schema

### Modified Files (12):
1. `server/src/store.ts` - Event methods
2. `server/src/types.ts` - Event interfaces
3. `server/src/index.ts` - Apply middleware, socket events
4. `app/admin/page.tsx` - Event settings tab
5. `app/onboarding/page.tsx` - Redirect after video
6. `app/main/page.tsx` - Event check
7. `components/AuthGuard.tsx` - Event redirect
8. `app/layout.tsx` - Event banner
9. `server/schema.sql` - Full schema update
10. And more...

---

## ⚠️ RECOMMENDATION

**This is a MAJOR feature** requiring:
- Fresh context window (we're at 606k tokens)
- Dedicated implementation session
- Thorough testing
- Potential user flow changes

**I recommend:**

**NOW (Quick Fixes):**
- ✅ Hide login button if logged in
- ✅ Add QR code description

**NEXT SESSION (Event Mode):**
- Complete technical design
- Full implementation
- Comprehensive testing
- Documentation

**Should I:**
1. Do quick fixes now + create detailed Event Mode spec?
2. Or start implementing Event Mode in this session?

Given token usage (606k/1M), Option 1 is recommended for quality.

