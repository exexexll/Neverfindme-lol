VIDEO PREVIEW ISSUE - DEBUGGING
================================

Issue: Can't replay video during onboarding
Location: Video step with preview

Checking code:

Line 1405-1413 in app/onboarding/page.tsx:
```typescript
<video
  ref={videoPreviewRef}
  src={videoPreviewUrl}
  controls
  autoPlay
  playsInline
  className="h-full w-full object-contain bg-black"
  style={{ display: 'block' }}
/>
```

This should allow replay since controls={true}

Potential issues:
1. Blob URL revoked too early?
2. Video element not properly initialized?
3. Browser autoplay policy blocking?
4. playsInline required but missing?

Checking blob URL creation and cleanup...
