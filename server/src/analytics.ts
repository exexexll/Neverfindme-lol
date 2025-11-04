import express from 'express';
import { query } from './database';
import { store } from './store';

const router = express.Router();

/**
 * Middleware to verify admin access
 */
async function requireAdmin(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  // Verify admin session token
  const session = await store.getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  const user = await store.getUser(session.userId);
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.adminId = user.userId;
  next();
}

/**
 * GET /analytics/overview
 * Get dashboard overview metrics
 */
router.get('/overview', requireAdmin, async (req: any, res) => {
  try {
    // Total users
    const totalUsersResult = await query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0].count);

    // Active users (had session in last 7 days)
    const activeUsersResult = await query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM sessions 
      WHERE last_active_at > NOW() - INTERVAL '7 days'
    `);
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    // Users by account type
    const accountTypesResult = await query(`
      SELECT account_type, COUNT(*) as count 
      FROM users 
      GROUP BY account_type
    `);
    const accountTypes = accountTypesResult.rows.reduce((acc: any, row: any) => {
      acc[row.account_type] = parseInt(row.count);
      return acc;
    }, {});

    // Users by paid status
    const paidStatusResult = await query(`
      SELECT paid_status, COUNT(*) as count 
      FROM users 
      GROUP BY paid_status
    `);
    const paidStatus = paidStatusResult.rows.reduce((acc: any, row: any) => {
      acc[row.paid_status] = parseInt(row.count);
      return acc;
    }, {});

    // Total sessions/calls
    const totalSessionsResult = await query('SELECT COUNT(*) as count FROM chat_history');
    const totalSessions = parseInt(totalSessionsResult.rows[0].count);

    // Average session duration
    const avgDurationResult = await query('SELECT AVG(duration) as avg FROM chat_history');
    const avgDuration = Math.round(parseFloat(avgDurationResult.rows[0].avg) || 0);

    res.json({
      totalUsers,
      activeUsers,
      accountTypes,
      paidStatus,
      totalSessions,
      avgDuration,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Analytics] Overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /analytics/signups
 * Get user signups over time
 * Query params: ?period=7d|30d|90d|1y
 */
router.get('/signups', requireAdmin, async (req: any, res) => {
  try {
    const period = req.query.period || '30d';
    const intervals: Record<string, string> = {
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days',
      '1y': '1 year',
    };

    const interval = intervals[period] || '30 days';

    const result = await query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as signups,
        COUNT(CASE WHEN account_type = 'permanent' THEN 1 END) as permanent,
        COUNT(CASE WHEN account_type = 'guest' THEN 1 END) as guest
      FROM users
      WHERE created_at > NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `);

    const data = result.rows.map((row: any) => ({
      date: row.date,
      signups: parseInt(row.signups),
      permanent: parseInt(row.permanent),
      guest: parseInt(row.guest),
    }));

    res.json({ data, period });
  } catch (error) {
    console.error('[Analytics] Signups error:', error);
    res.status(500).json({ error: 'Failed to fetch signup data' });
  }
});

/**
 * GET /analytics/onboarding-routes
 * Get breakdown of how users signed up
 */
router.get('/onboarding-routes', requireAdmin, async (req: any, res) => {
  try {
    const result = await query(`
      SELECT 
        CASE
          WHEN paid_status = 'paid' THEN 'payment'
          WHEN paid_status = 'qr_verified' THEN 'qr_card'
          WHEN paid_status = 'qr_grace_period' AND invite_code_used LIKE 'TCZIOIXWDZLEFQZC%' THEN 'admin_qr'
          WHEN paid_status = 'qr_grace_period' THEN 'invite_code'
          ELSE 'other'
        END as route,
        COUNT(*) as count
      FROM users
      GROUP BY route
    `);

    const routes = result.rows.reduce((acc: any, row: any) => {
      acc[row.route] = parseInt(row.count);
      return acc;
    }, {});

    res.json({ routes });
  } catch (error) {
    console.error('[Analytics] Onboarding routes error:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding data' });
  }
});

/**
 * GET /analytics/engagement
 * Get user engagement metrics
 */
router.get('/engagement', requireAdmin, async (req: any, res) => {
  try {
    // Sessions by day
    const sessionsResult = await query(`
      SELECT 
        DATE_TRUNC('day', started_at) as date,
        COUNT(*) as sessions,
        AVG(duration) as avg_duration
      FROM chat_history
      WHERE started_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', started_at)
      ORDER BY date ASC
    `);

    const sessionsByDay = sessionsResult.rows.map((row: any) => ({
      date: row.date,
      sessions: parseInt(row.sessions),
      avgDuration: Math.round(parseFloat(row.avg_duration)),
    }));

    // Most active users
    const activeUsersResult = await query(`
      SELECT 
        u.user_id,
        u.name,
        u.session_count,
        u.timer_total_seconds
      FROM users u
      WHERE u.session_count > 0
      ORDER BY u.session_count DESC
      LIMIT 10
    `);

    const topUsers = activeUsersResult.rows.map((row: any) => ({
      userId: row.user_id,
      name: row.name,
      sessionCount: row.session_count,
      totalSeconds: row.timer_total_seconds,
    }));

    res.json({
      sessionsByDay,
      topUsers,
    });
  } catch (error) {
    console.error('[Analytics] Engagement error:', error);
    res.status(500).json({ error: 'Failed to fetch engagement data' });
  }
});

/**
 * GET /analytics/retention
 * Get user retention metrics
 */
router.get('/retention', requireAdmin, async (req: any, res) => {
  try {
    // Users who came back after first session
    const returnUsersResult = await query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE session_count >= 2
    `);
    const returnUsers = parseInt(returnUsersResult.rows[0].count);

    // Total users who had at least 1 session
    const totalActiveResult = await query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE session_count >= 1
    `);
    const totalActive = parseInt(totalActiveResult.rows[0].count);

    const retentionRate = totalActive > 0 ? (returnUsers / totalActive * 100).toFixed(1) : 0;

    res.json({
      returnUsers,
      totalActive,
      retentionRate,
    });
  } catch (error) {
    console.error('[Analytics] Retention error:', error);
    res.status(500).json({ error: 'Failed to fetch retention data' });
  }
});

export default router;

