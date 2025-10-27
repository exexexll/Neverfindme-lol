# Debug Instagram Carousel - Complete Checklist

**Created**: October 27, 2025  
**Purpose**: Verify Instagram posts are saving and displaying correctly

---

## 🔍 STEP-BY-STEP DEBUGGING

### Step 1: Verify Post Was Saved ✅

**Go to**: `/socials` page  
**Action**: Open browser console (F12 or Cmd+Option+I)

**Add a post and look for**:
```javascript
[Socials] ✅ Instagram posts saved: 1
```

If you see this, the post saved successfully to database ✅

**Check API Response**:
```javascript
// In Network tab:
POST /instagram/posts
Response: { success: true, posts: ["https://www.instagram.com/p/ABC/"] }
```

---

### Step 2: Verify Backend Returns Posts ✅

**Go to**: `/matchmake` page (or refresh)  
**Action**: Check console for queue data

**Look for**:
```javascript
[Matchmake] ✅ Received from API: X users shown
```

**Check if user has posts**:
```javascript
// In console, type:
console.log(window.users); // Should show users array

// OR in Network tab:
GET /room/queue
Response: {
  users: [
    {
      name: "...",
      videoUrl: "...",
      instagramPosts: ["https://..."], // ← Should be here
      ...
    }
  ]
}
```

If `instagramPosts: []` (empty), posts didn't save or user doesn't have posts.

---

### Step 3: Verify UserCard Receives Posts ✅

**When viewing a user**, check console:

**Look for**:
```javascript
[UserCard] User has X Instagram posts
[Carousel] mediaItems: [{ type: 'video', url }, { type: 'instagram', url }]
```

**If you see**:
```javascript
[Carousel] mediaItems: [{ type: 'video', url }]
// Only video, no Instagram posts
```

Then posts aren't being passed to UserCard.

---

### Step 4: Verify Instagram Embed Loads ✅

**When you click right arrow (or swipe)**, check console:

**Look for**:
```javascript
[InstagramEmbed] Rendering post: https://www.instagram.com/p/ABC/
[InstagramEmbed] 📜 Script loaded
[InstagramEmbed] 🔄 Processing embed...
```

**If you see error**:
```javascript
[InstagramEmbed] ⚠️ Instagram script not loaded yet
```

Script is blocked or slow to load.

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: "View this post on Instagram" Fallback Shows

**Cause**: Instagram embed.js not processing blockquote  
**Debug**:
```javascript
// In console, check if script loaded:
console.log(window.instgrm);
// Should show: { Embeds: { process: function } }
```

**Fix**: 
- Check network tab for blocked script
- Verify URL: `https://platform.instagram.com/en_US/embeds.js`
- Try manually processing:
  ```javascript
  window.instgrm.Embeds.process();
  ```

### Issue 2: Posts Not Saving

**Debug**:
```javascript
// In /socials page console:
// When you click "Save Posts", check:
POST /instagram/posts
Status: 200 (success) or 4xx/5xx (error)
```

**If 401 Unauthorized**:
- Session expired, refresh page
- Login again

**If 400 Bad Request**:
- URL format wrong
- Must be: `https://www.instagram.com/p/POST_ID/`

### Issue 3: Posts Not Appearing in Queue

**Debug**:
```javascript
// Check if backend is returning posts:
GET /room/queue
Response → users[0] → instagramPosts

// Should be array of URLs
```

**If empty `[]`**:
- Posts didn't save to database
- OR viewing different user (not your own profile)
- OR backend cache issue (restart server)

### Issue 4: Carousel Dots Not Showing

**Cause**: Only 1 media item (video only)  
**Check**:
```javascript
// In UserCard console:
totalMedia: 1 // Only video, no posts
```

**Fix**: Add Instagram posts, they should appear

### Issue 5: Can't Navigate with Arrows

**Debug**:
```javascript
// Check if arrows visible:
totalMedia > 1 // Should be true

// Click arrow and look for:
[Carousel] Swipe left: 0 → 1
// Index should change
```

---

## 🎯 MANUAL TESTING SCRIPT

**Copy-paste this into browser console to debug**:

```javascript
// === INSTAGRAM CAROUSEL DEBUG SCRIPT ===

console.log('🔍 DEBUGGING INSTAGRAM CAROUSEL');
console.log('================================');

// Check if on matchmake page
const currentUrl = window.location.pathname;
console.log('📍 Current page:', currentUrl);

// Check if Instagram script loaded
if (window.instgrm) {
  console.log('✅ Instagram script loaded');
  console.log('   Methods:', Object.keys(window.instgrm));
} else {
  console.log('❌ Instagram script NOT loaded');
}

// Try to find UserCard component
const videoElement = document.querySelector('video');
if (videoElement) {
  console.log('✅ Video element found (UserCard rendered)');
} else {
  console.log('❌ No video element (UserCard not rendered)');
}

// Check for carousel dots
const dots = document.querySelectorAll('[title^="Post"]');
console.log(`🎯 Carousel dots found: ${dots.length}`);
if (dots.length === 0) {
  console.log('   → Only 1 media item (no Instagram posts)');
} else {
  console.log('   → Multiple items (video + posts)');
}

// Check for Instagram embed
const igEmbed = document.querySelector('.instagram-media');
if (igEmbed) {
  console.log('✅ Instagram blockquote found');
  console.log('   URL:', igEmbed.getAttribute('data-instgrm-permalink'));
} else {
  console.log('❌ No Instagram blockquote (not on Instagram slide)');
}

// Try to manually process embeds
if (window.instgrm?.Embeds) {
  console.log('🔄 Manually processing embeds...');
  window.instgrm.Embeds.process();
  console.log('✅ Process called');
}

console.log('================================');
console.log('Copy this output and send to debug');
```

---

## ✅ EXPECTED BEHAVIOR

### When Everything Works:
```
1. Go to /socials
2. Scroll to Instagram Posts
3. Add URL: https://www.instagram.com/p/ABC123/
4. Click "Add"
5. Click "Save Posts"
   Console: [Socials] ✅ Instagram posts saved: 1

6. Go to /matchmake
7. View user profile (click arrows or swipe)
8. See carousel dots at BOTTOM (small pill shape)
   Console: [Carousel] mediaItems: [video, instagram]

9. Click right arrow (or swipe left)
   Console: [Carousel] Swipe left: 0 → 1
   Console: [InstagramEmbed] Rendering post: URL
   Console: [InstagramEmbed] 📜 Script loaded
   Console: [InstagramEmbed] 🔄 Processing embed...

10. Instagram post appears (not just "View on Instagram")
    Post shows: Image, caption, likes, comments
```

---

## 🚀 QUICK FIX CHECKLIST

If posts not showing:

1. ✅ Check console for "[Socials] ✅ Instagram posts saved"
2. ✅ Refresh /matchmake page
3. ✅ Check Network tab for GET /room/queue response
4. ✅ Verify instagramPosts field in response
5. ✅ Click right arrow to go to post (from video)
6. ✅ Check console for Instagram embed logs
7. ✅ Wait 2-3 seconds for embed to process
8. ✅ If still fallback, manually call window.instgrm.Embeds.process()

---

## 💡 KNOWN INSTAGRAM EMBED BEHAVIOR

**Normal**:
- Takes 2-3 seconds to load
- Shows fallback first ("View this post on Instagram")
- Then transforms into full embed
- Requires internet connection
- Instagram's servers must be reachable

**If Stuck on Fallback**:
- Instagram script blocked by ad blocker
- Network issue
- Instagram API down
- Invalid post URL
- Post was deleted

**Fallback Content is OK**:
- Still clickable (opens Instagram)
- Shows post URL
- Better than nothing
- Most embeds transform after a few seconds

---

## 🎯 FINAL NOTES

**Carousel Dots**: Now at BOTTOM, outside content area ✅  
**Instagram Embed**: Edgeless design (no borders/shadows) ✅  
**Social Links**: Open directly (no FloatingBrowser) ✅  
**Console Logs**: Added for debugging ✅

**All changes deployed** - refresh page to see updates!

