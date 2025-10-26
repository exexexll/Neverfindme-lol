-- Add Missing Tables for Long-Term Storage
-- Created: October 24, 2025
-- Purpose: Persist active rooms and referral mappings

-- ===== ACTIVE ROOMS TABLE =====
-- Stores ongoing video/text calls
-- Allows recovery if server restarts during call
CREATE TABLE IF NOT EXISTS active_rooms (
  room_id UUID PRIMARY KEY,
  user_1 UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user_2 UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL,
  chat_mode VARCHAR(10) NOT NULL CHECK (chat_mode IN ('video', 'text')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'grace_period', 'ended')),
  grace_period_expires TIMESTAMP,
  user_1_connected BOOLEAN DEFAULT TRUE,
  user_2_connected BOOLEAN DEFAULT TRUE,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_active_rooms_user_1 ON active_rooms(user_1);
CREATE INDEX idx_active_rooms_user_2 ON active_rooms(user_2);
CREATE INDEX idx_active_rooms_status ON active_rooms(status);
CREATE INDEX idx_active_rooms_started_at ON active_rooms(started_at);

-- Auto-cleanup ended rooms older than 1 hour (run every hour)
-- DELETE FROM active_rooms WHERE status = 'ended' AND updated_at < NOW() - INTERVAL '1 hour';

-- ===== REFERRAL MAPPINGS TABLE =====
-- Stores referral code → target user mappings
-- Ensures intro links work even after server restart
CREATE TABLE IF NOT EXISTS referral_mappings (
  referral_code VARCHAR(50) PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  target_name VARCHAR(255),
  created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_by_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_referral_mappings_target_user_id ON referral_mappings(target_user_id);
CREATE INDEX idx_referral_mappings_created_by ON referral_mappings(created_by_user_id);
CREATE INDEX idx_referral_mappings_created_at ON referral_mappings(created_at);

-- Auto-cleanup old referrals (run monthly)
-- DELETE FROM referral_mappings WHERE created_at < NOW() - INTERVAL '90 days';

-- ===== TEXT ROOM ACTIVITY TABLE =====
-- Stores torch rule activity tracking for text mode
-- Allows resuming text chats after server restart
CREATE TABLE IF NOT EXISTS text_room_activity (
  room_id UUID PRIMARY KEY REFERENCES active_rooms(room_id) ON DELETE CASCADE,
  user_1_last_message_at TIMESTAMP DEFAULT NOW(),
  user_2_last_message_at TIMESTAMP DEFAULT NOW(),
  warning_started_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_text_room_activity_updated_at ON text_room_activity(updated_at);

-- Auto-cleanup for ended rooms
-- DELETE FROM text_room_activity WHERE room_id NOT IN (SELECT room_id FROM active_rooms WHERE status != 'ended');

-- ===== RATE LIMITS TABLE =====
-- Optional: Persist rate limiting across restarts
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_address INET PRIMARY KEY,
  attempts INTEGER DEFAULT 0,
  first_attempt_at TIMESTAMP DEFAULT NOW(),
  last_attempt_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_rate_limits_expires_at ON rate_limits(expires_at);
CREATE INDEX idx_rate_limits_last_attempt ON rate_limits(last_attempt_at);

-- Auto-cleanup expired rate limits (run hourly)
-- DELETE FROM rate_limits WHERE expires_at < NOW();

-- ===== UPDATE CHAT_HISTORY TABLE =====
-- Add chat_mode column if it doesn't exist (for admin review)
ALTER TABLE chat_history 
ADD COLUMN IF NOT EXISTS chat_mode VARCHAR(10) DEFAULT 'video' CHECK (chat_mode IN ('video', 'text'));

-- ===== UPDATE REPORTS TABLE =====
-- Add session_data column to store call/chat context
ALTER TABLE reports 
ADD COLUMN IF NOT EXISTS session_data JSONB;

-- ===== TRIGGERS FOR AUTO-UPDATE =====

-- Update active_rooms.updated_at
CREATE OR REPLACE FUNCTION update_active_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_active_rooms_timestamp
BEFORE UPDATE ON active_rooms
FOR EACH ROW 
EXECUTE FUNCTION update_active_rooms_updated_at();

-- ===== NOTES =====
-- Run this migration with:
-- psql $DATABASE_URL -f migrations/add-active-rooms-and-referrals.sql

-- Tables that SHOULD remain in-memory only:
-- - presence (real-time, changes constantly)
-- - seenInSession (temporary, one-time use)
-- 
-- Tables now persisted:
-- - active_rooms (recover calls after restart)
-- - referral_mappings (intro links always work)
-- - text_room_activity (resume text chats)
-- - rate_limits (prevent ban evasion)

