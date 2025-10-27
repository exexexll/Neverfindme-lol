'use client';

import { useEffect, useRef } from 'react';

/**
 * High-Quality Pixelized Team Photo Background
 * Uses Canvas API to create identical pixel art from source image
 * Maintains all details with high pixel density (100x100 grid)
 */

export function PixelizedTeamPhoto() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // High resolution for detail preservation
    const pixelGrid = 120; // 120x120 grid (high quality)
    canvas.width = pixelGrid;
    canvas.height = pixelGrid;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Draw image at small size (downsampling creates pixelation)
      ctx.imageSmoothingEnabled = false; // Critical for pixel art
      ctx.drawImage(img, 0, 0, pixelGrid, pixelGrid);

      // OPTIONAL: Apply color reduction for more pixel art feel
      const imageData = ctx.getImageData(0, 0, pixelGrid, pixelGrid);
      const data = imageData.data;

      // Reduce color palette (optional - makes it more "pixel art")
      for (let i = 0; i < data.length; i += 4) {
        // Reduce to 32 color steps (256 / 8 = 32 shades per channel)
        data[i] = Math.floor(data[i] / 8) * 8;       // Red
        data[i + 1] = Math.floor(data[i + 1] / 8) * 8; // Green
        data[i + 2] = Math.floor(data[i + 2] / 8) * 8; // Blue
      }

      ctx.putImageData(imageData, 0, 0);
      console.log('[PixelArt] High-quality pixelization complete (120x120 grid)');
    };

    img.onerror = () => {
      console.warn('[PixelArt] Image not found - using fallback gradient');
      // Fallback: Draw gradient if image not available
      const gradient = ctx.createRadialGradient(
        pixelGrid / 2, pixelGrid / 2, 0,
        pixelGrid / 2, pixelGrid / 2, pixelGrid / 2
      );
      gradient.addColorStop(0, '#2a2a2a');
      gradient.addColorStop(0.5, '#1a1a1a');
      gradient.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, pixelGrid, pixelGrid);
    };

    // Load your team photo
    img.src = '/team-photo.jpg'; // Add your team selfie here
  }, []);

  return (
    <div className="absolute inset-0">
      {/* Canvas renders at small size, CSS scales it up with pixelated rendering */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full opacity-[0.15]"
        style={{
          imageRendering: 'pixelated', // Critical: prevents blurring on upscale
          filter: 'brightness(0.5) contrast(1.3)',
        }}
      />
      
      {/* Gradient overlay for text readability */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c]/70 via-transparent to-[#0a0a0c]/70"
      />
    </div>
  );
}

