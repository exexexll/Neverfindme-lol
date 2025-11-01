import express from 'express';
import Stripe from 'stripe';
import crypto from 'crypto';
import { store } from './store';
import { InviteCode } from './types';
import { requireAdmin } from './admin-auth';
import { query } from './database';

const router = express.Router();

// Initialize Stripe (use test key for development)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2025-09-30.clover',
});

const PRICE_AMOUNT = 50; // $0.50 in cents (Stripe minimum for checkout)

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

// Admin middleware imported from admin-auth.ts (line 6)

/**
 * POST /payment/create-checkout
 * DISABLED: Payment processing via Stripe is no longer available
 * App is now invite-only (USC cards + invite codes)
 */
router.post('/create-checkout', requireAuth, async (req: any, res) => {
  return res.status(410).json({ 
    error: 'Payment processing is no longer available',
    message: 'BUMPIN is currently invite-only. Get an invite code from a friend or join our waitlist.',
    waitlistUrl: '/waitlist',
    inviteOnly: true
  });
});

/**
 * POST /payment/webhook
 * DISABLED: Stripe webhook no longer active
 * App is now invite-only
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: any, res) => {
  console.log('[Payment] Webhook called but Stripe is disabled - returning 410');
  return res.status(410).send('Stripe webhook disabled - app is invite-only');
  
  // KEEPING OLD CODE BELOW FOR REFERENCE (commented out)
  /*
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Payment] STRIPE_WEBHOOK_SECRET not configured!');
    return res.status(500).send('Webhook secret not configured');
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature (CRITICAL SECURITY)
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('[Payment] ⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // CRITICAL: Wrap entire processing in try-catch
  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;

        if (!userId) {
          console.error('[Payment] No userId in webhook payload');
          return res.status(400).send('No userId in payload');
        }

        console.log(`[Payment] ✅ Payment successful for user ${userId.substring(0, 8)}`);

        // CRITICAL: Get user and ensure they exist in PostgreSQL FIRST
        const user = await store.getUser(userId);
        
        if (!user) {
          console.error('[Payment] ❌ User not found after payment:', userId);
          return res.status(500).send('User not found');
        }

        // CRITICAL FIX: Ensure user exists in PostgreSQL before creating invite code
        // This prevents foreign key constraint errors
        if (process.env.DATABASE_URL) {
          try {
            const { query } = await import('./database');
            // Force user creation in database if not already there
            await query(
              `INSERT INTO users (user_id, name, gender, account_type, paid_status, paid_at, payment_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
               ON CONFLICT (user_id) DO UPDATE SET
                 paid_status = EXCLUDED.paid_status,
                 paid_at = EXCLUDED.paid_at,
                 payment_id = EXCLUDED.payment_id`,
              [userId, user.name, user.gender, user.accountType, 'paid', new Date(), session.payment_intent as string]
            );
            console.log('[Payment] ✅ User ensured in PostgreSQL');
          } catch (error) {
            console.error('[Payment] Failed to ensure user in database:', error);
          }
        }

        // Mark user as paid (await for database)
        await store.updateUser(userId, {
          paidStatus: 'paid',
          paidAt: Date.now(),
          paymentId: session.payment_intent as string,
          qrUnlocked: true, // PAID users get code UNLOCKED immediately (not grace period)
          successfulSessions: 0,
        });

        // Generate user's invite code (4 uses)
        const inviteCode = await generateSecureCode();
        console.log(`[Payment] Generated code: ${inviteCode}`);

        const code: InviteCode = {
          code: inviteCode,
          createdBy: userId,
          createdByName: user.name,
          createdAt: Date.now(),
          type: 'user',
          maxUses: 4,
          usesRemaining: 4,
          usedBy: [],
          isActive: true,
        };

        // Create invite code (now user exists in DB, no foreign key error!)
        await store.createInviteCode(code);
        console.log(`[Payment] ✅ Code created in store and database`);
        
        // Store code on user profile (await for database)
        await store.updateUser(userId, {
          myInviteCode: inviteCode,
          inviteCodeUsesRemaining: 4,
          qrUnlocked: true, // Ensure it's unlocked for paid users
          qrUnlockedAt: Date.now(),
        });

        console.log(`[Payment] ✅ Complete! Generated invite code ${inviteCode} for ${user.name} (4 uses)`);
        break;

      default:
        console.log(`[Payment] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('[Payment] ❌ CRITICAL ERROR processing webhook:', error);
    console.error('[Payment] Error details:', error.message);
    console.error('[Payment] Stack trace:', error.stack);
    res.status(500).send('Webhook processing failed');
  }
  */
});

/**
 * POST /payment/apply-code
 * Apply an invite code to current user (for users on paywall)
 */
router.post('/apply-code', requireAuth, async (req: any, res) => {
  const { inviteCode, email } = req.body; // Email required for admin codes
  
  if (!inviteCode) {
    return res.status(400).json({ error: 'Invite code is required' });
  }

  const user = await store.getUser(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if already verified
  if (user.paidStatus === 'paid' || user.paidStatus === 'qr_verified' || user.paidStatus === 'qr_grace_period') {
    return res.status(400).json({ error: 'You already have access' });
  }

  // Get code details to check type
  const codeDetails = await store.getInviteCode(inviteCode);
  if (!codeDetails) {
    return res.status(404).json({ error: 'Invalid invite code' });
  }

  // ADMIN CODE RESTRICTION: Require USC.edu email
  if (codeDetails.type === 'admin') {
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email required for permanent codes' });
    }
    
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Require @usc.edu domain
    if (!email.toLowerCase().endsWith('@usc.edu')) {
      return res.status(403).json({ 
        error: 'Permanent codes are only valid for @usc.edu email addresses',
        requiresUSCEmail: true
      });
    }
    
    console.log(`[Payment] Admin code used with USC email: ${email}`);
    
    // Store USC email on user profile
    await store.updateUser(req.userId, { email: email.toLowerCase() });
  }

  // Use the code (pass email for admin code validation)
  const result = await store.useInviteCode(inviteCode, req.userId, user.name, email);
  
  if (!result.success) {
    return res.status(403).json({ 
      error: result.error,
      requiresUSCEmail: result.error?.includes('@usc.edu'), // Tell frontend USC email needed
    });
  }

  // Generate NEW code for this user (viral growth: every verified user gets 4 invites)
  const newUserCode = await generateSecureCode();
  console.log(`[Payment] Generated new 4-use code for ${user.name}: ${newUserCode}`);
  
  const newInviteCode: InviteCode = {
    code: newUserCode,
    createdBy: req.userId,
    createdByName: user.name,
    createdAt: Date.now(),
    type: 'user',
    maxUses: 4,
    usesRemaining: 4,
    usedBy: [],
    isActive: true,
  };
  
  await store.createInviteCode(newInviteCode);

  // Mark user in grace period (need 4 sessions to unlock THEIR OWN QR)
  await store.updateUser(req.userId, {
    paidStatus: 'qr_grace_period',
    inviteCodeUsed: inviteCode,
    myInviteCode: newUserCode, // Their own code (locked until 4 sessions)
    inviteCodeUsesRemaining: 4,
    qrUnlocked: false, // Starts locked
    successfulSessions: 0,
  });

  console.log(`[Payment] User ${user.name} entered grace period via code: ${inviteCode}`);
  console.log(`[Payment] User will unlock their code (${newUserCode}) after 4 sessions`);

  res.json({ 
    success: true, 
    paidStatus: 'qr_grace_period',
    myInviteCode: newUserCode, // Return their code
    qrUnlocked: false,
    sessionsNeeded: 4,
  });
});

/**
 * POST /payment/validate-code
 * Validate an invite code (with rate limiting)
 * CRITICAL: Rate limit to prevent brute force
 */
router.post('/validate-code', async (req: any, res) => {
  const { code } = req.body;
  const ip = (req as any).userIp || req.ip || 'unknown';

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  // SECURITY: Rate limiting (5 attempts per hour per IP)
  const rateLimit = store.checkRateLimit(ip);
  if (!rateLimit.allowed) {
    const minutesRemaining = Math.ceil((rateLimit.retryAfter || 0) / 1000 / 60);
    console.warn(`[Security] 🚫 Rate limit exceeded for IP ${ip}`);
    return res.status(429).json({ 
      error: 'Too many attempts',
      message: `Please wait ${minutesRemaining} minutes before trying again`,
      retryAfter: rateLimit.retryAfter,
    });
  }

  // Validate code format (security: prevent injection)
  const sanitizedCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(sanitizedCode)) {
    console.warn(`[Security] Invalid code format attempt from IP ${ip}: ${code}`);
    return res.status(400).json({ 
      error: 'Invalid code format',
      attemptsRemaining: rateLimit.remainingAttempts,
    });
  }

  const inviteCode = await store.getInviteCode(sanitizedCode);

  if (!inviteCode) {
    console.warn(`[Security] Code not found from IP ${ip}: ${sanitizedCode}`);
    return res.status(404).json({ 
      error: 'Invalid invite code',
      attemptsRemaining: rateLimit.remainingAttempts,
    });
  }

  if (!inviteCode.isActive) {
    return res.status(403).json({ 
      error: 'This invite code has been deactivated',
      attemptsRemaining: rateLimit.remainingAttempts,
    });
  }

  if (inviteCode.type === 'user' && inviteCode.usesRemaining <= 0) {
    return res.status(403).json({ 
      error: 'This invite code has been fully used',
      attemptsRemaining: rateLimit.remainingAttempts,
    });
  }

  // Code is valid!
  res.json({ 
    valid: true, 
    type: inviteCode.type,
    usesRemaining: inviteCode.type === 'admin' ? -1 : inviteCode.usesRemaining,
    createdBy: inviteCode.createdByName,
  });
});

/**
 * GET /payment/status
 * Check if user has paid or used valid code
 * CRITICAL: Always fetches fresh from database to avoid cache issues after webhook
 */
router.get('/status', requireAuth, async (req: any, res) => {
  // CRITICAL FIX: Query database directly, bypass cache
  // This ensures we get fresh data immediately after webhook updates
  let user: any = null;
  
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import('./database');
      const result = await query('SELECT * FROM users WHERE user_id = $1', [req.userId]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        // Convert database row to user object
        user = {
          userId: row.user_id,
          name: row.name,
          paidStatus: row.paid_status,
          paidAt: row.paid_at ? new Date(row.paid_at).getTime() : undefined,
          myInviteCode: row.my_invite_code,
          inviteCodeUsesRemaining: row.invite_code_uses_remaining,
          inviteCodeUsed: row.invite_code_used,
          qrUnlocked: row.qr_unlocked || false,
          successfulSessions: row.successful_sessions || 0,
          qrUnlockedAt: row.qr_unlocked_at ? new Date(row.qr_unlocked_at).getTime() : undefined,
          accountType: row.account_type, // CRITICAL: Include for guest upgrade button
          accountExpiresAt: row.account_expires_at ? new Date(row.account_expires_at).getTime() : undefined, // CRITICAL: Include for guest upgrade
          uscId: row.usc_id, // CRITICAL: Include for USC email enforcement in settings
          pending_email: row.pending_email, // CRITICAL: For email verification check
          email_verified: row.email_verified, // CRITICAL: For email verification status
        };
      }
    } catch (error) {
      console.error('[Payment] Direct DB query failed, falling back to store:', error);
      user = await store.getUser(req.userId);
    }
  } else {
    // No database, use store
    user = await store.getUser(req.userId);
  }
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // If user has their own code, get detailed info
  let myCodeInfo = null;
  if (user.myInviteCode) {
    const codeData = await store.getInviteCode(user.myInviteCode);
    if (codeData) {
      myCodeInfo = {
        code: codeData.code,
        usesRemaining: codeData.usesRemaining,
        maxUses: codeData.maxUses,
        totalUsed: codeData.usedBy.length,
        type: codeData.type,
      };
    }
  }

  res.json({
    paidStatus: user.paidStatus || 'unpaid',
    paidAt: user.paidAt,
    myInviteCode: user.myInviteCode,
    // CRITICAL FIX: Use nullish coalescing (??) not OR (||)
    // 0 || 4 = 4 (WRONG! 0 is falsy)
    // 0 ?? 4 = 0 (CORRECT! Only null/undefined fallback)
    inviteCodeUsesRemaining: myCodeInfo?.usesRemaining ?? user.inviteCodeUsesRemaining ?? 0,
    myCodeInfo, // Full code details
    inviteCodeUsed: user.inviteCodeUsed, // Which code they used to sign up
    qrUnlocked: user.qrUnlocked || false,
    successfulSessions: user.successfulSessions || 0,
    qrUnlockedAt: user.qrUnlockedAt,
    accountType: user.accountType, // CRITICAL: Don't default to 'permanent' - breaks guest upgrade UI
    accountExpiresAt: user.accountExpiresAt, // For guest account expiry check
    uscId: user.uscId, // CRITICAL: Include for USC email validation in settings
    pendingEmail: user.pending_email, // CRITICAL: For email verification status
    emailVerified: user.email_verified, // CRITICAL: Check if email is verified
  });
});

/**
 * POST /payment/admin/generate-code
 * Admin: Generate a permanent invite code
 */
router.post('/admin/generate-code', requireAdmin, async (req: any, res) => {
  try {
    const { label } = req.body;
    
    // Admin username is set by requireAdmin middleware in req.adminUser
    const adminUsername = req.adminUser;
    console.log('[Admin] Generating code, admin username:', adminUsername);
    
    const code = await generateSecureCode();
    console.log('[Admin] Code generated successfully:', code);
    
    // FIXED: Use 'admin' as createdBy for admin codes (matches schema)
    // The foreign key constraint is optional in database schema
    const inviteCode: InviteCode = {
      code,
      createdBy: 'admin', // Special identifier for admin-created codes
      createdByName: label || `campus`,
      createdAt: Date.now(),
      type: 'admin',
      maxUses: -1, // Unlimited
      usesRemaining: -1,
      usedBy: [],
      isActive: true,
    };

    await store.createInviteCode(inviteCode);

    console.log(`[Admin] ✅ Permanent code created: ${code} by ${adminUsername}`);

    res.json({
      code,
      qrCodeUrl: `/payment/qr/${code}`,
    });
  } catch (error: any) {
    console.error('[Admin] ❌ FATAL ERROR in generate-code:', error);
    console.error('[Admin] Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Failed to generate code',
      message: error.message,
      details: error.toString(),
    });
  }
});

/**
 * GET /payment/admin/codes
 * Admin: List all invite codes (from PostgreSQL)
 */
router.get('/admin/codes', requireAdmin, async (req: any, res) => {
  try {
    // CRITICAL FIX: Load from PostgreSQL, not memory (memory is lost on restart)
    const result = await query(
      'SELECT * FROM invite_codes ORDER BY created_at DESC'
    );
    
    const allCodes = result.rows.map((row: any) => ({
      code: row.code,
      type: row.type,
      createdBy: row.created_by_name,
      createdAt: new Date(row.created_at).getTime(),
      maxUses: row.max_uses,
      usesRemaining: row.uses_remaining,
      totalUsed: typeof row.used_by === 'string' ? JSON.parse(row.used_by).length : (row.used_by?.length || 0),
      isActive: row.is_active,
    }));

    res.json({
      codes: allCodes,
      total: allCodes.length,
    });
  } catch (error) {
    console.error('[Admin] Failed to load codes from database:', error);
    // Fallback to memory
  const allCodes = Array.from(store['inviteCodes'].values())
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    codes: allCodes.map(code => ({
      code: code.code,
      type: code.type,
      createdBy: code.createdByName,
      createdAt: code.createdAt,
      maxUses: code.maxUses,
      usesRemaining: code.usesRemaining,
      totalUsed: code.usedBy.length,
      isActive: code.isActive,
    })),
    total: allCodes.length,
  });
  }
});

/**
 * POST /payment/admin/deactivate-code
 * Admin: Deactivate a code
 */
router.post('/admin/deactivate-code', requireAdmin, async (req: any, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }

  const success = store.deactivateInviteCode(code);
  
  if (!success) {
    return res.status(404).json({ error: 'Code not found' });
  }

  res.json({ success: true, message: 'Code deactivated' });
});

/**
 * GET /payment/qr/:code
 * Generate QR code image for a given invite code
 * PUBLIC endpoint (no auth required)
 */
router.get('/qr/:code', async (req: any, res) => {
  const { code } = req.params;

  // Validate code exists
  const inviteCode = await store.getInviteCode(code);
  if (!inviteCode) {
    console.error(`[QR] Code not found: ${code}`);
    return res.status(404).send('Code not found');
  }

  try {
    // Import QRCode dynamically
    const QRCode = await import('qrcode');
    
    // Generate QR code containing the signup URL with code
    // Priority: FRONTEND_URL (env) > bumpin.com (production default) > derived from request (dev)
    const frontendUrl = process.env.FRONTEND_URL || 
                        (process.env.NODE_ENV === 'production' ? 'https://bumpin.com' : null) ||
                        (req.headers.origin || `${req.protocol}://${req.get('host')}`).replace(':3001', ':3000');
    const signupUrl = `${frontendUrl}/onboarding?inviteCode=${code}`;
    console.log(`[QR] Generating QR for URL: ${signupUrl}`);
    
    const qrCodeBuffer = await QRCode.toBuffer(signupUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      type: 'png',
    });

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': qrCodeBuffer.length,
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    });
    res.end(qrCodeBuffer);
    console.log(`[QR] ✅ Successfully generated QR for code: ${code}`);
  } catch (error: any) {
    console.error('[QR] Failed to generate QR code:', error);
    res.status(500).send('Failed to generate QR code');
  }
});

/**
 * Helper: Generate cryptographically secure invite code
 * Format: 16 uppercase alphanumeric characters
 */
async function generateSecureCode(): Promise<string> {
  try {
    // Use Node.js crypto module for cryptographic randomness (AWS-compatible, zero dependencies)
    // Generate 24 random bytes, convert to base64url (alphanumeric + safe chars), take first 16
    const code = crypto.randomBytes(24)
      .toString('base64url')
      .replace(/[^A-Z0-9]/gi, '') // Remove any non-alphanumeric
      .substring(0, 16)
      .toUpperCase();
    
    // Verify uniqueness (collision check)
    const existing = await store.getInviteCode(code);
    if (existing) {
      console.warn('[Security] Code collision detected, regenerating...');
      return await generateSecureCode(); // Recursive retry
    }
    
    console.log('[CodeGen] Generated code:', code);
    return code;
  } catch (error) {
    console.error('[CodeGen] Error generating code:', error);
    throw error;
  }
}

export default router;

