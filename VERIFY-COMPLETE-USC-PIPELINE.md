USC CARD BARCODE PIPELINE - COMPLETE VERIFICATION
==================================================

CRITICAL QUESTION: Did you scan an ADMIN QR CODE that contains `?inviteCode=XXXXXXXXXXXXXXXX`?

The USC card barcode pipeline requires BOTH:
1. Admin QR code (from URL parameter)
2. USC card barcode scan

---

STEP 1: Admin QR Code Scan
---------------------------
URL Format: https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC
                                                         ^
                                                         |
                                          Must be EXACTLY 16 characters

Frontend (app/onboarding/page.tsx line 142-169):
```typescript
const invite = searchParams.get('inviteCode');
if (invite) {
  setInviteCode(invite); // Store in state
  // Check if admin code
  fetch('/payment/validate-code', { code: invite })
    .then(data => {
      if (data.type === 'admin') {
        setNeedsUSCCard(true);  // Show USC card scanner
        setStep('usc-welcome');
      }
    });
}
```

CHECK: Is inviteCode state set? Open browser console and type:
```javascript
// Check if invite code was extracted
console.log('Current URL:', window.location.href);
```

---

STEP 2: USC Welcome Popup
--------------------------
Shows USC-branded welcome screen.
Click "Scan Card" → goes to scanner

---

STEP 3: USC Card Scanner
-------------------------
Scans barcode: "12683060215156"
Extracts USC ID: "1268306021"

Frontend (app/onboarding/page.tsx line 888-890):
```typescript
setUscId(scannedUSCId);
sessionStorage.setItem('temp_usc_id', scannedUSCId);
sessionStorage.setItem('temp_usc_barcode', rawBarcode);
```

CHECK: USC ID stored correctly

---

STEP 4: Name + Gender Submission
---------------------------------
Frontend (app/onboarding/page.tsx line 310-321):
```typescript
console.log('[Onboarding] DEBUG - inviteCode value:', inviteCode);
console.log('[Onboarding] DEBUG - name:', name, '| gender:', gender);

fetch('/auth/guest-usc', {
  method: 'POST',
  body: JSON.stringify({
    name: name.trim(),
    gender,
    inviteCode: inviteCode || undefined,  // ← CRITICAL: Must be 16 chars
  }),
});
```

Backend (server/src/auth.ts line 448-453):
```typescript
if (inviteCode) {
  const sanitizedCode = inviteCode.trim().toUpperCase();
  
  if (!/^[A-Z0-9]{16}$/.test(sanitizedCode)) {
    return res.status(400).json({ error: 'Invalid invite code format' });
  }
}
```

CURRENT ERROR: "Invalid invite code format"
REASON: inviteCode is either:
  - Missing (undefined/null)
  - Not 16 characters
  - Contains invalid characters

---

DIAGNOSIS
---------

Most Likely Issue: You DID NOT scan an admin QR code!

Admin QR codes are URLs like:
https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC

Available Admin Codes (16 characters each):
1. TCZIOIXWDZLEFQZC
2. QBEPZIGQVQ71O4MM
3. HQTRSU264R2TNGUT
4. R0EJLIUEAFBHIGZS
5. UBLSKKEMTMSBXFXY
6. GBMOIOMJDTKCAFHX
7. UC87H7YZGZ4TFPEF
8. 0FPAUAZJJ0T3CKDA
9. RODOJUMROA6SMVII
10. KPCMSZPO2VZR180Y

---

SOLUTION
--------

Option A: Use Admin QR Code (Correct Flow)
1. Generate QR code from URL: https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC
2. Scan this QR code
3. Scan USC card
4. Enter name/gender
5. ✅ Should work

Option B: Allow USC Card WITHOUT Admin Code (Code Change Needed)
If you want USC card users to register WITHOUT an admin QR code, I need to:
1. Make inviteCode optional in backend validation
2. Update the flow to not require admin codes for USC cards

Which option do you want?

---

VERIFICATION COMMANDS
---------------------

Check if you're accessing the right URL:
```bash
# Your current URL should be:
https://napalmsky.com/onboarding?inviteCode=TCZIOIXWDZLEFQZC
```

Test backend directly:
```bash
curl -X POST https://napalmsky-production.up.railway.app/auth/guest-usc \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","gender":"male","inviteCode":"TCZIOIXWDZLEFQZC"}'
# Should return: {"sessionToken": "...", "userId": "..."}
```

Test without invite code (should fail):
```bash
curl -X POST https://napalmsky-production.up.railway.app/auth/guest-usc \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","gender":"male"}'
# Should return: {"error": "Invalid invite code format"}
```
