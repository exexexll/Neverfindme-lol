FULL PIPELINE TRACE - FINDING THE BUG
======================================

USC CARD FLOW:
==============

Step 1: Waitlist - Scan USC Card
- User clicks "Scan QR Code or Barcode"
- Chooses "Scan USC Card"
- USCCardScanner opens
- Scans card successfully
- Stores: temp_usc_id, temp_usc_barcode, usc_card_verified
- Redirects: router.push('/onboarding')

Step 2: Onboarding - Protection Check
- useEffect runs (line 77-146)
- Reads: tempUsc = sessionStorage.getItem('temp_usc_id')
- hasUscScan = tempUsc (TRUE if card was scanned)
- Check: if (!hasInviteCode && !hasUscScan && !session && !hasEmailToVerify)
- Result: hasUscScan is TRUE, so NOT BLOCKED ✅
- User sees name/gender step

Step 3: Name & Gender
- User enters name and gender
- Clicks continue
- Calls: handleNameGender() function

CRITICAL QUESTION:
What does handleNameGender() do?
Does it call POST /auth/guest?
Does POST /auth/guest REQUIRE inviteCode?

If YES → THAT'S THE BUG!

USC card users don't have inviteCode, so backend will reject them!

Need to check:
1. What API does handleNameGender call?
2. Does it pass inviteCode?
3. What if there's no inviteCode for USC users?

Finding the bug now...
