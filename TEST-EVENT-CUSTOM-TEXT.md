# 🔍 Event Custom Text - Complete Pipeline Test

**Issue:** Custom text not showing on wait page or banner

---

## Step 1: Check Database (CRITICAL)

Run this in Railway PostgreSQL:

```sql
-- Check if columns exist:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'event_settings' 
AND column_name IN ('event_title', 'event_banner_text');
```

**Expected:** 2 rows showing the columns  
**If 0 rows:** Columns don't exist - RUN MIGRATION!

### If Columns Missing, Run Migration:

```sql
ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_title TEXT DEFAULT 'Event Mode Active',
ADD COLUMN IF NOT EXISTS event_banner_text TEXT DEFAULT 'Event Mode';

UPDATE event_settings 
SET event_title = 'Event Mode Active',
    event_banner_text = 'Event Mode'
WHERE id = 1;
```

---

## Step 2: Check Current Values

```sql
SELECT id, event_mode_enabled, event_title, event_banner_text 
FROM event_settings;
```

Should show:
```
id | event_mode_enabled | event_title         | event_banner_text
---|--------------------|--------------------|------------------
1  | true/false         | Event Mode Active  | Event Mode
```

---

## Step 3: Test Admin Panel Save

1. Admin panel → Event Settings tab
2. Scroll to "Custom Event Text"
3. Change title to: "TEST TITLE"
4. Change banner to: "TEST BANNER"
5. Click "Save Event Settings"
6. Check Railway logs for:
   ```
   [Store] Event settings updated: { eventTitle: 'TEST TITLE', eventBannerText: 'TEST BANNER' }
   ```

---

## Step 4: Verify Database Updated

```sql
SELECT event_title, event_banner_text FROM event_settings WHERE id = 1;
```

Should now show:
```
event_title  | event_banner_text
-------------|------------------
TEST TITLE   | TEST BANNER
```

---

## Step 5: Check Frontend

1. Go to `/event-wait` page
2. Should see "TEST TITLE" in header
3. Orange banner (if event mode on) should show "TEST BANNER"

**If still showing defaults:**
- Hard refresh (Cmd+Shift+R)
- Check browser console for errors
- Verify Vercel deployed latest code

---

## Likely Issue:

**You haven't run the database migration yet!**

The columns `event_title` and `event_banner_text` don't exist in your PostgreSQL database.

**Fix:** Run the SQL from Step 1 migration in Railway PostgreSQL Query tool.

