# 🔒 Comprehensive Security & UX Implementation Plan

**Date:** October 21, 2025, 4:00 PM  
**Approach:** Careful, systematic implementation  
**Testing:** After each feature before moving to next

---

## 📋 REQUIREMENTS (From User):

### 1. USC Email Restriction on Admin QR Codes ✅
- **Only** admin QR codes require @usc.edu email
- Friend QR codes work as before (no email needed)
- Backend validates email domain
- Frontend asks for email when admin code detected

### 2. Un-Bypassable Onboarding Flow ✅
- Prevent tab closing during onboarding
- Prevent back button
- Show warning if user tries to leave
- Complete profile before accessing app

### 3. Delete Unpaid User Uploads from Cloudinary ✅
- If user uploads but doesn't pay
- Delete their selfie/video from Cloudinary
- Prevent storage overflow from unpaid users
- Clean up on payment failure/timeout

### 4. Prevent Queue Entry Without Photo/Video ✅
- Check if user has selfie AND video before queue
- Show modal: "Please complete your profile first"
- Button to go to /refilm to upload
- Don't allow matchmaking without media

### 5. Skip Intro Video Option ✅
- Allow users to skip video upload
- Button: "Skip for now" on video step
- Can upload later from /refilm page
- Not required for account creation

### 6. 5-Second Minimum Video Length ✅
- Validate video duration >= 5 seconds
- Check on frontend before upload
- Check on backend after upload
- Reject videos <5s with clear error

---

## 🎯 IMPLEMENTATION ORDER:

### Phase 1: Input Fixes (DONE ✅)
- ✅ Timer input allows clearing digits
- ✅ Can type freely 60-500

### Phase 2: USC Email for Admin QR
1. Update `store.useInviteCode()` to accept email parameter
2. Validate @usc.edu for admin codes
3. Frontend: Detect code type, ask for email if admin
4. Test with admin QR code

### Phase 3: Video Validation
1. Add duration check on recording
2. Add backend validation
3. Reject <5s videos with error
4. Test record + upload

### Phase 4: Skip Video Option  
1. Add "Skip" button on video step
2. Allow profile completion without video
3. Update matchmaking check
4. Test onboarding skip flow

### Phase 5: Profile Completion Guard
1. Check selfie + video before queue join
2. Show modal if missing
3. Redirect to /refilm
4. Test queue entry

### Phase 6: Un-Bypassable Onboarding
1. Add beforeunload listener
2. Show warning on tab close
3. Prevent back button
4. Test escape attempts

### Phase 7: Unpaid Upload Cleanup
1. Track uploaded files per user
2. Delete from Cloudinary if payment fails
3. Add cleanup on account deletion
4. Test payment failure scenario

---

## 🔍 CURRENT CODE ANALYSIS:

### What's Already Working:
- ✅ QR code generation (admin + user)
- ✅ Code validation in auth.ts
- ✅ Cloudinary upload system
- ✅ Payment verification
- ✅ Profile completion flow

### What Needs Changes:
- ⚠️ `store.useInviteCode()` - Add email parameter + USC validation
- ⚠️ Onboarding - Add unload prevention
- ⚠️ Media upload - Add duration validation
- ⚠️ Queue entry - Add profile check
- ⚠️ Cloudinary - Add cleanup for unpaid users

---

## 🧪 TESTING CHECKLIST:

After each implementation, test:

- [ ] **USC Email:** Admin QR → asks for email → validates @usc.edu
- [ ] **Video Length:** Record <5s → error shown → record >5s → works
- [ ] **Skip Video:** Click skip → completes onboarding → can upload later
- [ ] **Profile Guard:** No photo → queue blocked → redirected to /refilm
- [ ] **Unload Warning:** Try close tab → warning shown → stays on page
- [ ] **Upload Cleanup:** Upload → don't pay → files deleted from Cloudinary

---

**Ready to implement Phase 2: USC Email Restriction**

Starting implementation now...

