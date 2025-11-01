WORKFLOW vs CODE - LINE BY LINE VERIFICATION
=============================================

## STEP 1: Waitlist Page - Scan Button

FILE: app/waitlist/page.tsx

Line 219-224: Button "Scan QR Code or Barcode to Sign Up"
```typescript
<button
  onClick={() => setShowScanChoice(true)}
  className="w-full rounded-xl bg-[#ffc46a]..."
>
  📱 Scan QR Code or Barcode to Sign Up
</button>
```

✅ Code matches workflow
Action: Opens choice modal
State: showScanChoice = true

---

## STEP 2: Choice Modal

FILE: app/waitlist/page.tsx

Line 299-353: Scan Choice Modal
Line 307: Modal title "Choose Scan Method"
Line 317-330: QR Code Button
```typescript
<button onClick={() => {
  setShowScanChoice(false);
  setShowQRScanner(true);
}}>
  📱 Scan QR Code
</button>
```

Line 332-345: USC Card Button
```typescript
<button onClick={() => {
  setShowScanChoice(false);
  setShowBarcodeScanner(true);
}}>
  🎓 Scan USC Card
</button>
```

✅ Code matches workflow
Two buttons open respective scanners

---

## STEP 3A: QR Code Scan Path

FILE: app/waitlist/page.tsx

Line 236-258: QR Scanner Modal
Line 248-255: AdminQRScanner Component
```typescript
<AdminQRScanner
  onScan={(inviteCode) => {
    console.log('[Waitlist] QR scanned:', inviteCode);
    setShowQRScanner(false);
    router.push(`/onboarding?inviteCode=${inviteCode}`);
  }}
  onClose={() => setShowQRScanner(false)}
/>
```

FILE: components/AdminQRScanner.tsx

Line 15-82: Scanner Logic
Line 29-62: Success callback
Line 34-51: URL extraction
```typescript
if (decodedText.startsWith('http')) {
  const url = new URL(decodedText);
  if (!url.hostname.includes('napalmsky.com') && 
      !url.hostname.includes('bumpin.io')) {
    setError('Invalid QR code domain');
    return;
  }
  const code = url.searchParams.get('inviteCode');
  if (code && /^[A-Z0-9]{16}$/i.test(code)) {
    scanner.clear();
    onScan(code.toUpperCase());
  }
}
```

✅ Code matches workflow
✅ Extracts inviteCode from QR
✅ Validates domain
✅ Calls onScan callback
✅ Redirects to /onboarding?inviteCode=X

---

## STEP 3B: USC Card Scan Path

FILE: app/waitlist/page.tsx

Line 260-297: Barcode Scanner Modal
Line 279-294: USCCardScanner Component
```typescript
<USCCardScanner
  onSuccess={(uscId, rawValue) => {
    console.log('[Waitlist] USC card scanned:', uscId);
    setShowBarcodeScanner(false);
    sessionStorage.setItem('temp_usc_id', uscId);
    sessionStorage.setItem('temp_usc_barcode', rawValue);
    sessionStorage.setItem('usc_card_verified', 'true');
    router.push('/onboarding');
  }}
/>
```

✅ Code matches workflow
✅ Stores USC ID in sessionStorage
✅ Redirects to /onboarding (no inviteCode)

---

## STEP 4: Onboarding Protection

FILE: app/onboarding/page.tsx

Line 76-146: Protection useEffect
Line 78-88: Get access credentials
```typescript
const inviteParam = params.get('inviteCode');
const session = getSession();
const storedInvite = sessionStorage.getItem('onboarding_invite_code');
const tempUsc = sessionStorage.getItem('temp_usc_id');
const uscEmailForVerification = sessionStorage.getItem('usc_email_for_verification');

const hasInviteCode = inviteParam || storedInvite;
const hasUscScan = tempUsc;
const hasEmailToVerify = uscEmailForVerification;
```

Line 99-111: Access check
```typescript
if (!hasInviteCode && !hasUscScan && !session && !hasEmailToVerify) {
  console.log('[Onboarding] BLOCKED - No access method found');
  console.log('[Onboarding] hasInviteCode:', hasInviteCode);
  console.log('[Onboarding] hasUscScan:', hasUscScan);
  console.log('[Onboarding] session:', !!session);
  console.log('[Onboarding] hasEmailToVerify:', hasEmailToVerify);
  router.push('/waitlist');
  return;
}
console.log('[Onboarding] ACCESS GRANTED');
```

✅ Code matches workflow
✅ QR users: hasInviteCode = true → ALLOWED
✅ USC users: hasUscScan = true → ALLOWED

Need to verify name/gender step next...

## STEP 5: Name & Gender

FILE: app/onboarding/page.tsx

Line 1147-1232: Name & Gender Step UI
Line 1163-1172: Name input
Line 1174-1215: Gender buttons (female/male/nonbinary/unspecified)
Line 1177-1202: Terms checkbox

Line 1210-1216: Continue Button
```typescript
<button
  onClick={handleNameSubmit}
  disabled={loading || !agreedToTerms}
>
  {loading ? 'Creating account...' : 'Continue'}
</button>
```

✅ Code matches workflow
Calls: handleNameSubmit()

---

## STEP 6: handleNameSubmit() - Account Creation

FILE: app/onboarding/page.tsx

Line 351-480: handleNameSubmit function

Line 352-377: Validation
```typescript
if (!name.trim()) {
  setError('Please enter your name');
  return;
}

if (!uscId) {
  if (needsUSCEmail && !uscEmail.trim()) {
    setError('USC email is required for this QR code');
    return;
  }
  if (needsUSCEmail && uscEmail.trim()) {
    if (!/^[^\s@]+@usc\.edu$/i.test(uscEmail.trim())) {
      setError('Please enter a valid @usc.edu email address');
      return;
    }
  }
}

if (!agreedToTerms) {
  setError('You must agree to the Terms...');
  return;
}
```

Line 382-407: API Call - USC Card User
```typescript
if (uscId) {
  console.log('[Onboarding] Creating guest account for USC card user');
  const res = await fetch('.../auth/guest-usc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.trim(),
      gender,
      inviteCode: inviteCode || undefined,
    }),
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to create account');
  }
  
  response = await res.json();
}
```

✅ Code matches workflow
✅ USC users call /auth/guest-usc
✅ inviteCode is optional (can be undefined)

Line 408-417: API Call - Regular User
```typescript
else {
  response = await createGuestAccount(
    name, 
    gender, 
    referralCode || undefined, 
    inviteCode || undefined,
    uscEmail || undefined
  );
}
```

✅ Code matches workflow
✅ Regular users call /auth/guest (via createGuestAccount)
✅ Must have inviteCode

Line 418-427: Save Session
```typescript
setSessionToken(response.sessionToken);
setUserId(response.userId);

saveSession({
  sessionToken: response.sessionToken,
  userId: response.userId,
  accountType: response.accountType,
});
```

Line 467: Next Step
```typescript
setStep('selfie');
```

✅ Code matches workflow
Account created → Moves to selfie

---

## STEP 7: Backend - USC Card Account Creation

FILE: server/src/auth.ts

Line 463-612: POST /guest-usc route

Line 464-475: Extract and validate inputs
```typescript
const { name, gender, inviteCode } = req.body;
const ip = req.userIp;

if (!name || !name.trim()) {
  return res.status(400).json({ error: 'Name is required' });
}

if (!['female', 'male', 'nonbinary', 'unspecified'].includes(gender)) {
  return res.status(400).json({ error: 'Invalid gender' });
}
```

Line 477-509: Invite Code Validation (OPTIONAL)
```typescript
let codeVerified = false;
if (inviteCode) {
  // Validate code
  const result = await store.useInviteCode(...);
  if (!result.success) {
    return res.status(400).json({ error: ... });
  }
  codeVerified = true;
} else {
  // USC card scan without invite code is VALID
  // Card itself is verification
  console.log('[Auth] No invite code - USC card is verification');
  codeVerified = true; // ✅ THIS IS THE FIX!
}
```

✅ Code matches workflow
✅ USC card users don't need inviteCode
✅ codeVerified = true anyway

Line 511-518: Generate 4-use invite code
Line 525-540: Create user object
```typescript
const user: User = {
  userId,
  name: name.trim(),
  gender,
  accountType: 'guest',
  paidStatus: codeVerified ? 'qr_verified' : 'unpaid',
  inviteCodeUsed: inviteCode || undefined,
  myInviteCode: newUserInviteCode,
  accountExpiresAt: expiresAt.getTime(),
  // USC ID will be set later
};
```

Line 545: Insert into database
Line 552-562: Create session
Line 564-580: Create invite code record

Line 582-610: Response
```typescript
res.json({
  userId,
  sessionToken,
  accountType: 'guest',
  paidStatus: codeVerified ? 'qr_verified' : 'unpaid',
  myInviteCode: newUserInviteCode,
  inviteCodeUsed: inviteCode,
});
```

✅ Code matches workflow
✅ Returns session data
✅ Frontend can proceed to selfie

---

VERIFICATION STATUS SO FAR:
===========================

✅ Waitlist button → Choice modal
✅ QR scan → Extract code → /onboarding?inviteCode=X
✅ Card scan → Store USC ID → /onboarding
✅ Protection allows both paths
✅ Name/Gender → POST /auth/guest-usc (USC) or /auth/guest (QR)
✅ Backend creates account
✅ Returns session
✅ Frontend moves to selfie step

NEXT: Verify photo/video/permanent steps...
