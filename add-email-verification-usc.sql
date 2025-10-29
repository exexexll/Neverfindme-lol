-- ===== USC EMAIL VERIFICATION FOR PERMANENT ACCOUNTS =====
-- When USC card users upgrade to permanent, verify their @usc.edu email
-- This ensures they actually own the USC email they're using

-- NOTE: Email verification tables already exist from previous migration
-- This just adds a note about using them for USC permanent accounts

-- Email verification process for USC card users:
-- 1. User enters @usc.edu email on permanent account step
-- 2. Backend validates email ends with @usc.edu
-- 3. Send verification code to email
-- 4. User enters code
-- 5. Backend verifies code matches
-- 6. Link email to account (call /auth/link)
-- 7. Call /usc/finalize-registration to save USC card

-- Tables already exist:
-- - users.pending_email (for email before verification)
-- - users.verification_code (6-digit code)
-- - users.verification_code_expires_at (expiry timestamp)
-- - users.verification_attempts (rate limiting)

COMMENT ON COLUMN users.pending_email IS 'Temporary email storage before verification (includes USC emails for card users)';
COMMENT ON COLUMN users.verification_code IS 'Email verification code (6 digits, for both regular and USC email verification)';

-- Add index for email verification queries
CREATE INDEX IF NOT EXISTS idx_users_pending_email ON users(pending_email) WHERE pending_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_verification_code ON users(verification_code, verification_code_expires_at) 
  WHERE verification_code IS NOT NULL;

