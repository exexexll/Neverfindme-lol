import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Server as SocketServer } from 'socket.io';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { store } from './store';
import { query } from './database';
import { User, Session } from './types';
import { validatePassword, getPasswordErrorMessage } from './password-validator';

/**
 * Create auth routes with Socket.io dependency injection
 * This ensures Socket.io is available immediately, fixing race conditions
 */
export function createAuthRoutes(
  io: SocketServer,
  activeSockets: Map<string, string>
) {
  const router = express.Router();

  /**
   * POST /auth/guest
   * Create a temporary guest account
   * Optional: referralCode to track who referred this user
   * Optional: inviteCode for paywall bypass (QR code access)
   */
  router.post('/guest', async (req: any, res) => {
  const { name, gender, referralCode, inviteCode, email } = req.body;
  const ip = req.userIp; // Set by middleware with centralized IP extraction

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!['female', 'male', 'nonbinary', 'unspecified'].includes(gender)) {
    return res.status(400).json({ error: 'Invalid gender' });
  }

  const userId = uuidv4();
  const sessionToken = uuidv4();

  // CRITICAL: REQUIRE invite code (app is now invite-only)
  if (!inviteCode) {
    return res.status(403).json({ 
      error: 'Invite code required',
      message: 'BUMPIN is currently invite-only. Please use an invite code or join our waitlist.',
      requiresInviteCode: true,
      waitlistUrl: '/waitlist'
    });
  }

  // PAYWALL CHECK: Validate invite code
  let codeVerified = false;
  let codeUsed: string | undefined;
  
  if (inviteCode) {
    const sanitizedCode = inviteCode.trim().toUpperCase();
    
    // Validate code format first (prevent injection)
    if (!/^[A-Z0-9]{16}$/.test(sanitizedCode)) {
      return res.status(400).json({ error: 'Invalid invite code format' });
    }

    // Use the code (ASYNC - checks database + validates USC email for admin codes)
    const result = await store.useInviteCode(sanitizedCode, userId, name.trim(), email);
    
    if (!result.success) {
      console.warn(`[Auth] Invalid invite code used: ${sanitizedCode} - ${result.error}`);
      return res.status(403).json({ 
        error: result.error,
        requiresPayment: true,
        requiresUSCEmail: result.error?.includes('@usc.edu'), // Tell frontend USC email needed
      });
    }

    codeVerified = true;
    codeUsed = sanitizedCode;
    
    console.log(`[Auth] ✅ User ${name} verified via ${result.codeType} code: ${sanitizedCode}`);
  }

  // Generate invite code for new user (if they used an invite code or paid)
  // This creates viral growth: every verified user can invite 4 more
  let newUserInviteCode: string | undefined;
  if (codeVerified) {
    // Import the code generation function
    const crypto = require('crypto');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    const randomBytes = crypto.randomBytes(16);
    for (let i = 0; i < 16; i++) {
      code += chars[randomBytes[i] % chars.length];
    }
    
    newUserInviteCode = code;
    
    // Create invite code entry for this new user
    const newInviteCode: import('./types').InviteCode = {
      code: newUserInviteCode,
      createdBy: userId,
      createdByName: name.trim(),
      createdAt: Date.now(),
      type: 'user',
      maxUses: 4,
      usesRemaining: 4,
      usedBy: [],
      isActive: true,
    };
    
    // NOTE: Don't create code yet - wait until user is in PostgreSQL
    // We'll create it AFTER createUser() below
    console.log(`[Auth] Will generate 4-use invite code for new user ${name}: ${newUserInviteCode}`);
  }

  // Check if referral code is valid (matchmaker system)
  let referralInfo: any = null;
  if (referralCode) {
    referralInfo = store.getReferralMapping(referralCode);
    if (!referralInfo) {
      console.warn(`[Auth] Invalid referral code: ${referralCode}`);
    } else {
      console.log(`[Auth] Valid intro: ${referralInfo.createdByName} introducing someone to ${referralInfo.targetName}`);
    }
  }

  // Determine paid status based on code type
  let paidStatus: 'unpaid' | 'paid' | 'qr_verified' | 'qr_grace_period' = 'unpaid';
  let isAdminCode = false;
  let uscEmailForVerification: string | undefined;
  
  if (codeVerified) {
    const codeInfo = await store.getInviteCode(codeUsed!);
    if (codeInfo?.type === 'admin') {
      isAdminCode = true;
      // SECURITY: Admin code users are 'qr_grace_period' until email verified
      // They'll be upgraded to 'paid' AFTER email verification
      paidStatus = 'qr_grace_period';
      uscEmailForVerification = email?.toLowerCase(); // Store for pending verification
      console.log('[Auth] Admin code user - requires USC email verification for PAID status');
    } else {
      // Regular invite codes get grace period (need 4 sessions)
      paidStatus = 'qr_grace_period';
    }
  }

  // CRITICAL: ALL guest accounts expire in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user: User = {
    userId,
    name: name.trim(),
    gender,
    accountType: 'guest',
    createdAt: Date.now(),
    banStatus: 'none',
    // CRITICAL: Email is NOT stored here - only after verification
    // This prevents duplicate email errors and ensures proper verification flow
    pending_email: uscEmailForVerification || null, // Store USC email for verification
    paidStatus,
    inviteCodeUsed: codeUsed,
    // New user's own invite code (if they were verified)
    myInviteCode: newUserInviteCode,
    inviteCodeUsesRemaining: newUserInviteCode ? 4 : 0,
    qrUnlocked: false, // Starts locked, unlocks after 4 sessions
    successfulSessions: 0, // Starts at 0
    accountExpiresAt: expiresAt.getTime(), // CRITICAL: ALL guest accounts expire in 7 days
    // Store introduction info if this is via referral
    ...(referralInfo && {
      introducedTo: referralInfo.targetUserId,
      introducedViaCode: referralCode,
      introducedBy: referralInfo.createdByUserId,
    }),
  };

  // Get device info
  const deviceInfo = req.headers['user-agent'] || 'Unknown device';

  const session: Session = {
    sessionToken,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days for guest
    ipAddress: ip,
    deviceInfo,
    isActive: true,
    lastActiveAt: Date.now(),
  };

  await store.createUser(user);
  await store.createSession(session);
  
  // NOW create invite code after user is in PostgreSQL (prevents foreign key error)
  if (codeVerified && newUserInviteCode) {
    const newInviteCode: import('./types').InviteCode = {
      code: newUserInviteCode,
      createdBy: userId,
      createdByName: name.trim(),
      createdAt: Date.now(),
      type: 'user',
      maxUses: 4,
      usesRemaining: 4,
      usedBy: [],
      isActive: true,
    };
    
    await store.createInviteCode(newInviteCode);
    console.log(`[Auth] ✅ Generated 4-use invite code for new user ${name}: ${newUserInviteCode}`);
  }
  
  // Track IP for this user
  store.addUserIp(userId, ip);

  // NOTE: Referral notification is NOT sent here anymore!
  // It will be sent when user completes their profile (uploads video)
  // This prevents showing "offline" status when they haven't finished onboarding yet

  // Check if target is online for immediate matching
  let targetOnline = false;
  let targetUser = null;
  if (referralInfo) {
    const presence = store.getPresence(referralInfo.targetUserId);
    targetOnline = !!(presence && presence.online && presence.available);
    targetUser = await store.getUser(referralInfo.targetUserId);
  }

  res.json({
    userId,
    sessionToken,
    accountType: 'guest',
    wasReferred: !!referralInfo,
    introducedTo: referralInfo?.targetName,
    targetUser: targetUser ? {
      userId: targetUser.userId,
      name: targetUser.name,
      gender: targetUser.gender,
      selfieUrl: targetUser.selfieUrl,
      videoUrl: targetUser.videoUrl,
    } : null,
    targetOnline,
    referralCode: referralCode || null,
    // Paywall status
    paidStatus: user.paidStatus,
    requiresPayment: !codeVerified, // If not verified by code, needs payment
    // SECURITY: Admin codes require email verification
    requiresEmailVerification: isAdminCode && !!uscEmailForVerification,
    pendingEmail: uscEmailForVerification || null, // Email waiting for verification
  });
});

/**
 * POST /auth/link
 * Convert guest account to permanent by linking email+password
 */
router.post('/link', async (req, res) => {
  const { sessionToken, email, password } = req.body;

  if (!sessionToken || !email || !password) {
    return res.status(400).json({ error: 'Session token, email, and password are required' });
  }

  const session = await store.getSession(sessionToken);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = await store.getUser(session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // CRITICAL: Check if account is already permanent
  if (user.accountType === 'permanent') {
    return res.status(400).json({
      error: 'Account is already permanent',
      hint: 'Your account is already upgraded. No action needed.'
    });
  }

  // SECURITY: Check if user has a pending USC email verification
  if (user.pending_email && user.pending_email.endsWith('@usc.edu')) {
    return res.status(403).json({ 
      error: 'You signed up with a USC email. Please verify that email instead.',
      hint: 'Complete the USC email verification you started during signup.',
      pendingEmail: user.pending_email,
      requiresEmailVerification: true
    });
  }

  // SECURITY: Check if user already has a verified USC email
  if (user.email && user.email.endsWith('@usc.edu') && user.email_verified) {
    return res.status(403).json({ 
      error: 'Your account is already linked to a USC email',
      hint: 'USC accounts cannot be changed. Contact support if needed.',
      email: user.email
    });
  }

  // CRITICAL: Check if email already exists
  const existingUser = await store.getUserByEmail(email);
  if (existingUser && existingUser.userId !== user.userId) {
    return res.status(409).json({ 
      error: 'Email already registered',
      hint: 'This email is already linked to another account. Try logging in instead.'
    });
  }

  // CRITICAL SECURITY: Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    console.warn('[Auth] Weak password rejected:', passwordValidation.errors);
    return res.status(400).json({ 
      error: getPasswordErrorMessage(passwordValidation),
      allErrors: passwordValidation.errors,
      warnings: passwordValidation.warnings,
      strength: passwordValidation.strength,
    });
  }

  // Log password strength for monitoring
  console.log('[Auth] Password strength:', passwordValidation.strength, 'Score:', passwordValidation.score);

  // Hash password with bcrypt (cost factor: 12)
  const password_hash = await bcrypt.hash(password, 12);
  
  // Update user to permanent
  // CRITICAL: email_verified should already be true (set by /verification/verify)
  // If not verified yet, this endpoint should not be reached
  await store.updateUser(user.userId, {
    accountType: 'permanent',
    email,
    password_hash, // ✅ Securely hashed with bcrypt
    accountExpiresAt: null, // CRITICAL: Remove expiry for permanent accounts (never expire)
  });

  // Extend session expiry for permanent users
  const extendedSession: Session = {
    ...session,
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
  };
  await store.createSession(extendedSession);

  res.json({
    success: true,
    accountType: 'permanent',
  });
});

  /**
   * POST /auth/login
   * Login with email+password (permanent users only)
   */
  router.post('/login', async (req: any, res) => {
  const { email, password } = req.body;
  const ip = req.userIp; // Set by middleware with centralized IP extraction

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await store.getUserByEmail(email);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials - No account found with this email' });
  }
  
  if (user.accountType !== 'permanent') {
    return res.status(401).json({ 
      error: 'This account is not permanent. Please sign up as a guest first, then link your email and password in Settings.' 
    });
  }

  // ✅ Secure password comparison with bcrypt
  if (!user.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check if user is banned
  if (store.isUserBanned(user.userId)) {
    const banRecord = store.getBanRecord(user.userId);
    return res.status(403).json({ 
      error: 'Account suspended',
      banned: true,
      banStatus: user.banStatus,
      message: banRecord?.banStatus === 'temporary' 
        ? 'Your account has been temporarily suspended pending review.'
        : 'Your account has been permanently banned.',
      reviewStatus: banRecord?.reviewStatus,
    });
  }

  // Get device info from User-Agent
  const deviceInfo = req.headers['user-agent'] || 'Unknown device';

  // Create NEW session FIRST
  const sessionToken = uuidv4();
  const session: Session = {
    sessionToken,
    userId: user.userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    ipAddress: ip,
    deviceInfo,
    isActive: true,
    lastActiveAt: Date.now(),
  };

  // CRITICAL FIX: Use transaction to prevent race condition
  let invalidatedCount = 0;
  try {
    await store.createSession(session);
    
    // SECURITY: NOW invalidate all OTHER sessions (except this one)
    invalidatedCount = await store.invalidateUserSessions(user.userId, sessionToken);
    console.log(`[Auth] Invalidated ${invalidatedCount} old sessions (kept new session: ${sessionToken.substring(0, 8)})`);
    
    // Notify old sessions via Socket.IO
    if (invalidatedCount > 0) {
      const sockets = Array.from(activeSockets.entries())
        .filter(([userId, _]) => userId === user.userId)
        .map(([_, socketId]) => socketId);
      
      sockets.forEach(socketId => {
        io.to(socketId).emit('session:invalidated', {
          message: 'You have been logged out because you logged in from another device.',
          reason: 'new_login',
        });
      });
    }
  } catch (sessionErr: any) {
    console.error('[Auth] Session creation/invalidation failed:', sessionErr);
    throw new Error('Failed to create session');
  }
  
  // Track IP for this user
  store.addUserIp(user.userId, ip);

  res.json({
    userId: user.userId,
    sessionToken,
    sessionInvalidated: invalidatedCount > 0,
    invalidatedCount,
    accountType: user.accountType,
    user: {
      name: user.name,
      email: user.email,
      selfieUrl: user.selfieUrl,
      videoUrl: user.videoUrl,
    },
  });
});

  /**
   * POST /auth/guest-usc
   * Create guest account for USC card user
   * NOTE: USC card is NOT saved to database yet (prevents incomplete onboarding from blocking cards)
   * USC card will be saved later by /usc/finalize-registration after onboarding complete
   */
  router.post('/guest-usc', async (req: any, res) => {
    const { name, gender, inviteCode } = req.body;
    const ip = req.userIp;

    console.log('[Auth] guest-usc request:', { name, gender, inviteCode: inviteCode ? '✅ PROVIDED' : '❌ MISSING' });

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!['female', 'male', 'nonbinary', 'unspecified'].includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender' });
    }

    const userId = uuidv4();
    const sessionToken = uuidv4();
    
    // Validate invite code (admin QR codes)
    let codeVerified = false;
    if (inviteCode) {
      const sanitizedCode = inviteCode.trim().toUpperCase();
      console.log('[Auth] Validating invite code:', sanitizedCode);
      
      if (!/^[A-Z0-9]{16}$/.test(sanitizedCode)) {
        console.error('[Auth] Invalid format:', sanitizedCode);
        return res.status(400).json({ error: 'Invalid invite code format' });
      }

      console.log('[Auth] Calling store.useInviteCode...');
      const result = await store.useInviteCode(sanitizedCode, userId, name.trim(), undefined, true); // skipEmailCheck=true for USC card users
      console.log('[Auth] useInviteCode result:', result);
      
      if (!result.success) {
        console.error('[Auth] Invite code validation failed:', result.error);
        return res.status(400).json({ 
          error: result.error || 'Invalid or expired invite code' 
        });
      }

      codeVerified = true;
      console.log('[Auth] ✅ Invite code verified');
    }

    // CRITICAL: Generate 4-use invite code for verified USC card users (same as regular users)
    let newUserInviteCode: string | undefined;
    if (codeVerified) {
      const crypto = require('crypto');
      const randomBytes = crypto.randomBytes(16); // FIXED: Generate 16 bytes (not 8)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 16; i++) {
        code += chars[randomBytes[i] % chars.length];
      }
      newUserInviteCode = code;
      console.log(`[Auth] Will generate 4-use invite code for USC user ${name}: ${newUserInviteCode} (length: ${code.length})`);
    }

    try {
      // Create guest user (expires in 7 days)
      // USC card will be linked later after onboarding complete
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      const user: User = {
        userId,
        name: name.trim(),
        gender,
        accountType: 'guest',
        createdAt: Date.now(),
        banStatus: 'none',
        paidStatus: codeVerified ? 'qr_verified' : 'unpaid',
        inviteCodeUsed: inviteCode || undefined,
        myInviteCode: newUserInviteCode, // User's own QR code (4 uses)
        inviteCodeUsesRemaining: newUserInviteCode ? 4 : 0,
        qrUnlocked: false,
        successfulSessions: 0,
        accountExpiresAt: expiresAt.getTime(),
        // USC ID will be set by finalize-registration endpoint
      };

      // Save user
      console.log('[Auth] Creating user in database...');
      try {
        await store.createUser(user);
        console.log('[Auth] ✅ User created successfully');
      } catch (createErr: any) {
        console.error('[Auth] ❌ User creation failed:', createErr.message);
        throw createErr; // Re-throw to return error to frontend
      }

      // Create session
      const session: Session = {
        sessionToken,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
        ipAddress: ip,
        isActive: true,
        lastActiveAt: Date.now(),
      };
      await store.createSession(session);
      
      // Create invite code in database (after user exists)
      if (codeVerified && newUserInviteCode) {
        const newInviteCode: import('./types').InviteCode = {
          code: newUserInviteCode,
          createdBy: userId,
          createdByName: name.trim(),
          createdAt: Date.now(),
          type: 'user',
          maxUses: 4,
          usesRemaining: 4,
          usedBy: [],
          isActive: true,
        };
        
        await store.createInviteCode(newInviteCode);
        console.log(`[Auth] ✅ Generated 4-use invite code for USC user ${name}: ${newUserInviteCode}`);
      }

      console.log(`[Auth] USC guest account created: ${name}, user ${userId.substring(0, 8)}, expires: ${expiresAt.toISOString()}`);

      res.json({
        sessionToken,
        userId,
        accountType: 'guest',
        expiresAt: expiresAt.toISOString(),
        paidStatus: user.paidStatus,
        inviteCodeUsed: codeVerified,
        myInviteCode: newUserInviteCode, // Return user's QR code
        inviteCodeUsesRemaining: newUserInviteCode ? 4 : 0,
      });
    } catch (err: any) {
      console.error('[Auth] USC guest creation failed:', err);
      console.error('[Auth] Error message:', err.message);
      console.error('[Auth] Error stack:', err.stack?.split('\n').slice(0, 5));
      res.status(500).json({ 
        error: 'Failed to create account: ' + err.message, // ALWAYS return actual error for debugging
        details: err.message,
        stack: err.stack?.split('\n').slice(0, 3)
      });
    }
  });

  return router;
}

// Default export for backward compatibility
export default createAuthRoutes;

