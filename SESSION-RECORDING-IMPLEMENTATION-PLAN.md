# Session Recording System - Implementation Plan

**Date**: October 27, 2025  
**Purpose**: Record all video/audio sessions for safety and moderation  
**Status**: PLANNING → IMPLEMENTATION

---

## ⚠️ LEGAL REQUIREMENTS (CRITICAL)

### California Two-Party Consent Law
**California Penal Code § 632**:
- **REQUIRES**: ALL parties consent to recording
- **Penalty**: Criminal offense if violated
- **Required**: Clear notice BEFORE recording starts

### Implementation Requirements:
1. ✅ **Explicit Consent Modal** - Before EVERY call
2. ✅ **Visible Recording Indicator** - Red dot always shown
3. ✅ **Terms of Service Update** - Mention recording
4. ✅ **Privacy Policy Update** - Data retention explained
5. ✅ **Opt-Out Option** - Users can decline (ends matchmaking)

---

## 🏗️ ARCHITECTURE

### Recording Flow:
```
Call Starts
    ↓
Consent Modal: "This call will be recorded for safety. Continue?"
    ↓
[Accept] → Recording starts (both video + audio)
[Decline] → Returns to matchmaking
    ↓
MediaRecorder captures stream
    ↓
Chunks saved every 10 seconds (in-memory buffer)
    ↓
Call Ends normally → Delete recording ✅
Call Reported → Upload recording to Cloudinary ✅
    ↓
Admin views recording in report panel
```

---

## 🎥 TECHNICAL IMPLEMENTATION

### Client-Side (Browser Recording)

#### 1. Capture Both Streams
```typescript
// Combine local + remote streams
const combinedStream = new MediaStream();

// Add local video/audio
localStream.getTracks().forEach(track => {
  combinedStream.addTrack(track);
});

// Add remote video/audio (when received)
remoteStream.getTracks().forEach(track => {
  combinedStream.addTrack(track);
});
```

**Problem**: Can't capture remote stream directly (WebRTC limitation)  
**Solution**: Record local only OR use server-side recording

#### 2. MediaRecorder Setup
```typescript
const recorder = new MediaRecorder(combinedStream, {
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 500000, // 500 kbps (low quality for safety)
  audioBitsPerSecond: 64000,  // 64 kbps
});

const chunks: Blob[] = [];

recorder.ondataavailable = (event) => {
  if (event.data.size > 0) {
    chunks.push(event.data);
  }
};

recorder.start(10000); // Save chunk every 10 seconds
```

#### 3. On Report: Upload Recording
```typescript
recorder.stop();

recorder.onstop = async () => {
  const recordingBlob = new Blob(chunks, { type: 'video/webm' });
  
  // Upload to Cloudinary
  const formData = new FormData();
  formData.append('file', recordingBlob, `session-${sessionId}.webm`);
  formData.append('upload_preset', 'session_recordings');
  
  const response = await fetch(
    'https://api.cloudinary.com/v1_1/YOUR_CLOUD/video/upload',
    { method: 'POST', body: formData }
  );
  
  const { secure_url } = await response.json();
  
  // Include in report
  await reportUser(userId, reason, sessionId, secure_url);
};
```

#### 4. On Normal End: Delete Recording
```typescript
recorder.stop();
chunks.length = 0; // Clear memory
console.log('[Recording] Session ended normally - recording deleted');
```

---

## 🖥️ SERVER-SIDE RECORDING (Alternative)

### Advantages:
- ✅ Can record both participants  
- ✅ Can't be bypassed by client
- ✅ More reliable
- ✅ Better quality control

### Disadvantages:
- ❌ Requires media server (Kurento, Janus, mediasoup)
- ❌ Expensive (CPU intensive)
- ❌ Complex setup
- ❌ Latency increase

### Estimated Cost:
- **100 concurrent calls** = 100 x 500 kbps = 50 Mbps
- **Recording server**: $200-500/month (dedicated)
- **Storage**: 500 MB per 500s call x 1000 calls/day = 500 GB/day
- **Cloudinary storage**: ~$50/month for 500 GB

**Recommendation**: Client-side only (local stream + report trigger)

---

## 💾 STORAGE STRATEGY

### Temporary Storage (During Call):
- **Location**: Browser memory (Blob array)
- **Size**: ~60 MB per 500s call (500 kbps)
- **Retention**: Until call ends
- **Cleanup**: Deleted if not reported

### Permanent Storage (If Reported):
- **Location**: Cloudinary video storage
- **Format**: video/webm (VP9 codec)
- **Size**: ~60 MB per call
- **Retention**: 90 days (then auto-delete)
- **Access**: Admins only

### Database Record:
```sql
ALTER TABLE reports ADD COLUMN recording_url VARCHAR(500);
ALTER TABLE reports ADD COLUMN recording_duration INTEGER; -- seconds
ALTER TABLE reports ADD COLUMN recording_size_bytes BIGINT;
ALTER TABLE reports ADD COLUMN recording_uploaded_at TIMESTAMP;
```

---

## 🔐 PRIVACY & SECURITY

### Data Protection:
1. ✅ **Encryption**: HTTPS for upload, Cloudinary encrypted storage
2. ✅ **Access Control**: Admins only (password protected)
3. ✅ **Retention Policy**: 90 days max, then auto-delete
4. ✅ **Anonymization**: After review, can be deleted
5. ✅ **GDPR Compliance**: User can request deletion

### Consent Mechanism:
```typescript
// Show BEFORE every call
<ConsentModal>
  <h2>Call Recording Notice</h2>
  <p>This call will be recorded for safety and moderation purposes.</p>
  <ul>
    <li>Recordings are only saved if a user is reported</li>
    <li>Stored securely for 90 days</li>
    <li>Viewable only by moderators</li>
    <li>Deleted automatically after review</li>
  </ul>
  <p>By clicking Continue, you consent to recording.</p>
  <button>Continue</button>
  <button>Decline (Return to Matchmaking)</button>
</ConsentModal>
```

### Recording Indicator:
```typescript
// Always visible during call
<div className="recording-indicator">
  <div className="red-dot animate-pulse" />
  <span>Recording for safety</span>
</div>
```

---

## 🎯 IMPLEMENTATION STEPS

### Phase 1: Client-Side Recording (Local Stream Only)
**Complexity**: Medium  
**Time**: 4-6 hours  
**Cost**: $0 (uses existing infrastructure)

**Files to Modify**:
1. `app/room/[roomId]/page.tsx` - Add MediaRecorder
2. `components/RecordingConsentModal.tsx` - New component
3. `lib/recording.ts` - Recording utilities
4. `server/src/report.ts` - Add recording_url field

**Steps**:
1. ✅ Create consent modal
2. ✅ Initialize MediaRecorder on call start
3. ✅ Store chunks in memory
4. ✅ Upload on report
5. ✅ Delete on normal end

### Phase 2: Terms & Policy Updates
**Complexity**: Low  
**Time**: 1 hour

**Files to Modify**:
1. `app/faq/page.tsx` - Add recording Q&A
2. `app/privacy-policy/page.tsx` - Add recording section
3. `app/terms-of-service/page.tsx` - Add recording consent

### Phase 3: Admin Panel Integration
**Complexity**: Low  
**Time**: 2 hours

**Files to Modify**:
1. `app/admin/page.tsx` - Add video player for recordings
2. `server/src/report.ts` - Include recording_url in response

### Phase 4: Cloudinary Upload Preset
**Complexity**: Low  
**Time**: 15 minutes

**Cloudinary Settings**:
```
Preset Name: session_recordings
Folder: bumpin/recordings
Access Mode: authenticated (admin only)
Resource Type: video
Format: webm
Max File Size: 100 MB
```

---

## 🚨 RISKS & MITIGATIONS

### Risk 1: Users Decline Consent
**Impact**: Can't match if everyone declines  
**Mitigation**: Clear benefits (safety, prevents bad actors)  
**Expected**: <5% decline rate

### Risk 2: Storage Costs
**Impact**: 1000 reports/month x 60 MB = 60 GB/month  
**Cost**: ~$5-10/month Cloudinary  
**Mitigation**: Auto-delete after 90 days

### Risk 3: Privacy Concerns
**Impact**: Users uncomfortable being recorded  
**Mitigation**:
- Only saved if reported (not all calls)
- Admins only (not public)
- 90-day auto-deletion
- Clear privacy policy

### Risk 4: Legal Compliance
**Impact**: Lawsuit if not compliant  
**Mitigation**:
- Two-party consent enforced
- Clear notice before recording
- Opt-out available
- Legal review recommended

---

## 📋 FAQ UPDATES NEEDED

### New Questions to Add:

**Q: Are calls recorded?**  
A: Yes, all calls are recorded for safety and moderation purposes. Recordings are only saved permanently if a user is reported. Otherwise, they are deleted immediately when the call ends. Recordings are stored securely and only viewable by moderators for up to 90 days.

**Q: Who can view recordings?**  
A: Only platform administrators and moderators can view recordings, and only when reviewing reports. Recordings are never made public and are protected by encryption and access controls.

**Q: How long are recordings stored?**  
A: Recordings are stored for up to 90 days after a report is filed, then automatically deleted. If a report is resolved and closed, the recording can be deleted sooner.

**Q: Can I decline being recorded?**  
A: Before each call, you must consent to recording. If you decline, you'll be returned to matchmaking. Recording is required for all calls to maintain platform safety and protect all users.

**Q: What if I was recorded unfairly?**  
A: If you believe a recording was used improperly, contact support@bumpin.com. We take privacy seriously and will investigate any misuse by moderators.

---

## 🎯 RECOMMENDATION

### Recommended Approach: **Local Stream Recording Only**

**Pros**:
- ✅ No additional infrastructure
- ✅ Low cost ($0-10/month storage)
- ✅ Simple implementation
- ✅ Quick to deploy (1 day)

**Cons**:
- ⚠️ Only records speaker's perspective
- ⚠️ Can't see what partner showed on screen
- ⚠️ Client-side (could be disabled)

**Good Enough**: YES  
- Most reports are about behavior/language
- Audio is most important evidence
- Visual confirmation (selfie) already in report
- Server-side would be 10x more complex

---

## ✅ NEXT STEPS

1. **Legal Review**: Confirm two-party consent implementation
2. **Implement Phase 1**: Client-side local stream recording
3. **Update Policies**: FAQ, Terms, Privacy Policy
4. **Test**: Record → Report → Admin View
5. **Deploy**: After legal clearance

**Estimated Total Time**: 2 days  
**Estimated Cost**: $10/month

Would you like me to proceed with implementation?

