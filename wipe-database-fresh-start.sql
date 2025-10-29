-- ============================================================
-- COMPLETE DATABASE WIPE - FRESH START
-- ============================================================
-- WARNING: This deletes ALL user data permanently!
-- Use this for: Clean slate, testing, development reset
-- DO NOT RUN IN PRODUCTION without backup!
-- ============================================================

BEGIN;

-- Disable triggers temporarily (speeds up deletion)
SET session_replication_role = replica;

-- ===== 1. USER DATA =====
TRUNCATE TABLE session_completions CASCADE;
TRUNCATE TABLE chat_history CASCADE;
TRUNCATE TABLE user_locations CASCADE;

-- ===== 2. USC CARD SYSTEM =====
TRUNCATE TABLE usc_card_registrations CASCADE;
TRUNCATE TABLE usc_scan_attempts CASCADE;

-- ===== 3. REPORTING & BANS =====
TRUNCATE TABLE reports CASCADE;
TRUNCATE TABLE user_bans CASCADE;
TRUNCATE TABLE ip_bans CASCADE;

-- ===== 4. REFERRALS & INVITES =====
TRUNCATE TABLE referral_mappings CASCADE;
TRUNCATE TABLE referral_notifications CASCADE;
TRUNCATE TABLE invite_codes CASCADE;

-- ===== 5. ACTIVE ROOMS & MESSAGES =====
TRUNCATE TABLE active_rooms CASCADE;
TRUNCATE TABLE text_chat_messages CASCADE;
TRUNCATE TABLE chat_file_uploads CASCADE;

-- ===== 6. SESSIONS (Must come before users) =====
TRUNCATE TABLE sessions CASCADE;

-- ===== 7. USERS (Must be last due to foreign keys) =====
TRUNCATE TABLE users CASCADE;

-- ===== 8. EVENT SYSTEM =====
TRUNCATE TABLE event_rsvps CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

COMMIT;

-- ===== VERIFICATION =====
-- Check all tables are empty
SELECT 
  'users' as table_name, COUNT(*) as rows FROM users
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'chat_history', COUNT(*) FROM chat_history
UNION ALL SELECT 'usc_card_registrations', COUNT(*) FROM usc_card_registrations
UNION ALL SELECT 'invite_codes', COUNT(*) FROM invite_codes
UNION ALL SELECT 'reports', COUNT(*) FROM reports
UNION ALL SELECT 'user_bans', COUNT(*) FROM user_bans
ORDER BY table_name;

-- Expected output: All tables should show 0 rows

-- ===== SUCCESS MESSAGE =====
DO $$
BEGIN
  RAISE NOTICE '✅ DATABASE WIPED - FRESH START';
  RAISE NOTICE '📊 All user data deleted';
  RAISE NOTICE '🔐 All sessions cleared';
  RAISE NOTICE '🎓 All USC card registrations cleared';
  RAISE NOTICE '💾 Ready for fresh deployment';
END $$;

