PHOTO/VIDEO CAPTURE DEBUG ANALYSIS
===================================

## ISSUE REPORTED

Error: "Load failed" in console during photo/video capture
Location: Onboarding process

## CHECKING IMPLEMENTATION

### Photo Capture (Line 490-554)

Current Flow:
1. captureSelfie() - Captures to canvas, creates data URL
2. Sets capturedPhoto state with data URL
3. Pauses camera (sets track.enabled = false)
4. Shows preview
5. User clicks confirm
6. confirmPhoto() - Converts data URL back to blob
7. Uploads

Potential Issues:
- ❓ Data URL too large?
- ❓ fetch(capturedPhoto) failing?
- ❓ Blob conversion error?
- ❓ Camera pause causing issues?

### Video Preview (Line 664-727)

Current Flow:
1. Recording stops
2. useEffect creates blob
3. Creates preview URL with URL.createObjectURL(blob)
4. Sets videoPreviewUrl
5. User clicks confirm
6. confirmVideo() uploads

Potential Issues:
- ❓ useEffect not triggering?
- ❓ Blob creation failing?
- ❓ URL.createObjectURL error?

---

Analyzing code for bugs...
