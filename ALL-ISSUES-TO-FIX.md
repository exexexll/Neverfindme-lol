ALL OUTSTANDING ISSUES - ACTION PLAN
=====================================

## ISSUE 1: Instagram Carousel Arrows Missing
Status: BROKEN
Action: Check InstagramEmbed.tsx z-index and visibility

## ISSUE 2: Text Room Social Sharing Not Working
Status: BROKEN  
Action: Fix the actual localStorage key mismatch or validation

## ISSUE 3: Forgot Password 500 Error
Status: NEEDS DEPLOYMENT
Action: Backend code is correct, just needs Railway deploy

## ISSUE 4: QR Scanner Camera Not Connecting
Status: PARTIALLY FIXED
Action: Test with verbose mode, may need different library approach

## ISSUE 5: Video Replay Not Working
Status: FIXED (onEnded handler added)
Action: Test to confirm

## ISSUE 6: Permanent Upgrade Database Not Updating
Status: FIXED (verification fields added to SQL)
Action: Deploy to test

PRIORITY ORDER:
1. Instagram arrows (HIGH - visible bug)
2. Text room socials (HIGH - feature broken)  
3. Deploy backend (CRITICAL - enables forgot password)
4. QR scanner (MEDIUM - alternative methods exist)

Fixing now in order...
