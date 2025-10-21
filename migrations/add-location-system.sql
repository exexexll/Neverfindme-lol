-- Location-Based Matchmaking System
-- Privacy-first design: 24-hour auto-expiry, opt-in only

-- User locations table (temporary storage)
CREATE TABLE IF NOT EXISTS user_locations (
  user_id TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION, -- meters
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
  consent_given_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_locations_expires ON user_locations(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_locations_updated ON user_locations(updated_at);

-- Optional: PostGIS for spatial queries (uncomment if using PostGIS)
-- CREATE EXTENSION IF NOT EXISTS postgis;
-- ALTER TABLE user_locations ADD COLUMN location geography(POINT, 4326);
-- CREATE INDEX IF NOT EXISTS idx_user_locations_geography ON user_locations USING GIST (location);

-- Add location consent to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS location_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS location_last_shared TIMESTAMP;

-- Auto-cleanup function (runs hourly via cron or manual trigger)
CREATE OR REPLACE FUNCTION cleanup_expired_locations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_locations WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Verify
SELECT 'Location system tables created successfully' AS status;

