USC PORTAL - 3 OPTIONS IMPLEMENTATION PLAN
===========================================

## REQUIREMENT: 3 Ways for USC Students

1. ✅ Scan Admin QR Code (contains invite code URL)
2. ✅ Scan USC Campus Card Barcode (need admin code too)
3. ✅ Enter USC Email (for admin code email verification path)

---

## OPTION 1: QR CODE SCANNER

### Challenge:
- Quagga2 library does NOT support QR codes (only 1D barcodes)
- Need different solution

### Solutions Available:

#### Solution A: html5-qrcode Library
```bash
npm install html5-qrcode
```
- Best for React
- Camera-based QR scanning
- Good mobile support
- ~50KB bundle size

#### Solution B: Native Phone Camera
- iPhone: Opens native camera in browser
- Android: Opens native camera
- User grants camera permission
- Scans QR with phone's built-in scanner
- Returns data to webpage

#### Solution C: Manual Entry
- User scans QR with phone camera app
- Code appears on screen or opens URL
- User manually types 16-char code
- Simplest, no library needed

RECOMMENDED: Solution A (html5-qrcode)
- Professional UX
- Works in-app
- Cross-platform
- Already handles camera permissions

---

## OPTION 2: USC CARD BARCODE SCANNER

### Implementation:
- ✅ Use EXISTING USCCardScanner component
- Reuse all the code (already optimized)
- Works perfectly for barcodes
- 16x faster scanning

### Integration:
```typescript
<USCCardScanner 
  onSuccess={(uscId, rawValue) => {
    // Card scanned, but need admin code
    // Store USC ID for later
    sessionStorage.setItem('temp_usc_id', uscId);
    // Prompt for admin code
    // Redirect to onboarding
  }}
  onSkipToEmail={() => {
    // Fall back to email option
  }}
/>
```

---

## OPTION 3: USC EMAIL ENTRY

### Implementation:
Simple form:
- Input: USC email
- Validation: Must end with @usc.edu
- Redirect to onboarding
- Email verification flow starts

### Integration:
```typescript
const handleUSCEmail = () => {
  const email = prompt('Enter your @usc.edu email:');
  
  if (!email.endsWith('@usc.edu')) {
    alert('Must be @usc.edu email');
    return;
  }
  
  // Need admin code for this path
  const adminCode = prompt('Enter admin invite code:');
  
  if (adminCode && /^[A-Z0-9]{16}$/.test(adminCode)) {
    // Store email for verification
    sessionStorage.setItem('usc_email_temp', email);
    router.push(`/onboarding?inviteCode=${adminCode}`);
  }
};
```

---

## WAITLIST PAGE DESIGN

```
┌─────────────────────────────────────┐
│     Join the Waitlist               │
│  [Waitlist Form]                    │
│  [Join Waitlist] button             │
├─────────────────────────────────────┤
│              OR                      │
├─────────────────────────────────────┤
│    USC Students - 3 Ways            │
│                                     │
│  1. [📱 Scan Admin QR Code]        │
│     (Opens camera for QR scanning) │
│                                     │
│  2. [🎓 Scan USC Campus Card]      │
│     (Opens camera for barcode)     │
│                                     │
│  3. [✉️ Enter USC Email]           │
│     (Manual email + code entry)    │
│                                     │
│  Already have account? Log in      │
└─────────────────────────────────────┘
```

---

## IMPLEMENTATION STEPS

### Step 1: Install html5-qrcode
```bash
cd /Users/hansonyan/Desktop/Napalmsky
npm install html5-qrcode
```

### Step 2: Create QRCodeScanner Component
File: components/QRCodeScanner.tsx (~100 lines)
- Use html5-qrcode library
- Camera access
- Detect QR codes
- Extract invite code from URL
- Security: Validate domain

### Step 3: Update Waitlist Page
- Add 3 buttons for USC students
- Modal for QR scanner
- Modal for barcode scanner (reuse USCCardScanner)
- Modal for email entry

### Step 4: Integration Logic
Each option leads to /onboarding with proper parameters

---

## SECURITY CONSIDERATIONS

### QR Code Scanner:
- Validate URL domain (napalmsky.com or bumpin.io only)
- Extract inviteCode parameter
- Validate format (16 chars, A-Z0-9)
- Don't redirect to external sites

### Barcode Scanner:
- Already has all security (existing code)
- Requires admin code prompt

### Email Entry:
- Validate @usc.edu domain
- Requires admin code
- Validation on backend too

---

## ESTIMATED EFFORT

- Install library: 2 min
- Create QRCodeScanner: 30 min (~100 lines)
- Update waitlist page: 30 min (~80 lines)
- Testing: 20 min
- Total: ~1.5 hours, 2-3 commits

---

Ready to proceed?
1. Install html5-qrcode
2. Create QRCodeScanner component
3. Add 3 options to waitlist page
4. Test all paths
