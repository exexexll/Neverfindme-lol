/**
 * Video Compression with FFmpeg.wasm
 * Browser-side H.264 transcoding for 40-50% file size reduction
 * Source: coderunner.io - 60%+ reduction with CRF 23
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;

/**
 * Initialize FFmpeg (loads ~30MB wasm files)
 * Only loads once, then reused
 */
export async function initFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  if (isLoading) {
    // Wait for existing load
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (ffmpegInstance) {
          clearInterval(check);
          resolve(ffmpegInstance);
        }
      }, 100);
    });
    return ffmpegInstance!;
  }

  isLoading = true;
  console.log('[FFmpeg] Loading...');

  const ffmpeg = new FFmpeg();
  
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  ffmpeg.on('progress', ({ progress }) => {
    const percent = Math.round(progress * 100);
    onProgress?.(percent);
  });

  try {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    console.log('[FFmpeg] Loaded successfully');
    ffmpegInstance = ffmpeg;
    isLoading = false;
    return ffmpeg;
  } catch (error) {
    isLoading = false;
    console.error('[FFmpeg] Load failed:', error);
    throw error;
  }
}

/**
 * Compress video with H.264 encoding
 * @param file - Input video blob
 * @param onProgress - Progress callback (0-100)
 * @returns Compressed video blob
 */
export async function compressVideo(
  file: Blob,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const ffmpeg = await initFFmpeg(onProgress);

  try {
    console.log('[Compression] Starting... Original:', (file.size / 1024 / 1024).toFixed(2), 'MB');

    // Write input
    await ffmpeg.writeFile('input.webm', await fetchFile(file));

    // Compress: H.264, 720p, CRF 23 (optimal quality/size balance)
    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'libx264',        // H.264 codec
      '-preset', 'medium',       // Balance speed vs compression
      '-crf', '23',              // Quality (23 = good, per research)
      '-vf', 'scale=1280:720',   // 720p
      '-c:a', 'aac',             // AAC audio
      '-b:a', '128k',            // 128kbps audio
      '-movflags', '+faststart', // Streaming optimization
      'output.mp4'
    ]);

    // Read output
    const data = await ffmpeg.readFile('output.mp4');
    // Convert Uint8Array to regular array buffer for Blob
    const compressed = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

    console.log('[Compression] Complete!',
      'Original:', (file.size / 1024 / 1024).toFixed(2), 'MB',
      '→ Compressed:', (compressed.size / 1024 / 1024).toFixed(2), 'MB',
      `(${((1 - compressed.size / file.size) * 100).toFixed(1)}% reduction)`
    );

    // Cleanup
    await ffmpeg.deleteFile('input.webm');
    await ffmpeg.deleteFile('output.mp4');

    return compressed;
  } catch (error) {
    console.error('[Compression] Failed:', error);
    throw error;
  }
}

