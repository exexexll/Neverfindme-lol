/**
 * Chat Recording System
 * Captures video/screen for moderation evidence when user reports
 */

export class ChatRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private recordingStartTime: number = 0;
  
  /**
   * Start recording (called when user clicks "Report")
   * For video mode: Captures video stream
   * For text mode: Captures screen
   */
  async startRecording(mode: 'video' | 'text', videoElement?: HTMLVideoElement): Promise<boolean> {
    try {
      if (mode === 'video' && videoElement && videoElement.srcObject) {
        // Capture the existing video stream (remote user's video)
        this.stream = videoElement.srcObject as MediaStream;
      } else if (mode === 'text') {
        // Capture screen for text chat evidence
        this.stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1280, height: 720 },
          audio: false, // Don't capture audio for text mode
        });
      } else {
        console.error('[Recorder] No video source available');
        return false;
      }
      
      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'video/webm;codecs=vp8',
      });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      
      this.recordingStartTime = Date.now();
      this.mediaRecorder.start(1000); // Capture in 1s chunks
      
      console.log(`[Recorder] Started recording ${mode} mode`);
      return true;
    } catch (error) {
      console.error('[Recorder] Failed to start recording:', error);
      return false;
    }
  }
  
  /**
   * Stop recording and return blob
   */
  async stopRecording(): Promise<{ blob: Blob; durationSeconds: number } | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        const durationSeconds = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        
        console.log(`[Recorder] Stopped recording - ${durationSeconds}s, ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
        
        // Cleanup
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        
        resolve({ blob, durationSeconds });
      };
      
      this.mediaRecorder.stop();
    });
  }
  
  /**
   * Cancel recording without saving
   */
  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.chunks = [];
    console.log('[Recorder] Recording cancelled');
  }
  
  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

/**
 * Upload recording to Cloudinary
 */
export async function uploadRecording(
  blob: Blob,
  sessionToken: string,
  roomId: string,
  reportId: string
): Promise<{ recordingUrl: string; recordingPublicId: string } | null> {
  try {
    const formData = new FormData();
    formData.append('recording', blob, `recording-${roomId}-${Date.now()}.webm`);
    formData.append('roomId', roomId);
    formData.append('reportId', reportId);
    
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
    
    const response = await fetch(`${API_BASE}/media/upload-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    const data = await response.json();
    console.log('[Recorder] ✅ Recording uploaded to Cloudinary');
    
    return {
      recordingUrl: data.recordingUrl,
      recordingPublicId: data.recordingPublicId,
    };
  } catch (error) {
    console.error('[Recorder] Failed to upload recording:', error);
    return null;
  }
}

