# 📧 SendGrid DNS Setup - Fix CNAME Errors

**Your Error:** DNS records not found  
**Cause:** Adding records to wrong DNS provider

---

## ✅ CORRECT SETUP:

### Where Your Domain DNS is Managed:

Check where `napalmsky.com` nameservers point:
```
dig napalmsky.com NS
```

**Your DNS is managed by:**
- Squarespace? → Add records there
- Cloudflare? → Add records there
- GoDaddy? → Add records there
- Vercel? → Add records there

**NOT** in SendGrid itself!

---

## Step-by-Step Fix:

### 1. Find Your DNS Provider

Go to https://www.whatsmydns.net/
- Enter: napalmsky.com
- Type: NS (Nameservers)
- See which company manages your DNS

### 2. Add SendGrid CNAME Records

**Go to your DNS provider dashboard** (Squarespace, Cloudflare, etc.)

Add these **EXACTLY as shown:**

```
Type: CNAME
Host: url7912.napalmsky.com
Value: sendgrid.net
TTL: 3600 (or Auto)

Type: CNAME  
Host: 56832113.napalmsky.com
Value: sendgrid.net
TTL: 3600

Type: CNAME
Host: em8509.napalmsky.com
Value: u56832113.wl114.sendgrid.net
TTL: 3600

Type: CNAME
Host: s1._domainkey.napalmsky.com
Value: s1.domainkey.u56832113.wl114.sendgrid.net
TTL: 3600

Type: CNAME
Host: s2._domainkey.napalmsky.com
Value: s2.domainkey.u56832113.wl114.sendgrid.net
TTL: 3600

Type: TXT
Host: _dmarc.napalmsky.com
Value: v=DMARC1; p=none;
TTL: 3600
```

### 3. Important Notes:

**Host Format Varies by Provider:**

**If using Cloudflare/most providers:**
- Host: `url7912.napalmsky.com`
- Value: `sendgrid.net`

**If using some providers (GoDaddy, etc):**
- Host: `url7912` (without domain)
- Value: `sendgrid.net`

**Try both formats if first doesn't work!**

### 4. Wait 15-30 Minutes

DNS propagation takes time. After adding records:
- Wait 15-30 minutes
- Check SendGrid → Domain Authentication
- Click "Verify" button
- Should turn green ✅

---

## Alternative: Single Sender Verification (Quick)

**Don't want to mess with DNS?**

1. SendGrid → Settings → Sender Authentication
2. Click **"Verify a Single Sender"**
3. Email: noreply@napalmsky.com
4. Fill form, submit
5. Check email, click verification link
6. **Done in 5 minutes!**

**Limitation:** Can only send from that one email address.  
**Benefit:** No DNS needed, works immediately.

---

## What You Need:

**For Email Verification to Work:**
```bash
# Railway Variables:
SENDGRID_API_KEY=SG.xxx (from SendGrid dashboard)
FROM_EMAIL=noreply@napalmsky.com (or your verified email)
```

**That's it!** Domain auth is optional (just makes emails look more professional).

