# 🔧 Event Custom Text Not Working - Quick Fix

**Issue:** Admin panel saves custom text but wait page still shows "Event Mode Active"

**Cause:** Database columns don't exist yet!

---

## ✅ FIX (2 minutes):

### Railway PostgreSQL Query:

1. Railway Dashboard → PostgreSQL service
2. Click "Data" tab → "Query" button
3. **Paste this:**

```sql
ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_title TEXT DEFAULT 'Event Mode Active',
ADD COLUMN IF NOT EXISTS event_banner_text TEXT DEFAULT 'Event Mode';

UPDATE event_settings 
SET event_title = COALESCE(event_title, 'Event Mode Active'),
    event_banner_text = COALESCE(event_banner_text, 'Event Mode')
WHERE id = 1;

-- Verify:
SELECT event_title, event_banner_text FROM event_settings;
```

4. Click "Run"
5. Should see: `Event Mode Active` | `Event Mode`

---

## Test:

1. Admin panel → Event Settings
2. Change title to "HALLOWEEN IS GOIN TO BE LIT!"
3. Change banner to "🎃 Halloween"
4. Save
5. Go to /event-wait page
6. **Should show your custom text!** ✅

Done!

