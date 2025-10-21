import express from 'express';
import { store } from './store';
import { v4 as uuidv4 } from 'uuid';
import { requirePayment } from './paywall-guard';
import { requireEventAccess } from './event-guard';
import { query } from './database';

const router = express.Router();

/**
 * Middleware to verify session token
 */
async function requireAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const session = await store.getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // SECURITY: Check if session is still active
  const isActive = await store.isSessionActive(token);
  if (!isActive) {
    return res.status(401).json({ 
      error: 'Session invalidated',
      sessionInvalidated: true
    });
  }

  req.userId = session.userId;
  next();
}

/**
 * GET /room/history
 * Get user's chat history
 */
router.get('/history', requireAuth, async (req: any, res) => {
  const history = await store.getHistory(req.userId);
  res.json({ history });
});

/**
 * GET /room/me
 * Get current user info including timer total
 */
router.get('/me', requireAuth, async (req: any, res) => {
  const user = await store.getUser(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const timerTotal = store.getTimerTotal(req.userId);

  res.json({
    userId: user.userId,
    name: user.name,
    selfieUrl: user.selfieUrl,
    timerTotal,
  });
});

/**
 * GET /room/queue
 * Get list of online & available users (algorithm-free)
 * PROTECTED: Requires payment + event access
 * EVENT MODE: This endpoint is event-restricted (queue access only during events)
 */
router.get('/queue', requireAuth, requirePayment, requireEventAccess, async (req: any, res) => {
  const onlineUsers = store.getAllOnlineAvailable(req.userId);
  const totalAvailable = onlineUsers.length; // Total before any filtering
  
  console.log(`[Queue API] ========================================`);
  console.log(`[Queue API] User ${req.userId.substring(0, 8)} requesting queue`);
  console.log(`[Queue API] Total online & available (excluding self): ${totalAvailable}`);
  console.log(`[Queue API] User IDs: ${onlineUsers.map(uid => uid.substring(0, 8)).join(', ')}`);
  
  const users = await Promise.all(
    onlineUsers.map(async (uid) => {
      const user = await store.getUser(uid);
      if (!user) {
        console.log(`[Queue API] ⚠️  User ${uid.substring(0, 8)} in presence but not in users store`);
        return null;
      }
      
      // Hide if current user has reported this user
      if (store.hasReportedUser(req.userId, uid)) {
        console.log(`[Queue API] 🚫 Hiding ${user.name} (reported by current user)`);
        return null;
      }
      
      // Check cooldown (mark but don't filter)
      const hasCooldown = await store.hasCooldown(req.userId, uid);
      const cooldownExpiry = hasCooldown ? store.getCooldownExpiry(req.userId, uid) : null;

      if (hasCooldown) {
        console.log(`[Queue API] ⏰ Marking ${user.name} with cooldown (showing but disabled)`);
      } else {
        console.log(`[Queue API] ✅ Including ${user.name} (${uid.substring(0, 8)})`);
      }

      // Check if this user was introduced to the current user
      const wasIntroducedToMe = user.introducedTo === req.userId;
      const introducedByUser = wasIntroducedToMe && user.introducedBy 
        ? await store.getUser(user.introducedBy) 
        : null;

      return {
        userId: user.userId,
        name: user.name,
        gender: user.gender,
        selfieUrl: user.selfieUrl,
        videoUrl: user.videoUrl,
        hasCooldown,
        cooldownExpiry,
        wasIntroducedToMe,
        introducedBy: introducedByUser?.name || null,
      };
    })
  );
  
  let filteredUsers = users.filter(Boolean) as any[];

  // LOCATION-BASED SORTING: Calculate distances if user has location
  try {
    const currentUserLocation = await query(
      'SELECT latitude, longitude FROM user_locations WHERE user_id = $1 AND expires_at > NOW()',
      [req.userId]
    );
    
    if (currentUserLocation.rows.length > 0) {
      const { latitude: userLat, longitude: userLon } = currentUserLocation.rows[0];
      console.log(`[Queue API] 📍 Current user has location, calculating distances...`);
      
      // Get locations for all users in queue
      const userIds = filteredUsers.map(u => u.userId);
      const locations = await query(
        'SELECT user_id, latitude, longitude FROM user_locations WHERE user_id = ANY($1) AND expires_at > NOW()',
        [userIds]
      );
      
      const locationMap = new Map(
        locations.rows.map(row => [row.user_id, { lat: row.latitude, lon: row.longitude }])
      );
      
      // Calculate distance for each user (Haversine formula)
      filteredUsers = filteredUsers.map(user => {
        const targetLocation = locationMap.get(user.userId);
        if (!targetLocation) {
          return { ...user, distance: null, hasLocation: false };
        }
        
        // Haversine formula
        const R = 6371000; // Earth radius in meters
        const φ1 = (userLat * Math.PI) / 180;
        const φ2 = (targetLocation.lat * Math.PI) / 180;
        const Δφ = ((targetLocation.lat - userLat) * Math.PI) / 180;
        const Δλ = ((targetLocation.lon - userLon) * Math.PI) / 180;
        
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // meters
        
        return { ...user, distance, hasLocation: true };
      });
      
      // Sort by distance (closest first), then by name for users without location
      filteredUsers.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1; // No location users go last
        if (b.distance === null) return -1;
        return a.distance - b.distance; // Ascending distance
      });
      
      const withLocation = filteredUsers.filter(u => u.hasLocation).length;
      console.log(`[Queue API] 📍 Sorted by distance: ${withLocation} users with location`);
    }
  } catch (error) {
    console.error('[Queue API] Location sorting failed (non-critical):', error);
    // Continue without distance sorting
  }

  console.log(`[Queue API] Final result: ${filteredUsers.length} users (${filteredUsers.filter((u: any) => u.hasCooldown).length} with cooldown)`);
  console.log(`[Queue API] Returning: ${filteredUsers.map((u: any) => `${u.name}${u.hasCooldown ? ' [COOLDOWN]' : ''}`).join(', ')}`);
  console.log(`[Queue API] Total available count: ${totalAvailable}`);
  console.log(`[Queue API] ========================================`);
  res.json({ users: filteredUsers, totalAvailable });
});

/**
 * GET /room/reel
 * Random batch of online users (uniform shuffle, no algorithm)
 * PROTECTED: Requires payment or valid invite code
 */
router.get('/reel', requirePayment, async (req: any, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const cursor = req.query.cursor as string || uuidv4();

  const onlineUsers = store.getAllOnlineAvailable(req.userId);
  const seen = store.getSeen(cursor);

  // Filter out seen users and cooldowns
  const unseenPromises = onlineUsers.map(async uid => {
    if (seen.has(uid)) return null;
    if (await store.hasCooldown(req.userId, uid)) return null;
    return uid;
  });
  
  const unseenResults = await Promise.all(unseenPromises);
  const unseen = unseenResults.filter((uid): uid is string => uid !== null);

  // Random shuffle (Fisher-Yates)
  const shuffled = [...unseen];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Take batch
  const batch = shuffled.slice(0, limit);

  // Mark as seen
  batch.forEach(uid => store.addSeen(cursor, uid));

  // Map to user data
  const userPromises = batch.map(async (uid) => {
    const user = await store.getUser(uid);
    if (!user) return null;

    return {
      userId: user.userId,
      name: user.name,
      gender: user.gender,
      selfieUrl: user.selfieUrl,
      videoUrl: user.videoUrl,
    };
  });
  
  const allItems = await Promise.all(userPromises);
  const items = allItems.filter(Boolean);

  res.json({
    items,
    cursor,
    hasMore: shuffled.length > limit,
  });
});

export default router;

