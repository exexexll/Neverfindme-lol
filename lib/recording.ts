/**
 * Session Recording Utilities
 * Records local video/audio stream for safety and moderation
 * Complies with California two-party consent law
 */

export interface RecordingManager {
  recorder: MediaRecorder | null;
  chunks: Blob[];
  isRecording: boolean;
  startTime: number | null;
}

/**
 * Initialize MediaRecorder for session recording
 * Records local stream only (user's perspective)
 */
export function createRecorder(stream: MediaStream): RecordingManager | null {
  try {
    // Check browser support
    if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      console.warn('[Recording] VP9 not supported, trying VP8');
      if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        console.error('[Recording] No WebM support - recording disabled');
        return null;
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm;codecs=vp8';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 500000, // 500 kbps (lower quality for storage)
      audioBitsPerSecond: 64000,  // 64 kbps
    });

    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        console.log(`[Recording] Chunk saved: ${Math.round(event.data.size / 1024)} KB`);
      }
    };

    recorder.onerror = (event: any) => {
      console.error('[Recording] Error:', event.error);
    };

    console.log(`[Recording] Recorder created with ${mimeType}`);

    return {
      recorder,
      chunks,
      isRecording: false,
      startTime: null,
    };
  } catch (error) {
    console.error('[Recording] Failed to create recorder:', error);
    return null;
  }
}

/**
 * Start recording
 */
export function startRecording(manager: RecordingManager): boolean {
  if (!manager.recorder) return false;

  try {
    // Record in 10-second chunks for better reliability
    manager.recorder.start(10000);
    manager.isRecording = true;
    manager.startTime = Date.now();
    console.log('[Recording] ▶️ Recording started');
    return true;
  } catch (error) {
    console.error('[Recording] Failed to start:', error);
    return false;
  }
}

/**
 * Stop recording
 */
export function stopRecording(manager: RecordingManager): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!manager.recorder || !manager.isRecording) {
      resolve(null);
      return;
    }

    manager.recorder.onstop = () => {
      const blob = new Blob(manager.chunks, { type: 'video/webm' });
      const durationSeconds = manager.startTime 
        ? Math.floor((Date.now() - manager.startTime) / 1000)
        : 0;
      
      console.log(`[Recording] ⏹️ Recording stopped: ${Math.round(blob.size / 1024 / 1024)} MB, ${durationSeconds}s`);
      resolve(blob);
    };

    manager.recorder.stop();
    manager.isRecording = false;
  });
}

/**
 * Delete recording (clear memory)
 */
export function deleteRecording(manager: RecordingManager): void {
  manager.chunks.length = 0;
  manager.startTime = null;
  console.log('[Recording] 🗑️ Recording deleted from memory');
}

/**
 * Upload recording to Cloudinary (only when reported)
 */
export async function uploadRecording(
  blob: Blob,
  sessionId: string,
  roomId: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', blob, `session-${sessionId}.webm`);
    formData.append('upload_preset', 'bumpin_unsigned'); // Use your Cloudinary preset
    formData.append('folder', 'bumpin/recordings');
    formData.append('resource_type', 'video');

    console.log(`[Recording] Uploading ${Math.round(blob.size / 1024 / 1024)} MB to Cloudinary...`);

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dxylw3zyp';
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Recording] ✅ Uploaded: ${data.secure_url}`);
    
    return data.secure_url;
  } catch (error) {
    console.error('[Recording] Upload failed:', error);
    return null;
  }
}

/**
 * Get recording duration
 */
export function getRecordingDuration(manager: RecordingManager): number {
  if (!manager.startTime) return 0;
  return Math.floor((Date.now() - manager.startTime) / 1000);
}

/**
 * Get recording size
 */
export function getRecordingSize(manager: RecordingManager): number {
  return manager.chunks.reduce((total, chunk) => total + chunk.size, 0);
}

