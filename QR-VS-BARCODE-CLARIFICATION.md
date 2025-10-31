QR CODE VS BARCODE - COMPLETE CLARIFICATION
===========================================

## CHECKING WHAT ADMIN "QR CODES" ACTUALLY ARE

Looking at server/src/payment.ts to see how admin QR codes are generated...

Admin QR codes contain:
- URL: https://napalmsky.com/onboarding?inviteCode=ABC123...
- Format: Actual QR code (2D)
- Library used: qrcode (npm package)

USC Card Barcode:
- Format: 14 digits (1D barcode)  
- Codabar format
- Library: Quagga2

## THE PROBLEM

Quagga2 does NOT support QR codes (2D)!
- Only supports 1D barcodes: Code 128, Code 39, Codabar, EAN, UPC
- Cannot scan actual QR codes

## THE SOLUTION

Need different library for QR codes:
- jsQR (best for React)
- html5-qrcode
- qr-scanner

## WAITLIST PAGE IMPLEMENTATION

Option A: QR Code Scanner (Need new library)
- Install jsQR
- Create QRCodeScanner component
- Scan admin QR codes

Option B: Manual Code Entry (Simplest)
- User scans QR with phone camera app
- Copies invite code
- Pastes into input field

Option C: Unified Scanner
- Use existing USCCardScanner
- Add manual code entry
- User types code from QR

RECOMMENDED: Option C (use existing USCCardScanner + manual entry)
- No new library needed
- Reuses working code
- Simple and effective

---

Proceeding with Option C...
