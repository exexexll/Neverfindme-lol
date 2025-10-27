-- Fix invite_codes foreign key constraint
-- Allow admin codes to have 'admin' as created_by instead of requiring UUID

-- Drop the existing foreign key constraint
ALTER TABLE invite_codes DROP CONSTRAINT IF EXISTS invite_codes_created_by_fkey;

-- Change created_by column type to VARCHAR to allow 'admin' identifier
ALTER TABLE invite_codes ALTER COLUMN created_by TYPE VARCHAR(255);

-- Note: We intentionally DO NOT add back a foreign key constraint
-- This allows admin codes to have created_by = 'admin' without requiring a user
-- User-generated codes will still have UUID but won't be enforced by FK

-- Verify the change
SELECT 
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'invite_codes' AND column_name = 'created_by';

