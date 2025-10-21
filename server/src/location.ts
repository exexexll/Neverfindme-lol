import express from 'express';
import { query } from './database';
import { store } from './store';

const router = express.Router();

/**
 * Middleware: Require authentication
 */
async function requireAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authorization required' });
  
  const session = await store.getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  
  req.userId = session.userId;
  next();
}

/**
 * POST /location/update
 * Update user's current location (opt-in, 24-hour expiry)
 */
router.post('/update', requireAuth, async (req: any, res) => {
  const { latitude, longitude, accuracy } = req.body;
  
  // Validate coordinates
  if (!latitude || !longitude ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  
  // Round to ~100m precision (privacy: prevents exact location)
  const roundedLat = Math.round(latitude * 1000) / 1000;
  const roundedLon = Math.round(longitude * 1000) / 1000;
  
  try {
    // Store location (upsert pattern)
    await query(`
      INSERT INTO user_locations (user_id, latitude, longitude, accuracy)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        latitude = $2,
        longitude = $3,
        accuracy = $4,
        updated_at = NOW(),
        expires_at = NOW() + INTERVAL '24 hours'
    `, [req.userId, roundedLat, roundedLon, accuracy || null]);
    
    // Update user's consent flag and timestamp
    await query(`
      UPDATE users 
      SET location_consent = TRUE,
          location_last_shared = NOW()
      WHERE user_id = $1
    `, [req.userId]);
    
    console.log(`[Location] Updated for user ${req.userId.substring(0, 8)}: ${roundedLat}, ${roundedLon}`);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Location] Update failed:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

/**
 * DELETE /location/clear
 * Clear user's location (opt-out)
 */
router.delete('/clear', requireAuth, async (req: any, res) => {
  try {
    await query('DELETE FROM user_locations WHERE user_id = $1', [req.userId]);
    
    await query(`
      UPDATE users 
      SET location_consent = FALSE,
          location_last_shared = NULL
      WHERE user_id = $1
    `, [req.userId]);
    
    console.log(`[Location] Cleared for user ${req.userId.substring(0, 8)}`);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Location] Clear failed:', error);
    res.status(500).json({ error: 'Failed to clear location' });
  }
});

/**
 * GET /location/status
 * Check if user has active location sharing
 */
router.get('/status', requireAuth, async (req: any, res) => {
  try {
    const result = await query(`
      SELECT 
        CASE WHEN expires_at > NOW() THEN TRUE ELSE FALSE END as active,
        updated_at
      FROM user_locations 
      WHERE user_id = $1
    `, [req.userId]);
    
    const active = result.rows.length > 0 && result.rows[0].active;
    const updatedAt = result.rows.length > 0 ? result.rows[0].updated_at : null;
    
    res.json({ 
      active,
      updatedAt,
      expiresIn: active ? 24 * 3600000 - (Date.now() - new Date(updatedAt).getTime()) : 0
    });
  } catch (error: any) {
    console.error('[Location] Status check failed:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;

