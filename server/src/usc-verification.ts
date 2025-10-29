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
 */
router.post('/verify-card', async (req: any, res) => {
  const { rawBarcodeValue, barcodeFormat } = req.body;
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  
  // Rate limiting
  if (!checkScanRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Too many scan attempts. Please wait 10 minutes.' 
    });
  }
  
  console.log('[USC] Verify card request:', { rawBarcodeValue, format: barcodeFormat, ip });
  
  // Extract USC ID
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
  
  // Validate format
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
  
  // Check if card already registered
  const existing = await query(
    'SELECT user_id, first_scanned_at, u.name FROM usc_card_registrations r JOIN users u ON r.user_id = u.user_id WHERE usc_id = $1',
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
    
    return res.status(409).json({ 
      error: 'USC Card already registered to another account',
      registeredAt: existing.rows[0].first_scanned_at,
      registeredName: existing.rows[0].name,
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
  const { rawBarcodeValue } = req.body;
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  
  // Rate limiting
  if (!checkScanRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many attempts' });
  }
  
  // Extract USC ID
  const uscId = extractUSCId(rawBarcodeValue);
  
  if (!uscId || !/^[0-9]{10}$/.test(uscId)) {
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
  
  // Create session
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await store.createSession(sessionToken, user.user_id, user.account_type);
  
  // Update login time
  await query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);
  await query(`
    UPDATE usc_card_registrations 
    SET last_login_via_card_at = NOW(), total_card_logins = total_card_logins + 1
    WHERE usc_id = $1
  `, [uscId]);
  
  console.log(`[USC] Login successful for USC ID ******${uscId.slice(-4)}`);
  
  res.json({
    sessionToken,
    userId: user.user_id,
    accountType: user.account_type,
    expiresAt: user.account_expires_at,
  });
});

export default router;

