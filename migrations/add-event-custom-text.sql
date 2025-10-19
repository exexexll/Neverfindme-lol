-- Add custom text fields to event_settings table
-- Date: October 19, 2025
-- Purpose: Allow admins to customize event mode text

-- Add event_title column (for event-wait page header)
ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_title TEXT DEFAULT 'Event Mode Active';

-- Add event_banner_text column (for notification banner)
ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_banner_text TEXT DEFAULT 'Event Mode';

-- Update existing row to have default values
UPDATE event_settings 
SET 
  event_title = COALESCE(event_title, 'Event Mode Active'),
  event_banner_text = COALESCE(event_banner_text, 'Event Mode')
WHERE id = 1;

-- Verify columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'event_settings' 
  AND column_name IN ('event_title', 'event_banner_text');

