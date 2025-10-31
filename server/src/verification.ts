import express from 'express';
import { store } from './store';
import { sendVerificationEmail } from './email';

const router = express.Router();

async function requireAuth(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authorization required' });
  
  const session = await store.getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  
  req.userId = session.userId;
  next();
}

router.post('/send', requireAuth, async (req: any, res) => {
  const { email } = req.body;
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  
  // CRITICAL: Check if email already exists in system
  const existingUser = await store.getUserByEmail(email.toLowerCase());
  if (existingUser && existingUser.userId !== req.userId) {
    return res.status(409).json({ 
      error: 'This email is already registered to another account',
      hint: 'Try logging in or use a different email.'
    });
  }
  
  const user = await store.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  // Reset attempts if last code expired over 1 hour ago
  const shouldReset = user.verification_code_expires_at && 
                     (Date.now() - user.verification_code_expires_at) > 3600000;
  
  const currentAttempts = shouldReset ? 0 : (user.verification_attempts || 0);
  
  if (currentAttempts >= 3) {
    return res.status(429).json({ error: 'Too many attempts. Wait 1 hour.' });
  }
  
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes
  
  // CRITICAL: Store email temporarily in pending_email (not in email field)
  // Email will only be saved to email field AFTER successful verification
  await store.updateUser(req.userId, {
    pending_email: email.toLowerCase(), // Store temporarily for verification
    verification_code: code,
    verification_code_expires_at: expiresAt,
    verification_attempts: currentAttempts + 1,
  });
  
  const sent = await sendVerificationEmail(email, code, user.name);
  if (!sent) {
    console.error(`[Verification] ❌ Email send failed for ${email} - check SENDGRID_API_KEY`);
    return res.status(500).json({ 
      error: 'Failed to send verification email',
      hint: 'SendGrid may not be configured. Contact support.',
      sendgridConfigured: !!process.env.SENDGRID_API_KEY
    });
  }
  
  console.log(`[Verification] ✅ Code sent to ${email} for user ${user.userId.substring(0, 8)} (not saved until verified)`);
  
  res.json({ success: true, expiresAt, email }); // Return email so frontend can display it
});

router.post('/verify', requireAuth, async (req: any, res) => {
  const { code } = req.body; // Only code needed - email stored in pending_email
  
  const user = await store.getUser(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  if (user.verification_code !== code) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  
  if (!user.verification_code_expires_at || Date.now() > user.verification_code_expires_at) {
    return res.status(400).json({ error: 'Code expired' });
  }
  
  // Get email from pending_email (stored when code was sent)
  const email = user.pending_email;
  if (!email) {
    return res.status(400).json({ error: 'No pending email verification found' });
  }
  
  // CRITICAL: Double-check email not already taken (race condition protection)
  const existingUser = await store.getUserByEmail(email.toLowerCase());
  if (existingUser && existingUser.userId !== req.userId) {
    return res.status(409).json({ 
      error: 'This email was just registered by another account'
    });
  }
  
  // Check if this is an admin code user (USC student)
  const isAdminCodeUser = user.inviteCodeUsed && user.paidStatus === 'qr_grace_period';
  
  // CRITICAL: NOW save email to user (only after successful verification)
  await store.updateUser(req.userId, {
    email: email.toLowerCase(), // Move from pending_email to email
    email_verified: true,
    accountType: 'permanent', // CRITICAL: Upgrade from guest to permanent
    accountExpiresAt: null, // CRITICAL: Remove expiry for permanent accounts
    // SECURITY: Admin code users upgrade to 'paid' after email verification
    paidStatus: isAdminCodeUser ? 'paid' : user.paidStatus,
    verification_code: null,
    verification_code_expires_at: null,
    verification_attempts: 0,
    pending_email: null, // Clear temporary storage
  });
  
  console.log(`[Verification] ✅ Email verified & saved: ${email} - upgraded user ${user.userId.substring(0, 8)} to permanent`);
  
  res.json({ success: true, accountType: 'permanent', email: email.toLowerCase() });
});

export default router;

