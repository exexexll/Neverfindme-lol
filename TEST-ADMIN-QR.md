# Testing Admin QR Code Detection

## What Should Happen:

When you open: `bumpin.io/onboarding?inviteCode=TCZIOIXWDZLEFQZC...`

**Expected Console Logs:**
```
[Onboarding] ===== URL PARAMS CHECK =====
[Onboarding] Full URL: https://bumpin.io/onboarding?inviteCode=TCZIOIXWDZLEFQZC...
[Onboarding] Admin code detected: true
[Onboarding] Initial step: usc-welcome
```

**Expected Screen:**
USC Welcome popup should show immediately (Trojan mascot, "Welcome USC Students!")

## If It's Not Working:

**Check Console for:**
1. What is `isAdminCode` value? (should be `true`)
2. What is `Initial step` value? (should be `usc-welcome`)
3. Are there any other `setStep()` calls happening?
4. Is the waitlist protection redirecting?

**Common Issues:**
- If redirects to /waitlist → Waitlist protection is blocking
- If shows "Let's Get Started" → Step is 'name' not 'usc-welcome'
- If inviteCode doesn't start with TCZIOIXWDZLEFQZC → Wrong code format

**Debug Command:**
In console, paste:
```javascript
new URLSearchParams(window.location.search).get('inviteCode')
// Should return: TCZIOIXWDZLEFQZC...
```

Share the console output with me.
