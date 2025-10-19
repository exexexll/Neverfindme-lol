import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { store } from './store';
import { requireAdmin } from './admin-auth';

/**
 * Admin Event Routes
 * Requires admin authentication
 */
export function createEventAdminRoutes(io: SocketServer) {
  const router = express.Router();

  /**
   * GET /admin/event/settings
   * Get current event settings
   * PROTECTED: Admin only
   */
  router.get('/event/settings', requireAdmin, async (req, res) => {
    try {
      const settings = await store.getEventSettings();
      res.json(settings);
    } catch (error) {
      console.error('[EventAdmin] Failed to get settings:', error);
      res.status(500).json({ error: 'Failed to load event settings' });
    }
  });

  /**
   * POST /admin/event/settings
   * Update event settings (admin only)
   * PROTECTED: Admin only
   */
  router.post('/event/settings', requireAdmin, async (req, res) => {
    try {
      const {
        eventModeEnabled,
        eventStartTime,
        eventEndTime,
        timezone,
        eventDays,
        eventTitle,
        eventBannerText,
      } = req.body;

      // Validate input
      if (typeof eventModeEnabled !== 'boolean' && eventModeEnabled !== undefined) {
        return res.status(400).json({ error: 'Invalid eventModeEnabled value' });
      }

      if (eventStartTime && !/^\d{2}:\d{2}:\d{2}$/.test(eventStartTime)) {
        return res.status(400).json({ error: 'Invalid eventStartTime format (use HH:MM:SS)' });
      }

      if (eventEndTime && !/^\d{2}:\d{2}:\d{2}$/.test(eventEndTime)) {
        return res.status(400).json({ error: 'Invalid eventEndTime format (use HH:MM:SS)' });
      }

      if (eventDays && (!Array.isArray(eventDays) || !eventDays.every(d => d >= 0 && d <= 6))) {
        return res.status(400).json({ error: 'Invalid eventDays (must be array of 0-6)' });
      }

      // SECURITY: Validate time values
      if (eventStartTime) {
        const [h, m, s] = eventStartTime.split(':').map(Number);
        if (h > 23 || m > 59 || s > 59) {
          return res.status(400).json({ error: 'Invalid start time values' });
        }
      }

      if (eventEndTime) {
        const [h, m, s] = eventEndTime.split(':').map(Number);
        if (h > 23 || m > 59 || s > 59) {
          return res.status(400).json({ error: 'Invalid end time values' });
        }
      }

      // SECURITY: Validate start < end
      if (eventStartTime && eventEndTime) {
        if (eventStartTime >= eventEndTime) {
          return res.status(400).json({ 
            error: 'Event end time must be after start time' 
          });
        }
      }

      // SECURITY: Validate timezone (whitelist)
      const VALID_TIMEZONES = [
        'America/Los_Angeles',
        'America/Denver',
        'America/Chicago',
        'America/New_York',
      ];
      
      if (timezone && !VALID_TIMEZONES.includes(timezone)) {
        return res.status(400).json({ 
          error: 'Invalid timezone. Must be one of: ' + VALID_TIMEZONES.join(', ')
        });
      }

      // Update settings
      await store.updateEventSettings({
        eventModeEnabled,
        eventStartTime,
        eventEndTime,
        timezone,
        eventDays,
        eventTitle,
        eventBannerText,
      });

      // Get updated settings
      const updatedSettings = await store.getEventSettings();

      // Broadcast settings change to all connected clients
      io.emit('event:settings-changed', {
        eventModeEnabled: updatedSettings.eventModeEnabled,
        eventStartTime: updatedSettings.eventStartTime,
        eventEndTime: updatedSettings.eventEndTime,
        timezone: updatedSettings.timezone,
      });

      console.log('[EventAdmin] Settings updated and broadcasted:', updatedSettings);

      res.json({
        success: true,
        settings: updatedSettings,
      });
    } catch (error) {
      console.error('[EventAdmin] Failed to update settings:', error);
      res.status(500).json({ error: 'Failed to update event settings' });
    }
  });

  /**
   * GET /admin/event/attendance/:date
   * Get attendance stats for a specific date
   * PROTECTED: Admin only
   */
  router.get('/event/attendance/:date', requireAdmin, async (req, res) => {
    try {
      const { date } = req.params;
      
      // Validate date format (YYYY-MM-DD)
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
      console.error('[EventAdmin] Failed to get attendance:', error);
      res.status(500).json({ error: 'Failed to load attendance data' });
    }
  });

  /**
   * POST /admin/event/cleanup-old-rsvps
   * Clean up RSVPs older than 7 days
   * PROTECTED: Admin only
   */
  router.post('/event/cleanup-old-rsvps', requireAdmin, async (req, res) => {
    try {
      const deletedCount = await store.cleanupOldRSVPs();
      res.json({
        success: true,
        deletedCount,
        message: `Cleaned up ${deletedCount} old RSVPs`,
      });
    } catch (error) {
      console.error('[EventAdmin] Failed to cleanup RSVPs:', error);
      res.status(500).json({ error: 'Failed to cleanup old RSVPs' });
    }
  });

  return router;
}

export default createEventAdminRoutes;

