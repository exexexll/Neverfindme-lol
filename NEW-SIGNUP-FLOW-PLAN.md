NEW SIGNUP FLOW - SIMPLIFIED
=============================

Current Flow (Complex):
=======================
Waitlist → Scan → Extract code → Redirect → Check protections → Start onboarding

New Flow (Simple):
==================

Step 1: Waitlist Page
- Click "📱 Scan QR Code or Barcode to Sign Up"
- Modal: Choose scan method

Step 2: Scan
Option A: Scan QR Code
  - AdminQRScanner opens
  - Scan QR (admin or friend)
  - Extract inviteCode
  - Store in sessionStorage
  - Close scanner
  - Redirect: /onboarding?inviteCode=X

Option B: Scan USC Card
  - USCCardScanner opens
  - Scan card barcode
  - Extract USC ID
  - Store USC ID in sessionStorage
  - Close scanner
  - Redirect: /onboarding

Step 3: Onboarding Flow
1. Name & Gender
2. Capture Photo (with preview)
3. Capture Intro Video (with preview)
4. Optional USC Email (if USC user)
5. Done → Redirect to /main

Checks Needed:
==============
✅ QR Code: inviteCode in URL or sessionStorage
✅ USC Card: temp_usc_id in sessionStorage
✅ Both allow access to onboarding
✅ USC email step only for USC users
✅ All others skip to /main

Implementation:
===============
1. Verify QR scanner extracts code correctly
2. Verify USC card stores ID correctly
3. Ensure onboarding detects both methods
4. Optional email step logic
5. Final redirect to /main

Testing Scenarios:
==================
A. Admin QR → Onboarding → Name → Photo → Video → Email? → Main
B. Friend QR → Onboarding → Name → Photo → Video → Email? → Main  
C. USC Card → Onboarding → Name → Photo → Video → Email → Main

All should work seamlessly!
