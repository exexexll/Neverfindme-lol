# 🎨 Event Mode Custom Text - User Guide

**Feature:** Customizable event mode text from admin panel  
**Date:** October 19, 2025  
**Commit:** `068c16e`

---

## ✨ New Feature Overview

You can now customize the text shown to users during event mode:

1. **Event Wait Page Title** - Main header on `/event-wait` page
2. **Banner Notification Text** - Text in the orange notification banner

### Before (Hardcoded):
```
Event Wait Page: "Event Mode Active"
Banner: "Event Mode"
```

### After (Customizable):
```
Event Wait Page: "Speed Dating Night - Oct 19th" (or any text you want!)
Banner: "🎉 Live Tonight" (or any text you want!)
```

---

## 🚀 How to Use

### Step 1: Run Database Migration (REQUIRED!)

**Connect to your Railway PostgreSQL:**
```bash
# Get database URL from Railway dashboard
# Variables → DATABASE_URL

# Connect using psql
psql "postgresql://postgres:xxx@postgres.railway.internal:5432/railway"

# Or if you have the full URL:
psql $DATABASE_URL
```

**Run the migration:**
```sql
-- Copy and paste from migrations/add-event-custom-text.sql

ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_title TEXT DEFAULT 'Event Mode Active';

ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_banner_text TEXT DEFAULT 'Event Mode';

UPDATE event_settings 
SET 
  event_title = COALESCE(event_title, 'Event Mode Active'),
  event_banner_text = COALESCE(event_banner_text, 'Event Mode')
WHERE id = 1;

-- Verify it worked
SELECT event_title, event_banner_text FROM event_settings WHERE id = 1;
```

**Expected output:**
```
     event_title      | event_banner_text 
----------------------|-------------------
 Event Mode Active    | Event Mode
```

✅ Migration complete!

---

### Step 2: Wait for Deployment (~3 minutes)

Railway and Vercel are auto-deploying the code changes:

**Railway (Backend):**
- Go to: https://railway.app/dashboard
- Check your project
- Should show "Deploying..." then "Active"

**Vercel (Frontend):**
- Go to: https://vercel.com/dashboard  
- Should show "Building..." then "Ready"

---

### Step 3: Login to Admin Panel

1. **Go to:** https://napalmsky.com/admin-login
2. **Login:**
   - Username: `Hanson`
   - Password: `328077`

---

### Step 4: Customize Event Text

1. **Click "Event Settings" tab** (4th tab)
2. **Scroll down** to "Custom Event Text" section
3. **Edit the fields:**

**Event Wait Page Title:**
```
Examples:
- "Speed Dating Night - Oct 19th"
- "Happy Hour Matchmaking"
- "Weekend Social Event"
- "Valentine's Day Special"
- "New Year's Party 🎉"

Max length: 50 characters
```

**Banner Notification Text:**
```
Examples:
- "🎉 Live Event"
- "🍸 Happy Hour"
- "💕 Date Night"
- "🎊 Party Mode"
- "Live Now"

Max length: 30 characters
Short is better for the banner!
```

4. **Click "Save Event Settings"** button at the bottom

5. **Should see:** "Event settings saved successfully!" alert ✅

---

### Step 5: Verify Changes

**Check event-wait page:**
1. Open new tab as regular user (or incognito)
2. Go to: https://napalmsky.com/event-wait
3. Should see your custom title instead of "Event Mode Active"

**Check notification banner:**
1. Stay on any page (main, settings, etc.)
2. Orange banner appears in top-right corner
3. Should show your custom text instead of "Event Mode"

**Real-time updates:**
- Changes appear immediately after saving
- All connected users see the update via Socket.io
- No refresh needed!

---

## 🎯 Use Cases

### 1. Themed Events
```
Title: "Halloween Speed Dating 🎃"
Banner: "👻 Spooky Night"
```

### 2. Holiday Specials
```
Title: "Valentine's Day Matchmaking"
Banner: "💕 Love is Live"
```

### 3. Time-Based Events
```
Title: "Friday Night Connections"
Banner: "🌙 Tonight Only"
```

### 4. Promotional Events
```
Title: "Free Trial Weekend!"
Banner: "🎁 Join Now"
```

### 5. Location-Based Events
```
Title: "LA Singles Meetup"
Banner: "📍 Local Event"
```

---

## 🎨 Design Tips

### For Event Title (Wait Page):
- **Be specific:** Include date, theme, or special occasion
- **Use emojis:** Makes it more engaging (⏰ 🎉 💕 🎊)
- **Keep it clear:** Users should understand what's happening
- **Avoid ALL CAPS:** Use title case for better readability

**Good Examples:**
- ✅ "Speed Dating Night - October 19th"
- ✅ "Weekend Social Hour 🍸"
- ✅ "Singles Mixer 💕"

**Bad Examples:**
- ❌ "WAIT HERE!!!" (too aggressive)
- ❌ "Event" (not descriptive enough)
- ❌ "Super Ultra Mega Amazing Event Night" (too long)

### For Banner Text (Notification):
- **Keep it SHORT:** 10-20 characters ideal
- **Use emojis:** Single emoji at start works great
- **Be concise:** Just the essential info
- **Action-oriented:** "Live Now", "Join Soon", etc.

**Good Examples:**
- ✅ "🎉 Live Event"
- ✅ "Tonight 7PM"
- ✅ "💕 Date Night"
- ✅ "Live Now"

**Bad Examples:**
- ❌ "Event Mode Active Right Now" (too long, gets cut off)
- ❌ "E" (too short, not descriptive)
- ❌ Multiple emojis (cluttered)

---

## 🔄 How It Works

### Data Flow:

```
Admin Panel
  ↓ Saves text
Backend (PostgreSQL)
  ↓ Stores in event_settings table
  ↓ Broadcasts via Socket.io
Frontend Components
  ├─ Event Wait Page (title)
  └─ Event Banner (notification)
```

### Real-Time Updates:

```
1. Admin changes text in panel
2. Clicks "Save Event Settings"
3. Backend updates database
4. Backend emits 'event:settings-changed' via Socket.io
5. All connected users receive event
6. EventModeBanner component updates immediately
7. Users see new text without refreshing!
```

---

## 📊 Field Specifications

| Field | Location | Max Length | Default Value | Purpose |
|-------|----------|------------|---------------|---------|
| Event Title | Wait page header | 50 chars | "Event Mode Active" | Main announcement |
| Banner Text | Top-right notification | 30 chars | "Event Mode" | Quick status indicator |

---

## 🧪 Testing Checklist

After saving custom text:

- [ ] Event wait page shows new title
- [ ] Banner notification shows new text
- [ ] Text updates without page refresh
- [ ] Text persists after page reload
- [ ] Text shows correctly on mobile devices
- [ ] Emojis display correctly
- [ ] Character limits enforced (50/30)
- [ ] Empty fields fallback to defaults

---

## 🐛 Troubleshooting

### Text Not Showing?

**Check 1: Database migration ran?**
```sql
-- Run this in PostgreSQL:
SELECT event_title, event_banner_text FROM event_settings;

-- Should return your custom text
-- If returns NULL, run the migration again
```

**Check 2: Settings saved successfully?**
- Should see "Event settings saved successfully!" alert
- If error, check Railway logs for issues

**Check 3: Page refreshed?**
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Wait for deployment (2-3 minutes after push)

### Text Cut Off?

**Cause:** Text too long for banner

**Fix:** Shorten banner text to under 25 characters

**Good:** "🎉 Live Event"  
**Bad:** "Event Mode is Currently Active Right Now"

### Default Text Still Showing?

**Cause:** Database doesn't have the columns yet

**Fix:** Run the migration SQL:
```bash
# In Railway dashboard:
1. Go to PostgreSQL service
2. Click "Data" tab
3. Click "Query" button
4. Paste migration SQL
5. Click "Run"
```

---

## 📝 Examples in Action

### Example 1: Weekly Speed Dating
```javascript
eventTitle: "Thursday Night Speed Dating"
eventBannerText: "🌙 Tonight 7-9PM"
```

**Result:**
- Wait page: Shows "Thursday Night Speed Dating"
- Banner: Shows "🌙 Tonight 7-9PM"
- Users know exactly when to join

### Example 2: Holiday Event
```javascript
eventTitle: "Valentine's Day Connections 💕"
eventBannerText: "💕 Love Tonight"
```

**Result:**
- Themed for Valentine's Day
- Festive emojis
- Clear messaging

### Example 3: Promotional
```javascript
eventTitle: "Free Weekend Trial 🎁"
eventBannerText: "🎁 Free Access"
```

**Result:**
- Promotes free access
- Encourages signups
- Clear call-to-action

---

## 💡 Pro Tips

### Tip 1: Match Your Branding
Change text based on your marketing campaigns:
- Running ads for "Singles Night"? Use that as the title
- Promoting "Happy Hour"? Use that theme

### Tip 2: Create Urgency
- "Last Chance - Tonight Only!"
- "Live in 30 Minutes"
- "Limited Spots Available"

### Tip 3: Be Seasonal
- Summer: "Beach Vibes Matchmaking 🏖️"
- Winter: "Cozy Winter Connections ❄️"
- Spring: "Spring Fling 🌸"
- Fall: "Autumn Romance 🍂"

### Tip 4: Test Before Event
- Change text 1 hour before event
- Verify it looks good on mobile
- Check banner doesn't overflow
- Adjust if needed

---

## 🔧 Advanced Usage

### Dynamic Event Names

You can change the text for each event:

**Monday:** "Monday Mixer"  
**Friday:** "Friday Night Fever"  
**Weekend:** "Saturday Social"

Just update in admin panel before each event starts!

### A/B Testing

Try different titles and see which gets more RSVPs:
- Track attendance graph data
- Compare different messaging styles
- Optimize for engagement

---

## 🎯 Quick Reference

### Default Values
```
eventTitle: "Event Mode Active"
eventBannerText: "Event Mode"
```

### Database Fields
```
event_settings.event_title (TEXT, max 50 chars)
event_settings.event_banner_text (TEXT, max 30 chars)
```

### API Endpoints
```
GET  /event/settings           # Returns custom text (public)
POST /admin/event/settings     # Updates custom text (admin only)
```

### Components That Use Custom Text
```
app/event-wait/page.tsx         # {settings.eventTitle}
components/EventModeBanner.tsx  # {eventStatus.eventBannerText}
```

---

## ✅ Summary

**New Capability:** Customize event mode text from admin panel  
**Setup Required:** Run 1 database migration  
**Time to Set Up:** 5 minutes  
**Admin Panel:** Event Settings tab → Custom Event Text section  
**Real-Time:** Yes, updates immediately via Socket.io  
**Mobile Friendly:** Yes, responsive design  

**What You Can Customize:**
1. ✅ Event wait page header (50 chars max)
2. ✅ Notification banner text (30 chars max)

**What Updates Automatically:**
- ✅ All users see changes immediately
- ✅ No page refresh needed
- ✅ Persists in database
- ✅ Survives backend restarts

---

## 🚀 Ready to Use!

After deployment completes (~3 minutes):

1. **Run the migration** (in Railway PostgreSQL)
2. **Login to admin panel**
3. **Go to Event Settings tab**
4. **Scroll to "Custom Event Text" section**
5. **Edit the text fields**
6. **Click "Save Event Settings"**
7. **Changes appear immediately!** 🎉

**Have fun customizing your event mode text!** ✨

