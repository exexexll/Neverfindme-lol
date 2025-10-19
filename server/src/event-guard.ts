import { Request, Response, NextFunction } from 'express';
import { store } from './store';

/**
 * Event Access Guard Middleware
 * Checks if user can access matchmaking based on event mode settings
 * 
 * Usage: app.use('/room/queue', requireEventAccess, ...)
 */
export async function requireEventAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get current event settings
    const settings = await store.getEventSettings();
    
    // If event mode is OFF, allow all access (normal operation)
    if (!settings.eventModeEnabled) {
      return next();
    }
    
    // Event mode is ON - check if event is currently active
    const isActive = await store.isEventActive();
    
    if (isActive) {
      // Event is active RIGHT NOW - allow access
      return next();
    }
    
    // Event is NOT active - check if user has VIP bypass
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (sessionToken) {
      const session = await store.getSession(sessionToken);
      
      if (session) {
        const user = await store.getUser(session.userId);
        
    // SECURITY: Check if user is banned (banned users cannot access even with VIP)
    if (store.isUserBanned(session.userId)) {
      console.warn(`[EventGuard] Banned user ${session.userId.substring(0, 8)} attempted access`);
      res.status(403).json({
        error: 'Account suspended',
        banned: true,
        message: 'Your account has been suspended.',
      });
      return;
    }
        
        if (user?.canAccessOutsideEvents) {
          console.log(`[EventGuard] VIP user ${user.userId.substring(0, 8)} bypassing event restriction`);
          return next(); // VIP bypass
        }
      }
    }
    
    // No VIP access and event not active - block access
    console.log('[EventGuard] Blocking access - event mode ON but event not active');
    
    res.status(403).json({
      error: 'Event not active',
      eventMode: true,
      eventActive: false,
      nextEventStart: settings.eventStartTime,
      nextEventEnd: settings.eventEndTime,
      timezone: settings.timezone,
      message: `Matchmaking is only available during event hours: ${settings.eventStartTime} - ${settings.eventEndTime} ${settings.timezone}`,
    });
  } catch (error) {
    console.error('[EventGuard] Error checking event access:', error);
    // SECURITY: Fail closed on error (block access for security)
    res.status(503).json({
      error: 'Event system temporarily unavailable',
      message: 'Please try again in a moment',
    });
  }
}

/**
 * Check event status for current user
 * Returns event mode info and user access status
 */
export async function getEventStatus(req: any): Promise<{
  eventModeEnabled: boolean;
  eventActive: boolean;
  canAccess: boolean;
  eventStartTime?: string;
  eventEndTime?: string;
  timezone?: string;
  userHasVIP?: boolean;
}> {
  const settings = await store.getEventSettings();
  
  if (!settings.eventModeEnabled) {
    return {
      eventModeEnabled: false,
      eventActive: false,
      canAccess: true,
    };
  }
  
  const isActive = await store.isEventActive();
  let canAccess = isActive;
  let userHasVIP = false;
  
  // Check VIP status
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');
  if (sessionToken) {
    const session = await store.getSession(sessionToken);
    if (session) {
      const user = await store.getUser(session.userId);
      userHasVIP = user?.canAccessOutsideEvents || false;
      if (userHasVIP) {
        canAccess = true;
      }
    }
  }
  
  return {
    eventModeEnabled: true,
    eventActive: isActive,
    canAccess,
    eventStartTime: settings.eventStartTime,
    eventEndTime: settings.eventEndTime,
    timezone: settings.timezone,
    userHasVIP,
  };
}

