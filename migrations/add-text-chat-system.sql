-- Text + Video Chat System - Database Schema
-- Phase 1: Foundation Tables
-- Created: October 21, 2025

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Chat Messages Table
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  sender_user_id UUID NOT NULL,
  receiver_user_id UUID NOT NULL,
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('text', 'image', 'file', 'gif', 'system')),
  content TEXT, -- Message text (max 500 chars, validated in app)
  file_url TEXT, -- Cloudinary URL for images/files
  file_name TEXT, -- Original filename
  file_size_bytes INT, -- File size in bytes
  gif_url TEXT, -- Tenor GIF URL
  gif_id TEXT, -- Tenor GIF ID for tracking
  sent_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP, -- When recipient read the message
  deleted BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT fk_sender FOREIGN KEY (sender_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_receiver FOREIGN KEY (receiver_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages(receiver_user_id, read_at) WHERE read_at IS NULL;

-- ==========================================
-- Chat Sessions Table (Extended)
-- ==========================================

-- Add chat_mode to existing active rooms tracking
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS chat_mode VARCHAR(10) DEFAULT 'video' CHECK (chat_mode IN ('text', 'video'));

-- ==========================================
-- Chat Recordings Table
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_recordings (
  recording_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  recording_url TEXT NOT NULL, -- Cloudinary video URL
  recording_public_id TEXT, -- Cloudinary public_id for deletion
  file_size_bytes BIGINT, -- Recording file size
  duration_seconds INT NOT NULL,
  chat_mode VARCHAR(10) NOT NULL CHECK (chat_mode IN ('text', 'video')),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NOT NULL,
  retained_for_report BOOLEAN DEFAULT FALSE,
  report_id UUID, -- Links to reports table
  reviewed BOOLEAN DEFAULT FALSE,
  review_decision VARCHAR(20), -- 'ban', 'vindicate', 'pending'
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'), -- Auto-delete if not for report
  deleted_at TIMESTAMP, -- Soft delete
  
  CONSTRAINT fk_report FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recordings_session ON chat_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_recordings_report ON chat_recordings(report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recordings_expires ON chat_recordings(expires_at) WHERE deleted_at IS NULL;

-- ==========================================
-- Message Rate Limiting Table
-- ==========================================

CREATE TABLE IF NOT EXISTS message_rate_limits (
  user_id UUID PRIMARY KEY,
  last_message_at TIMESTAMP NOT NULL,
  message_count_last_minute INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ==========================================
-- Cleanup Functions
-- ==========================================

-- Auto-delete expired recordings (not linked to reports)
CREATE OR REPLACE FUNCTION delete_expired_recordings()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_recordings 
  WHERE expires_at < NOW() 
  AND deleted_at IS NULL
  AND (retained_for_report = FALSE OR report_id IS NULL OR reviewed = TRUE);
  
  RAISE NOTICE 'Deleted % expired recordings', FOUND;
END;
$$ LANGUAGE plpgsql;

-- Auto-delete old rate limit entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM message_rate_limits 
  WHERE last_message_at < NOW() - INTERVAL '1 hour';
  
  RAISE NOTICE 'Cleaned up % old rate limit entries', FOUND;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- Scheduled Jobs (if pg_cron is available)
-- ==========================================

-- Run daily at 2 AM
-- SELECT cron.schedule('delete-expired-recordings', '0 2 * * *', 
--   'SELECT delete_expired_recordings();'
-- );

-- Run hourly
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 
--   'SELECT cleanup_rate_limits();'
-- );

-- ==========================================
-- Helper Views
-- ==========================================

-- View: Recent messages per room
CREATE OR REPLACE VIEW recent_room_messages AS
SELECT 
  room_id,
  COUNT(*) as message_count,
  MAX(sent_at) as last_message_at,
  COUNT(CASE WHEN message_type = 'text' THEN 1 END) as text_count,
  COUNT(CASE WHEN message_type = 'image' THEN 1 END) as image_count,
  COUNT(CASE WHEN message_type = 'gif' THEN 1 END) as gif_count
FROM chat_messages
WHERE deleted = FALSE
GROUP BY room_id;

-- View: Recordings pending review (simplified - no join to reports)
CREATE OR REPLACE VIEW recordings_pending_review AS
SELECT *
FROM chat_recordings
WHERE retained_for_report = TRUE 
AND reviewed = FALSE
AND deleted_at IS NULL
ORDER BY created_at DESC;

-- ==========================================
-- Grant Permissions (if using restricted user)
-- ==========================================

-- GRANT ALL ON chat_messages TO napalmsky_user;
-- GRANT ALL ON chat_recordings TO napalmsky_user;
-- GRANT ALL ON message_rate_limits TO napalmsky_user;

-- ==========================================
-- Verification Queries
-- ==========================================

-- Check tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('chat_messages', 'chat_recordings', 'message_rate_limits');

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('chat_messages', 'chat_recordings');

-- Test data (optional)
-- INSERT INTO chat_messages (session_id, room_id, sender_user_id, receiver_user_id, message_type, content)
-- VALUES ('test-session', 'test-room', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'text', 'Test message');

-- SELECT * FROM chat_messages WHERE room_id = 'test-room';

COMMIT;

