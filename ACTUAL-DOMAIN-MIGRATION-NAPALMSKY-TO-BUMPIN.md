ACTUAL DOMAIN MIGRATION: napalmsky.com → bumpin.io
===================================================

## CURRENT SETUP (Analyzed from Code)

### Frontend (Vercel):
- Platform: Vercel
- Current Domain: napalmsky.com
- Framework: Next.js 14.2.18
- Config: vercel.json
- Environment Variables:
  * NEXT_PUBLIC_API_BASE=https://napalmsky-production.up.railway.app
  * NEXT_PUBLIC_SOCKET_URL=https://napalmsky-production.up.railway.app
  * NEXT_PUBLIC_APP_URL=https://napalmsky.com

### Backend (Railway):
- Platform: Railway
- Service Name: napalmsky-production
- Domain: napalmsky-production.up.railway.app
- Framework: Node.js/Express + Socket.io
- Config: railway.json
- Database: PostgreSQL (Railway hosted)

### API Configuration:
- File: lib/config.ts
- API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'
- Uses environment variable (good for migration!)

---

## STEP-BY-STEP MIGRATION GUIDE

### PHASE 1: Vercel Frontend (5 minutes)

1. **Go to Vercel Dashboard**
   - Login to vercel.com
   - Select your BUMPIN project

2. **Add New Domain**
   - Settings → Domains
   - Click "Add Domain"
   - Enter: `bumpin.io`
   - Vercel will show DNS instructions

3. **Configure DNS at Domain Registrar**
   - Go to where you bought bumpin.io (e.g., Namecheap, GoDaddy)
   - Add DNS records as shown by Vercel:
     * Type: A
     * Name: @ (or blank)
     * Value: 76.76.21.21 (Vercel's IP)
     
     * Type: CNAME
     * Name: www
     * Value: cname.vercel-dns.com

4. **Update Environment Variables in Vercel**
   - Settings → Environment Variables
   - Edit: NEXT_PUBLIC_APP_URL=https://bumpin.io
   - Redeploy project

5. **Wait for DNS Propagation** (5-30 minutes)
   - Check: `dig bumpin.io`
   - Test: https://bumpin.io

---

### PHASE 2: Update Code (10 minutes)

#### File 1: vercel.json
```json
{
  "version": 2,
  "build": {
    "env": {
      "NODE_ENV": "production",
      "NEXT_PUBLIC_API_BASE": "https://napalmsky-production.up.railway.app",
      "NEXT_PUBLIC_SOCKET_URL": "https://napalmsky-production.up.railway.app",
      "NEXT_PUBLIC_APP_URL": "https://bumpin.io"  ← CHANGE THIS
    }
  },
  "regions": ["iad1"],
  "framework": "nextjs"
}
```

#### File 2: next.config.js (Line 76)
```javascript
{
  protocol: 'https',
  hostname: 'napalmsky-production.up.railway.app',  ← KEEP (backend stays same)
  pathname: '/**',
},
```
No changes needed - backend URL stays the same

#### File 3: server/src/index.ts (CORS)
```typescript
// Find CORS configuration
origin: [
  'https://bumpin.io',         ← ADD
  'https://www.bumpin.io',     ← ADD
  'https://napalmsky.com',     ← KEEP temporarily
  'http://localhost:3000'
],
```

---

### PHASE 3: Railway Backend (2 minutes)

1. **Go to Railway Dashboard**
   - Login to railway.app
   - Select napalmsky-production project

2. **Add Environment Variable** (Optional)
   - Variables tab
   - Add: `FRONTEND_URL=https://bumpin.io`
   - This updates QR code URLs automatically

3. **No Code Changes Needed**
   - Backend API stays at napalmsky-production.up.railway.app
   - No redeployment needed (unless updating FRONTEND_URL)

---

### PHASE 4: Testing (15 minutes)

After DNS propagates:

1. **Test Frontend**
   ```
   https://bumpin.io
   https://www.bumpin.io
   ```
   Should load landing page ✅

2. **Test API Connection**
   - Check browser console
   - Should connect to napalmsky-production.up.railway.app ✅

3. **Test All Features**
   - USC card scanning
   - Invite codes
   - Login
   - Video calls
   - Websockets

4. **Test QR Codes**
   - Generate new admin QR in admin panel
   - Should show: https://bumpin.io/onboarding?inviteCode=...

---

### PHASE 5: Gradual Migration (Optional)

#### Week 1: Both Domains Active
- napalmsky.com → Keep working
- bumpin.io → New primary
- Update all marketing to bumpin.io

#### Week 2: Add Redirect Banner
Add to app/layout.tsx:
```typescript
{typeof window !== 'undefined' && window.location.hostname === 'napalmsky.com' && (
  <div className="bg-yellow-500 text-black p-2 text-center text-sm">
    We've moved! Visit <a href="https://bumpin.io">bumpin.io</a> for the latest version.
  </div>
)}
```

#### Week 3: 301 Redirect
Add to vercel.json:
```json
{
  "redirects": [
    {
      "source": "/:path*",
      "destination": "https://bumpin.io/:path*",
      "permanent": true
    }
  ]
}
```

#### Week 4: Remove napalmsky.com
- Remove from Vercel domains
- Keep for email/backup

---

## CRITICAL POINTS

### DO NOT CHANGE:
✅ Railway backend URL (napalmsky-production.up.railway.app)
✅ Database connection string
✅ API endpoints
✅ Websocket URLs point to Railway
✅ CORS includes both domains during transition

### MUST CHANGE:
✅ Vercel domain (add bumpin.io)
✅ vercel.json NEXT_PUBLIC_APP_URL
✅ CORS origin list (add bumpin.io)
✅ Optional: FRONTEND_URL in Railway

---

## DEPLOYMENT SEQUENCE

1. Update vercel.json (NEXT_PUBLIC_APP_URL)
2. Update server/src/index.ts (CORS origins)
3. Git commit + push
4. Railway auto-deploys backend (2 min)
5. Add bumpin.io in Vercel dashboard
6. Configure DNS at registrar
7. Wait for DNS (5-30 min)
8. Test bumpin.io
9. Both domains work simultaneously ✅

---

## ROLLBACK PLAN

If issues:
1. Remove bumpin.io from Vercel
2. Revert vercel.json changes
3. Keep napalmsky.com as primary
4. Debug and retry

---

## ESTIMATED TIME

Total: ~30 minutes active work + 30 minutes DNS wait
Downtime: 0 seconds (both domains work during transition)

Ready to proceed? I can make the code changes now.
