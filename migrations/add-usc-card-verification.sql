-- ===== USC CAMPUS CARD VERIFICATION SYSTEM =====
-- Enables USC students to register/login with campus card barcode
-- Implements guest account system with 7-day expiry

-- 1. USC Card Registrations (One card = one account)
CREATE TABLE IF NOT EXISTS usc_card_registrations (
  usc_id VARCHAR(10) PRIMARY KEY,                    -- "1268306021"
  usc_id_hash VARCHAR(64) NOT NULL UNIQUE,           -- SHA256(uscId + salt)
  user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  
  -- Barcode data
  raw_barcode_value TEXT,                            -- "12683060215156"
  barcode_format VARCHAR(20),                        -- "CODABAR"
  
  -- Audit trail
  first_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  first_scanned_ip INET,
  
  -- Login tracking
  last_login_via_card_at TIMESTAMPTZ,
  total_card_logins INT DEFAULT 0,
  
  -- Indexes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usc_card_hash ON usc_card_registrations(usc_id_hash);
CREATE INDEX idx_usc_card_user ON usc_card_registrations(user_id);

-- 2. Scan Attempt Log (Security & Debugging)
CREATE TABLE IF NOT EXISTS usc_scan_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scan data
  raw_barcode_value TEXT,
  barcode_format VARCHAR(20),
  extracted_usc_id VARCHAR(10),
  
  -- Validation
  passed_validation BOOLEAN,
  validation_errors JSONB,
  
  -- Result
  resulted_in_signup BOOLEAN DEFAULT false,
  resulted_in_login BOOLEAN DEFAULT false,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Audit
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usc_attempts_ip ON usc_scan_attempts(ip_address, scanned_at);
CREATE INDEX idx_usc_attempts_uscid ON usc_scan_attempts(extracted_usc_id);
CREATE INDEX idx_usc_attempts_success ON usc_scan_attempts(passed_validation, scanned_at);

-- 3. Update Users Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS usc_id VARCHAR(10) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS usc_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'permanent';
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expiry_warning_sent BOOLEAN DEFAULT FALSE;

-- Add check constraint for account_type
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_account_type'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_account_type 
      CHECK (account_type IN ('guest', 'permanent'));
  END IF;
END $$;

-- 4. Index for guest account cleanup job
CREATE INDEX IF NOT EXISTS idx_users_guest_expiry 
  ON users(account_type, account_expires_at) 
  WHERE account_type = 'guest' AND account_expires_at IS NOT NULL;

-- 5. Update verification_method if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'verification_method'
  ) THEN
    -- Update existing column to include new methods
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS check_verification_method';
    EXECUTE 'ALTER TABLE users ADD CONSTRAINT check_verification_method 
             CHECK (verification_method IN (''payment'', ''qr_code'', ''usc_email'', ''usc_card''))';
  END IF;
END $$;

COMMENT ON TABLE usc_card_registrations IS 'Tracks USC campus card registrations - one card can only be used once';
COMMENT ON TABLE usc_scan_attempts IS 'Audit log of all barcode scan attempts for security';
COMMENT ON COLUMN users.usc_id IS 'USC student ID number (10 digits) - from campus card barcode';
COMMENT ON COLUMN users.account_type IS 'guest = 7-day expiry (card only), permanent = no expiry (card + email)';
COMMENT ON COLUMN users.account_expires_at IS 'When guest account expires and will be auto-deleted';

