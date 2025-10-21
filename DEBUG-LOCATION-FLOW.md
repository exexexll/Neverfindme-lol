# 🔍 Debug Location Feature - Why Badge Not Showing

**Current Status:** Migration done, 1 user has location

---

## Checklist:

### 1. ✅ Database Migration
- Table exists: ✅
- 1 user has location: ✅ (d676c224 at LA: 34.019, -118.29)

### 2. ⏳ Need Another User with Location

**Problem:** Badge only shows distance TO other users.  
**If you're the only one with location:** No badge shows (no one to calculate distance to)

**To Test:**
1. Open incognito window
2. Sign up as second user
3. Open matchmaking on both accounts
4. Both grant location permission
5. **Now each should see distance to the other!**

### 3. Check Railway Logs

After Railway redeploys, refresh matchmaking and check logs for:
```
[Queue API] 📍 Current user has location, calculating distances...
[Queue API] 📍 Sorted by distance: 1 users with location
[Queue API] 📍 UserName: 250 ft away (76m)
```

If you see these logs, backend is working!

### 4. Check Browser Console

Open console (F12) when viewing matchmaking:
```javascript
// Check if user data has distance
console.log('Users:', users);
// Should show: { distance: 1234, hasLocation: true, ... }
```

### 5. Quick Test Distance Calculation

Run in browser console:
```javascript
// Test if formatDistance works
const { formatDistance } = await import('/lib/distanceCalculation.ts');
console.log(formatDistance(76)); // Should show "250 ft away"
console.log(formatDistance(1609)); // Should show "1.0 mi away"
```

---

## Most Likely Issue:

**You're the only user online with location!**

The badge shows distance from YOU to OTHER users.  
If no other users have location, badge won't show.

**Quick Fix:** Create a test account, both grant location, then you'll see badges!

