-- ===== NAPALM SKY DATABASE SCHEMA =====
-- PostgreSQL 15+ Required
-- Created: October 10, 2025
-- For: Production deployment on AWS RDS

-- ===== USERS TABLE =====
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  gender VARCHAR(20) NOT NULL CHECK (gender IN ('female', 'male', 'nonbinary', 'unspecified')),
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('guest', 'permanent')),
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255), -- bcrypt hashed password (cost factor: 12)
  selfie_url TEXT,
  video_url TEXT,
  socials JSONB DEFAULT '{}'::jsonb,
  
  -- Metrics
  timer_total_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  last_sessions JSONB DEFAULT '[]'::jsonb,
  streak_days INTEGER DEFAULT 0,
  
  -- Referral System
  referral_code VARCHAR(50),
  referred_by UUID REFERENCES users(user_id),
  introduced_to UUID REFERENCES users(user_id),
  introduced_via_code VARCHAR(50),
  introduced_by UUID REFERENCES users(user_id),
  
  -- Paywall
  paid_status VARCHAR(20) DEFAULT 'unpaid' CHECK (paid_status IN ('unpaid', 'paid', 'qr_verified', 'qr_grace_period')),
  paid_at TIMESTAMP,
  payment_id VARCHAR(255),
  invite_code_used VARCHAR(20),
  my_invite_code VARCHAR(20),
  invite_code_uses_remaining INTEGER DEFAULT 0,
  qr_unlocked BOOLEAN DEFAULT FALSE, -- QR code unlocked after 4 sessions
  successful_sessions INTEGER DEFAULT 0, -- Count of completed video calls
  qr_unlocked_at TIMESTAMP, -- When QR was unlocked (for analytics)
  
  -- Ban System
  ban_status VARCHAR(20) DEFAULT 'none' CHECK (ban_status IN ('none', 'temporary', 'permanent', 'vindicated')),
  banned_at TIMESTAMP,
  banned_reason TEXT,
  review_status VARCHAR(30),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_paid_status ON users(paid_status);
CREATE INDEX idx_users_ban_status ON users(ban_status);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_my_invite_code ON users(my_invite_code);

-- ===== SESSIONS TABLE =====
CREATE TABLE sessions (
  session_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ip_address INET,
  device_info TEXT, -- Browser/device fingerprint for security
  is_active BOOLEAN DEFAULT TRUE, -- For single-session enforcement
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  last_active_at TIMESTAMP DEFAULT NOW() -- Track last activity
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_is_active ON sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_sessions_user_active ON sessions(user_id, is_active) WHERE is_active = TRUE;

-- Auto-cleanup expired sessions (run daily)
-- DELETE FROM sessions WHERE expires_at < NOW() OR (is_active = FALSE AND last_active_at < NOW() - INTERVAL '7 days');

-- ===== CHAT HISTORY TABLE =====
CREATE TABLE chat_history (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  partner_name VARCHAR(255),
  room_id UUID NOT NULL,
  started_at TIMESTAMP NOT NULL,
  duration INTEGER NOT NULL, -- seconds
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX idx_chat_history_partner_id ON chat_history(partner_id);
CREATE INDEX idx_chat_history_started_at ON chat_history(started_at);

-- ===== SESSION COMPLETIONS TABLE =====
-- Tracks successful video call completions for QR grace period
CREATE TABLE session_completions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  room_id UUID NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  completed_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate entries for same call
  CONSTRAINT unique_session_completion UNIQUE (user_id, room_id)
);

CREATE INDEX idx_completions_user_id ON session_completions(user_id);
CREATE INDEX idx_completions_completed_at ON session_completions(completed_at);

-- Auto-cleanup old completions (keep only last 90 days for analytics, user count persists)
-- DELETE FROM session_completions WHERE completed_at < NOW() - INTERVAL '90 days';

-- ===== COOLDOWNS TABLE =====
CREATE TABLE cooldowns (
  id SERIAL PRIMARY KEY,
  user_id_1 UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure consistent ordering (smaller UUID first)
  CONSTRAINT check_user_order CHECK (user_id_1 < user_id_2),
  CONSTRAINT unique_user_pair UNIQUE (user_id_1, user_id_2)
);

CREATE INDEX idx_cooldowns_expires_at ON cooldowns(expires_at);
CREATE INDEX idx_cooldowns_user_id_1 ON cooldowns(user_id_1);
CREATE INDEX idx_cooldowns_user_id_2 ON cooldowns(user_id_2);

-- Auto-cleanup expired cooldowns (run daily)
-- DELETE FROM cooldowns WHERE expires_at < NOW();

-- ===== INVITE CODES TABLE =====
CREATE TABLE invite_codes (
  code VARCHAR(20) PRIMARY KEY,
  created_by VARCHAR(255) NOT NULL, -- Changed to VARCHAR to allow 'admin' identifier (no FK constraint)
  created_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('user', 'admin')),
  max_uses INTEGER NOT NULL,
  uses_remaining INTEGER NOT NULL,
  used_by JSONB DEFAULT '[]'::jsonb, -- Array of user IDs
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_invite_codes_created_by ON invite_codes(created_by);
CREATE INDEX idx_invite_codes_type ON invite_codes(type);
CREATE INDEX idx_invite_codes_is_active ON invite_codes(is_active);

-- ===== REPORTS TABLE =====
CREATE TABLE reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reported_user_name VARCHAR(255),
  reported_user_selfie TEXT,
  reported_user_video TEXT,
  reporter_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reporter_name VARCHAR(255),
  reporter_ip INET,
  reason TEXT,
  room_id UUID,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reports_reported_user_id ON reports(reported_user_id);
CREATE INDEX idx_reports_reporter_user_id ON reports(reporter_user_id);
CREATE INDEX idx_reports_timestamp ON reports(timestamp);

-- ===== BAN RECORDS TABLE =====
CREATE TABLE ban_records (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  user_name VARCHAR(255),
  user_selfie TEXT,
  user_video TEXT,
  ban_status VARCHAR(20) NOT NULL CHECK (ban_status IN ('none', 'temporary', 'permanent', 'vindicated')),
  banned_at TIMESTAMP NOT NULL,
  banned_reason TEXT NOT NULL,
  report_count INTEGER DEFAULT 0,
  review_status VARCHAR(30),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(user_id),
  ip_addresses JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_ban_records_ban_status ON ban_records(ban_status);
CREATE INDEX idx_ban_records_review_status ON ban_records(review_status);

-- ===== IP BANS TABLE =====
CREATE TABLE ip_bans (
  ip_address INET PRIMARY KEY,
  banned_at TIMESTAMP DEFAULT NOW(),
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  reason TEXT NOT NULL
);

CREATE INDEX idx_ip_bans_user_id ON ip_bans(user_id);

-- ===== REFERRAL NOTIFICATIONS TABLE =====
CREATE TABLE referral_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  for_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  referred_name VARCHAR(255),
  introduced_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  introduced_by_name VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_referral_notifications_for_user_id ON referral_notifications(for_user_id);
CREATE INDEX idx_referral_notifications_read ON referral_notifications(read);
CREATE INDEX idx_referral_notifications_timestamp ON referral_notifications(timestamp);

-- ===== AUDIT LOG TABLE (Security) =====
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ip_address INET,
  details JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- ===== TRIGGERS =====

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON users
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- ===== FUNCTIONS =====

-- Get available users for matchmaking (excluding cooldowns)
CREATE OR REPLACE FUNCTION get_available_users(
  requesting_user_id UUID,
  test_mode BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  user_id UUID,
  name VARCHAR,
  gender VARCHAR,
  selfie_url TEXT,
  video_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.user_id,
    u.name,
    u.gender,
    u.selfie_url,
    u.video_url
  FROM users u
  WHERE 
    u.user_id != requesting_user_id
    AND u.ban_status = 'none'
    AND (u.paid_status = 'paid' OR u.paid_status = 'qr_verified')
    AND (
      test_mode = TRUE
      OR NOT EXISTS (
        SELECT 1 FROM cooldowns c
        WHERE 
          (c.user_id_1 = LEAST(requesting_user_id, u.user_id)
           AND c.user_id_2 = GREATEST(requesting_user_id, u.user_id)
           AND c.expires_at > NOW())
      )
    );
END;
$$ LANGUAGE plpgsql;

-- ===== CLEANUP JOBS (Run via cron or AWS Lambda) =====

-- Clean expired sessions (run daily at 2 AM)
-- DELETE FROM sessions WHERE expires_at < NOW();

-- Clean expired cooldowns (run daily at 3 AM)
-- DELETE FROM cooldowns WHERE expires_at < NOW();

-- Archive old chat history >1 year (run monthly)
-- Copy to S3, then:
-- DELETE FROM chat_history WHERE started_at < NOW() - INTERVAL '365 days';

-- ===== GRANTS (Replace 'napalmsky' with your DB user) =====
-- Note: These grants are conditional - they only run if the role exists and if we're not already that user
DO $$ 
BEGIN
  -- Check if we're running as a different user than napalmsky
  IF CURRENT_USER != 'napalmsky' THEN
    -- Check if napalmsky role exists
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'napalmsky') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO napalmsky;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO napalmsky;
      RAISE NOTICE 'Granted permissions to napalmsky user';
    ELSE
      RAISE NOTICE 'Role napalmsky does not exist, skipping grants (user will inherit permissions as database owner)';
    END IF;
  ELSE
    RAISE NOTICE 'Running as napalmsky user, grants not needed (already owner)';
  END IF;
END $$;

-- ===== VACUUM & ANALYZE (Run weekly for performance) =====
-- VACUUM ANALYZE;

-- ===== SCHEMA COMPLETE =====
-- Run this file with: psql -h your-endpoint -U postgres -d napalmsky_prod -f schema.sql

