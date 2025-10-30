import express from 'express';
import crypto from 'crypto';
import { query } from './database';
import { store } from './store';

const router = express.Router();

// Rate limiting for scan attempts
const scanAttempts = new Map<string, number[]>(); // IP -> timestamps[]

/**
 * Extract USC ID from barcode
 * USC format: 12683060215156 (14 digits) = 1268306021 (ID) + 5156 (card#)
 */
function extractUSCId(rawBarcodeValue: string): string | null {
  const digits = rawBarcodeValue.replace(/\D/g, '');
  
  // 14 digits: Full USC card barcode
  if (digits.length === 14) {
    return digits.substring(0, 10);
  }
  
  // 10 digits: Pure USC ID
  if (digits.length === 10) {
    return digits;
  }
  
  // Try to find 10-digit sequence
  const match = digits.match(/(\d{10})/);
  return match ? match[1] : null;
}

/**
 * Hash USC ID for privacy
 */
function hashUSCId(uscId: string): string {
  const salt = process.env.USC_ID_SALT || 'default-salt-change-in-production';
  return crypto.createHash('sha256').update(uscId + salt).digest('hex');
}

/**
 * Check scan rate limit
 */
function checkScanRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempts = scanAttempts.get(ip) || [];
  
  // Remove attempts older than 10 minutes
  const recent = attempts.filter(t => now - t < 10 * 60 * 1000);
  
  // Allow max 10 attempts per 10 minutes
  if (recent.length >= 10) {
    console.log(`[USC] Rate limit hit for IP ${ip}`);
    return false;
  }
  
  // Add this attempt
  recent.push(now);
  scanAttempts.set(ip, recent);
  
  return true;
}

/**
 * Log scan attempt for auditing
 */
async function logScanAttempt(data: {
  rawValue: string;
  uscId: string | null;
  valid: boolean;
  ip: string;
  userAgent: string;
  error?: string;
}) {
  try {
    await query(`
      INSERT INTO usc_scan_attempts (
        raw_barcode_value, extracted_usc_id, passed_validation,
        ip_address, user_agent, validation_errors
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      data.rawValue,
      data.uscId,
      data.valid,
      data.ip,
      data.userAgent,
      data.error ? JSON.stringify({ error: data.error }) : null,
    ]);
  } catch (err) {
    console.error('[USC] Failed to log scan attempt:', err);
  }
}

/**
 * POST /usc/verify-card
 * Verify scanned USC card is valid and not already registered
 * Multi-layer fraud prevention
 */
router.post('/verify-card', async (req: any, res) => {
  const { rawBarcodeValue, barcodeFormat } = req.body;
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  
  // SECURITY LAYER 1: Input validation
  if (!rawBarcodeValue || typeof rawBarcodeValue !== 'string') {
    await logScanAttempt({
      rawValue: String(rawBarcodeValue),
      uscId: null,
      valid: false,
      ip,
      userAgent,
      error: 'Invalid input type',
    });
    return res.status(400).json({ error: 'Barcode value is required' });
  }
  
  if (rawBarcodeValue.length > 50 || rawBarcodeValue.length < 10) {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId: null,
      valid: false,
      ip,
      userAgent,
      error: 'Invalid barcode length',
    });
    return res.status(400).json({ error: 'Invalid barcode length' });
  }
  
  // SECURITY LAYER 2: Rate limiting (prevent brute force)
  if (!checkScanRateLimit(ip)) {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId: null,
      valid: false,
      ip,
      userAgent,
      error: 'Rate limited',
    });
    return res.status(429).json({ 
      error: 'Too many scan attempts. Please wait 10 minutes.' 
    });
  }
  
  console.log('[USC] Verify card request (redacted):', { length: rawBarcodeValue.length, format: barcodeFormat, ip });
  
  // SECURITY LAYER 3: Extract and validate USC ID
  const uscId = extractUSCId(rawBarcodeValue);
  
  if (!uscId) {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId: null,
      valid: false,
      ip,
      userAgent,
      error: 'Could not extract USC ID',
    });
    
    return res.status(400).json({ 
      error: 'Invalid barcode. Please scan the barcode on the back of your USC card.' 
    });
  }
  
  // SECURITY LAYER 4: Validate USC ID format
  if (!/^[0-9]{10}$/.test(uscId)) {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId,
      valid: false,
      ip,
      userAgent,
      error: 'Invalid USC ID format',
    });
    
    return res.status(400).json({ 
      error: 'Invalid USC ID format' 
    });
  }
  
  // SECURITY LAYER 5: Validate USC ID range (allow 1-9, reject 0)
  const firstDigit = uscId[0];
  if (firstDigit === '0') {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId,
      valid: false,
      ip,
      userAgent,
      error: 'USC ID starts with 0 (invalid)',
    });
    
    return res.status(400).json({ 
      error: 'Invalid USC ID format' 
    });
  }
  
  // SECURITY LAYER 6: Check for suspicious patterns (sequential IDs, test IDs)
  if (uscId === '1234567890' || uscId === '0000000000' || uscId === '9999999999') {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId,
      valid: false,
      ip,
      userAgent,
      error: 'Suspicious USC ID pattern',
    });
    
    return res.status(400).json({ 
      error: 'Invalid USC ID' 
    });
  }
  
  // SECURITY LAYER 7: Check duplicate registration
  const existing = await query(
    'SELECT user_id FROM usc_card_registrations WHERE usc_id = $1',
    [uscId]
  );
  
  if (existing.rows.length > 0) {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId,
      valid: false,
      ip,
      userAgent,
      error: 'Card already registered',
    });
    
    // SECURITY: Don't leak user data (name, registration date)
    return res.status(409).json({ 
      error: 'USC Card already registered to another account'
      // Intentionally not including registeredAt or registeredName (privacy)
    });
  }
  
  // SECURITY LAYER 8: Check for suspicious activity (multiple different cards from same IP)
  const ipHistory = await query(
    `SELECT COUNT(DISTINCT extracted_usc_id) as unique_cards
     FROM usc_scan_attempts
     WHERE ip_address = $1
     AND scanned_at > NOW() - INTERVAL '24 hours'
     AND passed_validation = true`,
    [ip]
  );
  
  if (ipHistory.rows.length > 0 && ipHistory.rows[0].unique_cards >= 3) {
    await logScanAttempt({
      rawValue: rawBarcodeValue,
      uscId,
      valid: false,
      ip,
      userAgent,
      error: 'Suspicious activity - multiple cards from same IP',
    });
    
    console.warn(`[USC] ⚠️ Suspicious: IP ${ip} scanned ${ipHistory.rows[0].unique_cards} different cards in 24h`);
    
    return res.status(429).json({ 
      error: 'Suspicious activity detected. Please contact support.' 
    });
  }
  
  // All checks passed
  await logScanAttempt({
    rawValue: rawBarcodeValue,
    uscId,
    valid: true,
    ip,
    userAgent,
  });
  
  res.json({ 
    valid: true, 
    uscId: '******' + uscId.slice(-4), // Redacted for privacy
    message: 'USC Card verified successfully' 
  });
});

/**
 * POST /usc/login-card
 * Login using USC card scan
 */
router.post('/login-card', async (req: any, res) => {
  try {
    const { rawBarcodeValue } = req.body;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    
    console.log('[USC Login] Request received from IP:', ip);
    
    // SECURITY: Input validation
    if (!rawBarcodeValue || typeof rawBarcodeValue !== 'string' || rawBarcodeValue.length > 50) {
      console.error('[USC Login] Invalid barcode value');
      return res.status(400).json({ error: 'Invalid barcode' });
    }
    
    // Rate limiting
    if (!checkScanRateLimit(ip)) {
      console.warn('[USC Login] Rate limit exceeded for IP:', ip);
      return res.status(429).json({ error: 'Too many attempts' });
    }
    
    // Extract USC ID
    const uscId = extractUSCId(rawBarcodeValue);
    console.log('[USC Login] Extracted USC ID:', uscId ? '******' + uscId.slice(-4) : 'NULL');
    
    if (!uscId || !/^[0-9]{10}$/.test(uscId)) {
      console.error('[USC Login] Invalid USC ID format');
      return res.status(400).json({ error: 'Invalid USC card' });
    }
  
  // Find user
  const userResult = await query(
    'SELECT * FROM users WHERE usc_id = $1',
    [uscId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ 
      error: 'USC Card not registered. Please sign up first.' 
    });
  }
  
  const user = userResult.rows[0];
  
  // Check if guest account expired
  if (user.account_type === 'guest' && user.account_expires_at) {
    const expiryDate = new Date(user.account_expires_at);
    if (expiryDate < new Date()) {
      // Expired - delete account
      await query('DELETE FROM users WHERE user_id = $1', [user.user_id]);
      await query('DELETE FROM usc_card_registrations WHERE usc_id = $1', [uscId]);
      
      return res.status(410).json({ 
        error: 'Guest account expired. Your USC card is now available for re-registration.' 
      });
    }
  }
  
  // Check if banned
  if (user.ban_status === 'banned') {
    return res.status(403).json({ error: 'Account suspended' });
  }
  
  // CRITICAL: Invalidate all other sessions (single session enforcement)
  await store.invalidateUserSessions(user.user_id);
  console.log('[USC Login] Invalidated previous sessions for user');
  
  // Create NEW session (proper Session object)
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const session = {
    sessionToken,
    userId: user.user_id,
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    ipAddress: ip,
    isActive: true,
    lastActiveAt: Date.now(),
  };
  await store.createSession(session);
  console.log('[USC Login] New session created');
  
  // Update login time (best effort - column may not exist in older schemas)
  try {
    await query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);
  } catch (lastLoginErr) {
    console.warn('[USC Login] last_login column missing (non-critical)');
  }
  
  try {
    await query(`
      UPDATE usc_card_registrations 
      SET last_login_via_card_at = NOW(), total_card_logins = total_card_logins + 1
      WHERE usc_id = $1
    `, [uscId]);
  } catch (loginUpdateErr) {
    console.warn('[USC Login] Failed to update login stats (non-critical)');
  }
  
  console.log(`[USC Login] ✅ Login successful for USC ID ******${uscId.slice(-4)}, user: ${user.user_id.substring(0, 8)}`);
  
  res.json({
    sessionToken,
    userId: user.user_id,
    accountType: user.account_type,
    expiresAt: user.account_expires_at,
  });
  } catch (err: any) {
    console.error('[USC Login] CRITICAL ERROR:', err);
    console.error('[USC Login] Error message:', err.message);
    console.error('[USC Login] Error stack:', err.stack?.split('\n').slice(0, 5));
    res.status(500).json({ 
      error: 'Login failed: ' + err.message,
      details: err.message
    });
  }
});

/**
 * POST /usc/finalize-registration
 * Called AFTER onboarding complete to save USC card to database
 * This prevents incomplete onboardings from blocking USC cards
 */
router.post('/finalize-registration', async (req: any, res) => {
  const { uscId, rawBarcodeValue, barcodeFormat, userId } = req.body;
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  
  console.log('[USC] Finalize registration request:', { uscId: uscId ? '******' + uscId.slice(-4) : 'NULL', userId: userId?.substring(0, 8) });
  
  // Validate inputs
  if (!uscId || !/^[0-9]{10}$/.test(uscId)) {
    console.error('[USC] Invalid USC ID:', uscId);
    return res.status(400).json({ error: 'Invalid USC ID' });
  }
  
  if (!userId) {
    console.error('[USC] Missing user ID');
    return res.status(400).json({ error: 'User ID required' });
  }
  
  // Validate barcode format
  const validFormats = ['CODABAR', 'CODE_128', 'CODE_39', 'CODE_93', 'ITF'];
  if (barcodeFormat && !validFormats.includes(barcodeFormat)) {
    return res.status(400).json({ error: 'Invalid barcode format' });
  }
  
  try {
    // CRITICAL: Check BOTH memory and database for user
    let userInDb = null;
    
    try {
      const userCheck = await query(
        'SELECT user_id, name, paid_status FROM users WHERE user_id = $1',
        [userId]
      );
      userInDb = userCheck.rows[0] || null;
    } catch (dbErr) {
      console.warn('[USC] Database query failed, checking memory store');
    }
    
    // Check memory store as fallback
    const userInMemory = await store.getUser(userId);
    
    if (!userInDb && !userInMemory) {
      console.error('[USC] User not found anywhere:', userId);
      return res.status(404).json({ 
        error: 'User not found. Please complete onboarding first.'
      });
    }
    
    if (!userInDb && userInMemory) {
      console.warn('[USC] User found in MEMORY but NOT in database');
      console.log('[USC] Attempting to save user to database first...');
      
      // Try to save user to database (required for foreign key)
      try {
        await store.createUser(userInMemory);
        console.log('[USC] ✅ User saved to database');
        // Re-check if user now exists
        const recheck = await query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
        if (recheck.rows.length === 0) {
          // Still not in database - can't proceed
          console.error('[USC] User still not in database after createUser');
          return res.status(500).json({ 
            error: 'Failed to save user to database. Please try again or contact support.' 
          });
        }
      } catch (saveErr: any) {
        console.error('[USC] Failed to save user to database:', saveErr.message);
        return res.status(500).json({ 
          error: 'Database error. Please try again.' 
        });
      }
    } else {
      console.log('[USC] User exists in database:', userInDb.name, 'paidStatus:', userInDb.paid_status);
    }
    
    // ATOMIC: Check duplicate and insert in transaction
    await query('BEGIN');
    
    const existing = await query(
      'SELECT user_id FROM usc_card_registrations WHERE usc_id = $1 FOR UPDATE',
      [uscId]
    );
    
    if (existing.rows.length > 0) {
      await query('ROLLBACK');
      console.log('[USC] Card already registered');
      return res.status(409).json({ 
        error: 'USC Card already registered to another account'
      });
    }
    
    console.log('[USC] Inserting USC card registration...');
    
    // Register USC card
    const uscIdHash = hashUSCId(uscId);
    
    await query(`
      INSERT INTO usc_card_registrations (
        usc_id, usc_id_hash, user_id, first_scanned_ip,
        raw_barcode_value, barcode_format
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      uscId,
      uscIdHash,
      userId,
      ip,
      rawBarcodeValue || uscId,
      barcodeFormat || 'CODABAR',
    ]);
    
    console.log('[USC] USC card inserted, updating user...');
    
    // Update user with USC ID
    const updateResult = await query(`
      UPDATE users 
      SET usc_id = $1, usc_verified_at = NOW(), verification_method = 'usc_card'
      WHERE user_id = $2
      RETURNING user_id
    `, [uscId, userId]);
    
    if (updateResult.rows.length === 0) {
      await query('ROLLBACK');
      console.error('[USC] User update failed - user not found');
      return res.status(404).json({ error: 'User not found for update' });
    }
    
    console.log('[USC] User updated with USC ID');
    
    await query('COMMIT');
    
    console.log(`[USC] Finalized registration for USC ID ******${uscId.slice(-4)}, user ${userId.substring(0, 8)}`);
    
    res.json({ 
      success: true,
      message: 'USC card registered successfully'
    });
    
  } catch (err: any) {
    try {
      await query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[USC] Rollback failed:', rollbackErr);
    }
    
    console.error('[USC] Finalize registration failed:', err);
    console.error('[USC] Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack?.split('\n').slice(0, 3)
    });
    
    res.status(500).json({ 
      error: 'Failed to register USC card: ' + err.message 
    });
  }
});

export default router;

