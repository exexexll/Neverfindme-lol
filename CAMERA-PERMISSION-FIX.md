CAMERA PERMISSION ISSUE - ANALYSIS
===================================

Error in Console:
- QR scanner: Camera not connecting
- Barcode scanner: Quagga initialization errors
- 403 on /auth/guest: No invite code

Root Causes:
============

1. 403 Error on /auth/guest
   - User scanned QR successfully
   - Extracted inviteCode
   - Redirected to /onboarding?inviteCode=X
   - But then got 403
   - This means inviteCode is NOT being passed to API!

2. QR Camera Not Connecting
   - html5-qrcode library issue
   - Maybe needs user interaction first
   - Or permission denied

3. Barcode Scanner Issues
   - Quagga library warnings (normal)
   - But camera not starting

Need to check:
- Is inviteCode being extracted from URL properly?
- Is it being passed to API call?
- Camera permission flow

Checking code now...
