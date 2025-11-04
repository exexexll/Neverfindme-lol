import express from 'express';
import { store } from './store';

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

  // SECURITY: Check if session is still active (not invalidated by new login)
  const isActive = await store.isSessionActive(token);
  if (!isActive) {
    return res.status(401).json({ 
      error: 'Session invalidated',
      message: 'You have been logged out. Please login again.',
      sessionInvalidated: true
    });
  }

  req.userId = session.userId;
  next();
}

/**
 * GET /user/me
 * Get current user profile with metrics
 */
router.get('/me', requireAuth, async (req: any, res) => {
  const user = await store.getUser(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    userId: user.userId,
    name: user.name,
    gender: user.gender,
    accountType: user.accountType,
    email: user.email,
    selfieUrl: user.selfieUrl,
    videoUrl: user.videoUrl,
    socials: user.socials,
    instagramPosts: user.instagramPosts || [], // CRITICAL: Return Instagram posts for carousel
    createdAt: user.createdAt,
    timerTotalSeconds: user.timerTotalSeconds || 0,
    sessionCount: user.sessionCount || 0,
    lastSessions: user.lastSessions || [],
    streakDays: user.streakDays || null,
  });
});

/**
 * PUT /user/me
 * Update user profile (partial updates)
 * Supports: socials object
 */
router.put('/me', requireAuth, async (req: any, res) => {
  const { socials } = req.body;

  if (socials) {
    // Store socials in user object
    // In production: validate and sanitize
    await store.updateUser(req.userId, { socials });
  }

  const user = await store.getUser(req.userId);

  res.json({
    success: true,
    user: {
      userId: user?.userId,
      name: user?.name,
      socials: user?.socials,
    },
  });
});

/**
 * DELETE /user/me
 * Delete user account and all related data
 */
router.delete('/me', requireAuth, async (req: any, res) => {
  const userId = req.userId;
  
  try {
    console.log(`[User] Deleting account for user ${userId.substring(0, 8)}`);
    
    const user = await store.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete from Cloudinary (photos/videos)
    if (user.selfieUrl) {
      try {
        await deleteFromCloudinary(user.selfieUrl);
        console.log(`[User] Deleted selfie from Cloudinary`);
      } catch (err) {
        console.warn(`[User] Failed to delete selfie:`, err);
      }
    }
    
    if (user.videoUrl) {
      try {
        await deleteFromCloudinary(user.videoUrl);
        console.log(`[User] Deleted video from Cloudinary`);
      } catch (err) {
        console.warn(`[User] Failed to delete video:`, err);
      }
    }
    
    // Delete user from database (CASCADE will handle related records)
    await query('DELETE FROM users WHERE user_id = $1', [userId]);
    
    console.log(`[User] ✅ Account deleted: ${user.name}`);
    
    res.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    });
    
  } catch (error: any) {
    console.error('[User] Delete account failed:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;

