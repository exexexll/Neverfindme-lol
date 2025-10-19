# CRITICAL FIXES NEEDED

## Issue #1: Railway Backend Query Cache
**Problem:** event_settings table exists, but Railway doesn't see it  
**Cause:** Running server cached "table doesn't exist" error  
**Fix:** Restart Railway backend service (not just redeploy)

## Issue #2: Infinite Loop (13,000 errors)
**Problem:** getEventStatus called repeatedly in tight loop  
**Location:** AuthGuard.tsx line 64 - called inside useEffect without proper deps  
**Fix:** Add dependency array or use ref to prevent re-calling

## Issue #3: Admin 401
**Problem:** requireAdmin middleware not properly configured  
**Fix:** Check admin session validation

## Action Required:
1. Railway → Backend → Click "Restart" (not redeploy)
2. Fix infinite loop in AuthGuard
3. Fix admin auth

