import express from 'express';
import { store } from './store';
import { getEventStatus } from './event-guard';

/**
 * User Event Routes
 * For users to check event status, submit RSVPs, view attendance
 */
const router = express.Router();

/**
 * GET /event/status
 * Get current event mode status (public endpoint)
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getEventStatus(req);
    res.json(status);
  } catch (error) {
    console.error('[Event] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to load event status' });
  }
});

/**
 * POST /event/rsvp
 * Submit or update user's RSVP for an event date
 * Body: { preferredTime: '15:00:00', eventDate: '2025-10-20' }
 */
router.post('/rsvp', async (req: any, res) => {
  try {
    const { preferredTime, eventDate } = req.body;
    
    // Get user from session
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const session = await store.getSession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    // Validate input
    if (!preferredTime || !/^\d{2}:\d{2}:\d{2}$/.test(preferredTime)) {
      return res.status(400).json({ error: 'Invalid preferredTime format (use HH:MM:SS)' });
    }
    
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ error: 'Invalid eventDate format (use YYYY-MM-DD)' });
    }
    
    // SECURITY: Check if date is valid range
    const today = new Date().toISOString().split('T')[0];
    if (eventDate < today) {
      return res.status(400).json({ error: 'Cannot RSVP for past dates' });
    }
    
    // SECURITY: Limit to next 30 days (prevent future spam)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    
    if (eventDate > maxDateStr) {
      return res.status(400).json({ 
        error: 'Cannot RSVP more than 30 days in advance' 
      });
    }
    
    // SECURITY: Validate time values
    const [h, m, s] = preferredTime.split(':').map(Number);
    if (h > 23 || m > 59 || s > 59) {
      return res.status(400).json({ error: 'Invalid time values' });
    }
    
    // SECURITY: Validate time is within event window
    const settings = await store.getEventSettings();
    if (preferredTime < settings.eventStartTime || 
        preferredTime > settings.eventEndTime) {
      return res.status(400).json({
        error: `Time must be between ${settings.eventStartTime} and ${settings.eventEndTime}`,
      });
    }
    
    // Save RSVP
    await store.saveEventRSVP(session.userId, preferredTime, eventDate);
    
    res.json({
      success: true,
      message: 'RSVP saved successfully',
    });
  } catch (error) {
    console.error('[Event] Failed to save RSVP:', error);
    res.status(500).json({ error: 'Failed to save RSVP' });
  }
});

/**
 * GET /event/rsvp/:date
 * Get user's RSVP for a specific date
 */
router.get('/rsvp/:date', async (req: any, res) => {
  try {
    const { date } = req.params;
    
    // Get user from session
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const session = await store.getSession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    
    const rsvp = await store.getUserRSVP(session.userId, date);
    
    if (!rsvp) {
      return res.json({
        hasRSVP: false,
        rsvp: null,
      });
    }
    
    res.json({
      hasRSVP: true,
      rsvp: {
        preferredTime: rsvp.preferredTime,
        eventDate: rsvp.eventDate,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Event] Failed to get RSVP:', error);
    res.status(500).json({ error: 'Failed to load RSVP' });
  }
});

/**
 * GET /event/attendance/:date
 * Get attendance data for a specific date (public)
 */
router.get('/attendance/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
    }
    
    const attendance = await store.getEventAttendance(date);
    
    res.json({
      date,
      attendance,
      totalRSVPs: Object.values(attendance).reduce((sum, count) => sum + count, 0),
    });
  } catch (error) {
    console.error('[Event] Failed to get attendance:', error);
    res.status(500).json({ error: 'Failed to load attendance data' });
  }
});

/**
 * GET /event/settings
 * Get current event settings (public, read-only)
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await store.getEventSettings();
    
    // Return only public fields
    res.json({
      eventModeEnabled: settings.eventModeEnabled,
      eventStartTime: settings.eventStartTime,
      eventEndTime: settings.eventEndTime,
      timezone: settings.timezone,
      eventDays: settings.eventDays,
    });
  } catch (error) {
    console.error('[Event] Failed to get settings:', error);
    res.status(500).json({ error: 'Failed to load event settings' });
  }
});

export default router;

