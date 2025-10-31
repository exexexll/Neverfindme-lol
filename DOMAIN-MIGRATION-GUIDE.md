DOMAIN MIGRATION GUIDE: napalmsky.com → bumpin.com
===================================================

## Prerequisites

1. ✅ New domain registered: bumpin.com
2. ✅ DNS configured
3. ✅ SSL certificate ready

---

## Step 1: Update Environment Variables

### Railway (Backend)
```
FRONTEND_URL=https://bumpin.com
NODE_ENV=production
```

### Vercel (Frontend)
```
NEXT_PUBLIC_API_BASE=https://napalmsky-production.up.railway.app
```

---

## Step 2: Update Code References

### Files to Update:

1. **server/src/payment.ts** (line 576-578)
```typescript
// BEFORE:
const frontendUrl = process.env.FRONTEND_URL || 'https://bumpin.com'

// AFTER: (already correct!)
```

2. **app/layout.tsx** - Update metadata
```typescript
metadataBase: new URL('https://bumpin.com')
```

3. **vercel.json** - Add domain
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "https://bumpin.com"
        }
      ]
    }
  ]
}
```

---

## Step 3: Configure Vercel Project

1. Go to Vercel dashboard
2. Project Settings → Domains
3. Add domain: `bumpin.com`
4. Add www redirect: `www.bumpin.com` → `bumpin.com`
5. Wait for DNS propagation (5-30 min)

---

## Step 4: Update Railway CORS

File: server/src/index.ts
```typescript
// Update CORS origins
app.use(cors({
  origin: [
    'https://bumpin.com',
    'https://www.bumpin.com',
    'http://localhost:3000' // Keep for development
  ],
  credentials: true
}));
```

---

## Step 5: Update OAuth/External Services

### Stripe
- Dashboard → Settings → Account details
- Update website URL to bumpin.com
- Update return URLs in checkout sessions

### SendGrid
- Settings → Sender Authentication
- Update email links to point to bumpin.com

### Cloudinary (if used)
- Settings → Upload
- Update allowed origins

---

## Step 6: Database (No Changes Needed)
✅ Railway PostgreSQL stays the same
✅ Connection string unchanged
✅ No data migration required

---

## Step 7: Testing Checklist

### Before Going Live:
- [ ] Test napalmsky.com still works
- [ ] Test bumpin.com loads correctly
- [ ] Test login on new domain
- [ ] Test video calls work
- [ ] Test USC card scanning
- [ ] Test QR code generation
- [ ] Test payment flow
- [ ] Test email verification

### DNS Propagation:
```bash
# Check DNS
dig bumpin.com
nslookup bumpin.com

# Test HTTPS
curl -I https://bumpin.com
```

---

## Step 8: Gradual Migration (Recommended)

### Week 1: Dual Domain
- Both domains active
- napalmsky.com shows banner: "We've moved to bumpin.com!"
- QR codes use new domain

### Week 2-3: Redirect
- napalmsky.com → 301 redirect to bumpin.com
- Update all marketing materials

### Week 4+: Full Migration
- Decommission napalmsky.com

---

## Rollback Plan

If issues occur:
1. Remove bumpin.com from Vercel
2. Revert environment variables
3. Keep napalmsky.com as primary
4. Debug issues
5. Retry migration

---

## Post-Migration Tasks

1. Update Google Search Console
2. Update social media links
3. Update app store listings (if applicable)
4. Update email signatures
5. Notify users via in-app banner

---

Estimated Time: 2-4 hours
Downtime: 0 minutes (zero-downtime migration)
