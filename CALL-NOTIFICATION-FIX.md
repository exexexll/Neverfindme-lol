CALL NOTIFICATION & COUNTDOWN ISSUES
=====================================

## Issue 1: Call Notifications Not Working

Current Setup:
- Main page listens to call:notify (line 55-70)
- Sets incomingInvite state
- Renders CalleeNotification (line 416-425)

BUT:
- MatchmakeOverlay ALSO listens to call:notify
- Both handlers fire
- Conflict possible
- Need to check if both work together

## Issue 2: Countdown Resets on Tab Switch

Problem: 20-second countdown resets when switching tabs

Possible Causes:
1. Component unmounts/remounts on visibility change
2. State resets
3. Timer cleared and restarted
4. Page re-renders

Need to:
- Check if CalleeNotification persists across tab switches
- Ensure timer doesn't reset
- Check if invite data is lost

Investigating now...
