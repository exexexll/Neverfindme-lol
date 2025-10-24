# Next Session TODO

## CRITICAL FIXES COMPLETED ✅
1. Session logout loop fixed (create before invalidate)
2. Admin code users get 'paid' status directly (no grace period)

## REMAINING WORK

### 1. USC Email Verification (High Priority)
**Requirement**: Admin code users must verify @usc.edu email

**Steps**:
- Install Twilio SendGrid SDK (`npm install @sendgrid/mail`)
- Add SENDGRID_API_KEY to environment variables
- Create /api/send-verification-code endpoint
- Create /api/verify-code endpoint
- Update onboarding to show email input for admin codes
- Send 6-digit code to email
- Verify code before allowing signup
- Fail silently if SendGrid not configured

**Code Location**: `app/onboarding/page.tsx`, new API endpoints

### 2. Navigation Blocking (Medium Priority)
**Requirement**: Prevent back/forward during onboarding

**Current State**: Basic prevention exists (lines 63-93)
**Needed**: Strengthen to prevent all bypass attempts

### 3. Reconnection Improvements (Medium Priority)  
**Video Mode**:
- Already has 10s grace + 3 retries
- Consider: Add network quality indicator
- Consider: Pre-emptive reconnection on network change

**Text Mode**:
- Already has Socket.io auto-reconnect
- Consider: Better state restoration after reconnect
- Consider: Message queue during disconnect

### 4. WebRTC Connection Issues (Investigation)
**Issue**: "Connection timeout after 30 seconds"
**Cause**: Network/firewall, not code
**Recommendation**: Add better error messages, suggest user actions

---

**Session Stats**: 74 commits, 13+ hours, ~5000 lines changed
**Next Session**: Fresh start with clear goals above

