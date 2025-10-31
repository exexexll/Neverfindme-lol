USC PORTAL ON WAITLIST - COMPLETE IMPLEMENTATION PLAN
======================================================

## REQUIREMENTS

1. Add USC student portal to waitlist page
2. Replace text with actual functionality:
   - Scan QR code option
   - Scan barcode option
3. Direct USC signup from waitlist (bypass homepage)
4. Integrate with existing USC onboarding code
5. Cover all vulnerabilities
6. Check anti-tab rollback

---

## PROPOSED DESIGN

### Waitlist Page Layout:

```
┌─────────────────────────────────────┐
│     Join the Waitlist               │
│  (Regular waitlist form)            │
│  - Name, Email, State, School       │
│  [Join Waitlist] button             │
├─────────────────────────────────────┤
│         OR                          │
├─────────────────────────────────────┤
│   USC Students - Instant Access     │
│                                     │
│  [Scan QR Code] [Scan USC Card]    │
│                                     │
│  Already have account? Log in      │
└─────────────────────────────────────┘
```

---

## PIPELINE FROM WAITLIST

### PATH A: Scan QR Code
```
1. User on /waitlist
2. Clicks "Scan QR Code" button
3. Show QR scanner modal
4. User scans admin QR code
5. Extract inviteCode from QR
6. Redirect to: /onboarding?inviteCode=ADMIN16CHARS
7. Continue with normal admin QR flow
8. ✅ USC welcome popup → Card scan OR email
```

### PATH B: Scan USC Card Directly
```
1. User on /waitlist
2. Clicks "Scan USC Card" button
3. Show barcode scanner modal
4. User scans campus card barcode
5. Extract USC ID
6. Store in sessionStorage: temp_usc_id
7. Need admin invite code somehow... ❌ PROBLEM!

Issue: USC card scan requires admin invite code
- Can't scan card without admin QR first
- Need to validate admin code exists

Solution: 
- "Scan USC Card" should show message:
  "USC students: Please scan the admin QR code at campus events first"
- OR remove this button
- Only keep "Scan QR Code"
```

RECOMMENDED: Only add "Scan QR Code" button (not card button)

---

## INTEGRATION POINTS WITH EXISTING CODE

### 1. QR Scanner Component
- Exists: components for USC card scanner
- Need: QR code scanner component
- Can reuse: Quagga2 library (supports QR codes)

Create: components/QRCodeScanner.tsx
- Detects QR codes (not barcodes)
- Extracts URL from QR
- Parses inviteCode parameter
- Returns invite code

### 2. Modal Component
- Exists: Multiple modals in app
- Need: Modal for scanner
- Integration: Add state in waitlist page
  ```typescript
  const [showQRScanner, setShowQRScanner] = useState(false);
  ```

### 3. Invite Code Extraction
- QR code contains: https://napalmsky.com/onboarding?inviteCode=ABC123...
- Need to parse URL and extract inviteCode param
- Validation: Check if 16 chars, A-Z0-9

### 4. Redirect Logic
- After scanning QR → Get invite code
- Redirect to: /onboarding?inviteCode=CODE
- Existing onboarding flow takes over
- ✅ No changes to onboarding needed

---

## VULNERABILITIES TO COVER

### VULN 1: Fake QR Codes
Attack: User shows QR with invalid URL
Fix: 
- Validate URL domain (napalmsky.com or bumpin.io only)
- Validate inviteCode format
- Don't redirect to external sites

### VULN 2: XSS via QR Code
Attack: QR contains: javascript:alert('xss')
Fix:
- Parse URL with URL() constructor
- Validate protocol is http/https
- Sanitize invite code (A-Z0-9 only)

### VULN 3: Malicious Redirect
Attack: QR contains: /onboarding?redirect=evil.com
Fix:
- Only extract inviteCode parameter
- Ignore other parameters
- Hard-coded redirect to /onboarding

### VULN 4: Rate Limit Bypass
Attack: Scan 1000 QR codes rapidly
Fix:
- Rate limit QR scans (10/min/IP)
- Rate limit onboarding access (already has protection)

### VULN 5: Scanner Always On
Attack: Leave scanner running to spy on other QR codes
Fix:
- Auto-timeout after 2 minutes
- Stop camera when modal closes
- Release camera permissions

---

## ANTI-TAB ROLLBACK CHECK

### Onboarding Page (line 112-147):

```typescript
useEffect(() => {
  if (onboardingComplete) return;
  
  // 1. Prevent tab close/refresh
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = 'Your profile is not complete yet...';
  };
  
  // 2. Prevent back/forward navigation
  const handlePopState = (e: PopStateEvent) => {
    if (!onboardingComplete) {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      alert('Please complete your profile...');
    }
  };
  
  // 3. Intercept Backspace key
  // 4. History trap (pushState every 500ms)
  
  return () => {
    // Cleanup listeners
  };
}, [onboardingComplete]);
```

VERIFICATION: ✅ Anti-rollback IS implemented
- Prevents tab close
- Prevents back button
- Prevents keyboard shortcuts
- Continuous history trap

---

## IMPLEMENTATION PLAN

### Step 1: Create QR Code Scanner Component

```typescript
// components/QRCodeScanner.tsx

'use client';

import { useEffect, useRef } from 'react';
import Quagga from '@ericblade/quagga2';

export function QRCodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  
  useEffect(() => {
    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: scannerRef.current,
        constraints: {
          facingMode: 'environment'
        }
      },
      decoder: {
        readers: ['qr_code_reader'] // QR codes, not barcodes
      }
    }, (err) => {
      if (err) {
        console.error('QR Scanner init failed:', err);
        return;
      }
      Quagga.start();
    });
    
    Quagga.onDetected((result) => {
      const qrData = result.codeResult.code;
      
      // Validate and extract invite code
      try {
        const url = new URL(qrData);
        
        // SECURITY: Only allow our domains
        if (!url.hostname.includes('napalmsky.com') && 
            !url.hostname.includes('bumpin.io')) {
          console.error('Invalid QR domain');
          return;
        }
        
        // Extract inviteCode
        const inviteCode = url.searchParams.get('inviteCode');
        if (inviteCode && /^[A-Z0-9]{16}$/.test(inviteCode)) {
          Quagga.stop();
          onScan(inviteCode);
        }
      } catch (e) {
        console.error('Invalid QR URL');
      }
    });
    
    // Auto-timeout after 2 minutes
    const timeout = setTimeout(() => {
      Quagga.stop();
      onClose();
    }, 120000);
    
    return () => {
      clearTimeout(timeout);
      Quagga.stop();
    };
  }, [onScan, onClose]);
  
  return (
    <div ref={scannerRef} className="w-full aspect-video bg-black" />
  );
}
```

### Step 2: Modify Waitlist Page

```typescript
// app/waitlist/page.tsx

const [showQRScanner, setShowQRScanner] = useState(false);

const handleQRScan = (inviteCode: string) => {
  console.log('[Waitlist] QR scanned, invite code:', inviteCode);
  setShowQRScanner(false);
  // Redirect to onboarding with code
  router.push(`/onboarding?inviteCode=${inviteCode}`);
};

// In JSX, add after waitlist form:
<div className="relative">
  <div className="flex items-center gap-4 my-6">
    <div className="flex-1 border-t border-white/10"></div>
    <span className="text-[#eaeaf0]/50 text-sm">OR</span>
    <div className="flex-1 border-t border-white/10"></div>
  </div>
  
  <div className="space-y-4">
    <h2 className="text-center font-playfair text-2xl font-bold text-[#eaeaf0]">
      USC Students
    </h2>
    <p className="text-center text-[#eaeaf0]/70 text-sm">
      Instant access with admin QR code
    </p>
    
    <button
      onClick={() => setShowQRScanner(true)}
      className="w-full rounded-xl bg-blue-500 px-6 py-3 font-bold text-white hover:bg-blue-600 transition-all"
    >
      📱 Scan Admin QR Code
    </button>
    
    <p className="text-center text-xs text-[#eaeaf0]/50">
      Get QR codes at USC campus events
    </p>
  </div>
</div>

{showQRScanner && (
  <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
    <div className="max-w-2xl w-full">
      <QRCodeScanner 
        onScan={handleQRScan}
        onClose={() => setShowQRScanner(false)}
      />
      <button
        onClick={() => setShowQRScanner(false)}
        className="mt-4 w-full rounded-xl bg-white/10 px-6 py-3"
      >
        Cancel
      </button>
    </div>
  </div>
)}
```

---

## SECURITY IMPLEMENTATION

### 1. URL Validation
```typescript
const url = new URL(qrData);
if (!url.hostname.includes('napalmsky.com') && 
    !url.hostname.includes('bumpin.io')) {
  throw new Error('Invalid domain');
}
```

### 2. Invite Code Validation
```typescript
if (inviteCode && /^[A-Z0-9]{16}$/.test(inviteCode)) {
  // Valid
}
```

### 3. Rate Limiting
- Reuse existing scan rate limit (10/min/IP)
- Already implemented in USC barcode scanner

### 4. Camera Release
```typescript
return () => {
  Quagga.stop();
  Quagga.CameraAccess.release();
};
```

### 5. Auto-Timeout
```typescript
setTimeout(() => {
  Quagga.stop();
  onClose();
}, 120000); // 2 minutes
```

---

## ESTIMATED EFFORT

QR Scanner Component: 1 hour (~150 lines)
Waitlist Page Integration: 30 min (~50 lines)
Security Testing: 30 min
Total: ~2 hours, 3-4 commits

Ready to implement?
