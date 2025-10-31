SCANNER COMPONENTS - COMPLETE ANALYSIS
=======================================

## EXISTING COMPONENTS

### 1. USCCardScanner.tsx (EXISTS - Line 510)
Location: components/usc-verification/USCCardScanner.tsx
Purpose: Scans USC campus card BARCODE
Technology: Quagga2
Readers: codabar_reader, code_128_reader, code_39_reader
Detects: 14-digit barcode (USC ID + card number)
Used in: Onboarding (admin QR flow)

### 2. USCCardLogin.tsx (EXISTS)
Location: components/usc-verification/USCCardLogin.tsx
Purpose: Scans USC card for LOGIN (not signup)
Same technology as USCCardScanner

### 3. QRCodeScanner.tsx (DOES NOT EXIST)
Needs to be created for:
- Scanning QR codes (not barcodes)
- Extracting invite codes from QR
- Used on waitlist page

---

## WHAT NEEDS TO BE DONE

### Create QRCodeScanner Component
- Scan QR codes (contains URLs with inviteCode parameter)
- Extract inviteCode from URL
- Return the code to parent
- Security: Validate domain, format

### Waitlist Page Needs TWO Options:
1. Scan Admin QR Code → Use NEW QRCodeScanner
2. (Optional) Scan USC Card → Use EXISTING USCCardScanner

OR: Single unified scanner that handles both

---

## RECOMMENDATION

Create QRCodeScanner.tsx that:
- Uses Quagga2 (already installed)
- Configures for QR code detection
- Extracts invite code from QR URL
- Similar structure to USCCardScanner but simpler

Do NOT modify USCCardScanner (it's working perfectly)

---

Analyzing USCCardScanner structure to create QRCodeScanner...
