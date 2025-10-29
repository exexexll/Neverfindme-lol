/**
 * Guest Account Cleanup Job
 * Deletes expired guest accounts and frees USC cards for re-use
 * Runs every 6 hours
 */

import { query } from './database';

export function startGuestAccountCleanup() {
  // Run immediately on start
  cleanupExpiredGuestAccounts();
  
  // Then run every 6 hours
  setInterval(() => {
    cleanupExpiredGuestAccounts();
  }, 6 * 60 * 60 * 1000); // 6 hours
  
  console.log('[Cleanup] ✅ Guest account cleanup job started (runs every 6 hours)');
}

async function cleanupExpiredGuestAccounts() {
  if (!process.env.DATABASE_URL) {
    console.log('[Cleanup] No database configured, skipping cleanup');
    return;
  }
  
  try {
    console.log('[Cleanup] 🔍 Checking for expired guest accounts...');
    
    // Find expired guest accounts
    const expired = await query(`
      SELECT user_id, name, usc_id, account_expires_at
      FROM users
      WHERE account_type = 'guest'
      AND account_expires_at IS NOT NULL
      AND account_expires_at < NOW()
    `);
    
    if (expired.rows.length === 0) {
      console.log('[Cleanup] No expired guest accounts found');
      return;
    }
    
    console.log(`[Cleanup] Found ${expired.rows.length} expired guest accounts`);
    
    for (const user of expired.rows) {
      try {
        // Delete user (CASCADE will handle related records)
        await query('DELETE FROM users WHERE user_id = $1', [user.user_id]);
        
        // Free USC card if exists
        if (user.usc_id) {
          await query('DELETE FROM usc_card_registrations WHERE usc_id = $1', [user.usc_id]);
          console.log(`[Cleanup] ✅ Freed USC card: ******${user.usc_id.slice(-4)}`);
        }
        
        console.log(`[Cleanup] ✅ Deleted expired guest: ${user.name} (expired: ${user.account_expires_at})`);
      } catch (err: any) {
        console.error(`[Cleanup] Failed to delete user ${user.user_id}:`, err.message);
      }
    }
    
    console.log(`[Cleanup] ✅ Cleanup complete - deleted ${expired.rows.length} expired accounts`);
  } catch (err: any) {
    console.error('[Cleanup] Cleanup job failed:', err.message);
  }
}

