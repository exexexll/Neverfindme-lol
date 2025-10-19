-- EVENT MODE DATABASE MIGRATION
-- This adds tables and columns for scheduled matchmaking events feature
-- Run this migration after deploying the event mode code

-- =========================================
-- 1. CREATE event_settings TABLE
-- =========================================
-- Stores global event mode configuration (singleton pattern - only 1 row)

CREATE TABLE IF NOT EXISTS event_settings (
  id SERIAL PRIMARY KEY,
  event_mode_enabled BOOLEAN DEFAULT FALSE,
  event_start_time TIME NOT NULL DEFAULT '15:00:00', -- 3pm PST default
  event_end_time TIME NOT NULL DEFAULT '18:00:00',   -- 6pm PST default
  timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
  event_days JSONB DEFAULT '[]', -- Which days of week: [0,1,2,3,4,5,6] (Sunday-Saturday)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings (singleton row)
INSERT INTO event_settings (event_mode_enabled, event_start_time, event_end_time, timezone, event_days)
VALUES (FALSE, '15:00:00', '18:00:00', 'America/Los_Angeles', '[]')
ON CONFLICT DO NOTHING;

-- Create index for fast reads (even though only 1 row, good practice)
CREATE INDEX IF NOT EXISTS idx_event_settings_enabled ON event_settings(event_mode_enabled);

-- =========================================
-- 2. CREATE event_rsvps TABLE
-- =========================================
-- Tracks user time slot preferences for event days

CREATE TABLE IF NOT EXISTS event_rsvps (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  preferred_time TIME NOT NULL DEFAULT '15:00:00', -- Default to 3pm (event start time)
  event_date DATE NOT NULL, -- Which day they plan to join
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one RSVP per user per day (can update time, but not create multiple)
  UNIQUE(user_id, event_date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_rsvps_event_date ON event_rsvps(event_date);
CREATE INDEX IF NOT EXISTS idx_rsvps_preferred_time ON event_rsvps(preferred_time);
CREATE INDEX IF NOT EXISTS idx_rsvps_user_date ON event_rsvps(user_id, event_date);

-- =========================================
-- 3. UPDATE users TABLE
-- =========================================
-- Add VIP bypass field for event restrictions

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_outside_events BOOLEAN DEFAULT FALSE;

-- Create index for fast VIP checks
CREATE INDEX IF NOT EXISTS idx_users_event_access ON users(can_access_outside_events) WHERE can_access_outside_events = TRUE;

-- =========================================
-- 4. CLEANUP: Auto-delete old RSVPs
-- =========================================
-- Clean up RSVPs older than 7 days (prevent table bloat)
-- Run this as a scheduled job (cron/pg_cron) or manually

-- DELETE FROM event_rsvps WHERE event_date < CURRENT_DATE - INTERVAL '7 days';

-- =========================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =========================================
-- To remove event mode completely:
/*
DROP TABLE IF EXISTS event_rsvps;
DROP TABLE IF EXISTS event_settings;
ALTER TABLE users DROP COLUMN IF EXISTS can_access_outside_events;
*/

-- =========================================
-- VERIFICATION QUERIES
-- =========================================
-- Check that migration succeeded:
/*
SELECT * FROM event_settings;
SELECT COUNT(*) FROM event_rsvps;
SELECT can_access_outside_events FROM users LIMIT 1;
*/

