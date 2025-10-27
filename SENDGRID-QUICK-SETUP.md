# SendGrid Quick Setup - 5 Minutes

## ⚡ FAST SETUP (Production)

### Step 1: Get SendGrid API Key (2 minutes)
1. Go to **https://sendgrid.com/signup** (or login)
2. Navigate to: **Settings → API Keys**
3. Click: **Create API Key**
4. Name: `BUMPIN Production`
5. Permissions: **Full Access** (or at least "Mail Send")
6. **Copy the key NOW** (shown only once!)
   ```
   SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Step 2: Verify Sender (3 minutes)
1. Go to: **Settings → Sender Authentication**
2. Click: **Verify a Single Sender**
3. Fill in:
   - From Email: `noreply@napalmsky.com`
   - From Name: `BUMPIN`
   - Reply To: `everything@napalmsky.com`
   - Address: (your address)
4. Click **Create**
5. Check email and click verification link
6. ✅ **Sender verified!**

### Step 3: Set Environment Variables in Railway (<1 minute)
1. Open **Railway Dashboard**
2. Select **BUMPIN Backend** service
3. Click **Variables** tab
4. Click **+ New Variable**
5. Add:
   ```
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   FROM_EMAIL=noreply@napalmsky.com
   ```
6. Click **Deploy** to restart server

### Step 4: Verify It Works (<1 minute)
1. Check Railway logs for: `[Email] SendGrid configured` ✅
2. Test signup with email verification
3. Check email inbox for 6-digit code
4. Done! ✅

---

## 🚨 Current Status

**Without SendGrid**:
- ❌ Emails won't send
- ❌ Users see "Failed to send email" error
- ✅ Code still works in memory (can test manually)

**With SendGrid**:
- ✅ Emails send automatically
- ✅ Users receive codes instantly
- ✅ Full verification flow works
- ✅ Production-ready

---

## 🧪 Testing Without SendGrid

For testing before SendGrid setup:

```typescript
// Temporary: Log code to console instead of emailing
// server/src/email.ts

export async function sendVerificationEmail(email, code, userName) {
  if (!SENDGRID_API_KEY) {
    // TESTING ONLY: Log code to console
    console.log('━'.repeat(60));
    console.log(`📧 VERIFICATION CODE FOR ${email}:`);
    console.log(`   CODE: ${code}`);
    console.log(`   User: ${userName}`);
    console.log(`   (SendGrid not configured - using console for testing)`);
    console.log('━'.repeat(60));
    return true; // Pretend it worked
  }
  // ... rest of code
}
```

**WARNING**: Only for local testing! Remove before production.

---

## 📞 Support

**Issue**: Email not sending?  
**Check**:
1. `SENDGRID_API_KEY` set in Railway? (Variables tab)
2. Sender verified? (Settings → Sender Authentication)
3. Railway logs show `[Email] SendGrid configured`?
4. Email in spam folder?
5. SendGrid dashboard shows delivery?

**Still stuck?**: everything@napalmsky.com

