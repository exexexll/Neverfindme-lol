/**
 * Client-Side Image Compression
 * Converts images to WebP format for 25-30% size reduction
 * Source: Google Developers - WebP is 25-34% smaller than JPEG
 */

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
}

/**
 * Compress image to WebP format
 * @param file - Original image blob
 * @param maxWidth - Maximum width (default: 800)
 * @param maxHeight - Maximum height (default: 800)
 * @param quality - Quality 0-1 (default: 0.85)
 */
export async function compressImage(
  file: Blob,
  maxWidth: number = 800,
  maxHeight: number = 800,
  quality: number = 0.85
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions (maintain aspect ratio)
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        // High quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first (best compression)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const result: CompressionResult = {
                blob,
                originalSize: file.size,
                compressedSize: blob.size,
                reductionPercent: ((1 - blob.size / file.size) * 100),
              };
              console.log('[Compression] Image:', 
                (file.size / 1024).toFixed(0), 'KB →',
                (blob.size / 1024).toFixed(0), 'KB',
                `(${result.reductionPercent.toFixed(1)}% reduction)`
              );
              resolve(result);
            } else {
              reject(new Error('Compression failed'));
            }
          },
          'image/webp',
          quality
        );
      } else {
        reject(new Error('Canvas context not available'));
      }
    };

    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

