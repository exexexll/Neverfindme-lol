# 🚀 Immediate Deployment Checklist

**Run these BEFORE using new features**

---

## 1. Admin Password (CRITICAL - Server won't start!)

```bash
# Generate hash:
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('328077', 12).then(h => console.log(h));"

# Output example:
# $2b$12$51/ipDaDcOudvkQ8KZBdlOtlieovXEWfQcCW4PMC.ml530T7umAD2

# Add to Railway Variables:
ADMIN_PASSWORD_HASH=$2b$12$[paste_output_here]
ADMIN_USERNAME=Hanson
```

---

## 2. Database Migrations (Required)

Run in Railway PostgreSQL Query tool:

### Event Custom Text:
```sql
ALTER TABLE event_settings 
ADD COLUMN IF NOT EXISTS event_title TEXT DEFAULT 'Event Mode Active',
ADD COLUMN IF NOT EXISTS event_banner_text TEXT DEFAULT 'Event Mode';

UPDATE event_settings 
SET event_title = 'Event Mode Active',
    event_banner_text = 'Event Mode'
WHERE id = 1;
```

### Email Verification:
```sql
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6),
ADD COLUMN IF NOT EXISTS verification_code_expires_at BIGINT,
ADD COLUMN IF NOT EXISTS verification_attempts INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_verification_code ON users(verification_code);
```

---

## 3. SendGrid (Optional - for email verification)

1. Go to https://app.sendgrid.com
2. Create API key
3. Add to Railway:
```bash
SENDGRID_API_KEY=SG.xxx
FROM_EMAIL=noreply@napalmsky.com
```

See `TWILIO-SETUP-GUIDE.md` for details.

---

## Test After Deploy:

1. ✅ Admin login works (use new password)
2. ✅ Password validation blocks weak passwords
3. ✅ Event custom text appears (after running migration)
4. ✅ Email verification works (if SendGrid configured)
5. ✅ Image uploads use WebP compression

