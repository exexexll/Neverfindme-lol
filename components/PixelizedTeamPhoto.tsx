'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Scattered Pixelized Photo Collage
 * Combines 2004 Facebook low-res pixelated aesthetic with polaroid collage
 * Heavy pixelation (32x32 grid) like original thefacebook.com profile pics
 */

interface PixelatedPhoto {
  canvas: HTMLCanvasElement;
  src: string;
  width: number;
  height: number;
  top: string;
  left: string;
  rotation: number;
  zIndex: number;
}

export function PixelizedTeamPhoto() {
  const containerRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<PixelatedPhoto[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Photo configurations - scattered placement
    const photoConfigs = [
      { src: '/team-photo.jpg', width: 280, height: 350, top: '5%', left: '3%', rotation: -8, zIndex: 3 },
      { src: '/team-photo2.jpg', width: 300, height: 380, top: '15%', left: '18%', rotation: 5, zIndex: 2 },
      { src: '/team-photo3.jpg', width: 260, height: 330, top: '45%', left: '8%', rotation: -12, zIndex: 4 },
      { src: '/team-photo4.jpg', width: 290, height: 360, top: '60%', left: '22%', rotation: 7, zIndex: 1 },
      { src: '/team-photo5.jpg', width: 270, height: 340, top: '25%', left: '32%', rotation: -5, zIndex: 5 },
    ];

    // Pixelize each photo using canvas (2004 Facebook style)
    photoConfigs.forEach((config, index) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      // HEAVY pixelation like 2004 Facebook (32x32 grid)
      const pixelSize = 32; // Low-res like original Facebook profile pics
      canvas.width = pixelSize;
      canvas.height = pixelSize;

      const img = new Image();
      img.crossOrigin = '';

      img.onload = () => {
        // Downsample to 32x32 (blocky, mosaic effect)
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, pixelSize, pixelSize);

        // Color quantization (16 steps - very blocky)
        const imageData = ctx.getImageData(0, 0, pixelSize, pixelSize);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.floor(data[i] / 16) * 16;
          data[i + 1] = Math.floor(data[i + 1] / 16) * 16;
          data[i + 2] = Math.floor(data[i + 2] / 16) * 16;
        }

        ctx.putImageData(imageData, 0, 0);

        // Add to DOM
        const photoDiv = document.createElement('div');
        photoDiv.className = 'absolute polaroid-photo';
        photoDiv.style.top = config.top;
        photoDiv.style.left = config.left;
        photoDiv.style.width = `${config.width}px`;
        photoDiv.style.height = `${config.height}px`;
        photoDiv.style.transform = `rotate(${config.rotation}deg)`;
        photoDiv.style.zIndex = String(config.zIndex);
        photoDiv.style.animation = `fadeInBounce 0.6s ease-out ${index * 0.1}s both`;

        // Polaroid frame
        const frame = document.createElement('div');
        frame.className = 'w-full h-full bg-white/90 p-3';
        frame.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6), 0 1px 8px rgba(0,0,0,0.4)';

        // Canvas container
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'relative w-full h-[85%] overflow-hidden bg-black/5';
        
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.imageRendering = 'pixelated';
        canvas.style.objectFit = 'cover';
        
        canvasContainer.appendChild(canvas);
        frame.appendChild(canvasContainer);

        // Bottom strip
        const bottom = document.createElement('div');
        bottom.className = 'h-[15%] flex items-center justify-center';
        bottom.innerHTML = '<div class="w-2 h-2 rounded-full bg-black/20"></div>';
        frame.appendChild(bottom);

        photoDiv.appendChild(frame);

        // Tape (alternating)
        if (index % 2 === 0) {
          const tape = document.createElement('div');
          tape.className = 'absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-8 bg-yellow-100/30 rotate-2';
          tape.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.1)';
          photoDiv.appendChild(tape);
        }

        containerRef.current?.appendChild(photoDiv);
        
        console.log(`[PixelArt] Photo ${index + 1} pixelized (32x32 - Facebook 2004 style)`);
      };

      img.onerror = () => {
        console.warn(`[PixelArt] Failed to load: ${config.src}`);
      };

      img.src = config.src;
    });

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInBounce {
        0% { opacity: 0; transform: scale(0.8) rotate(0deg); }
        60% { transform: scale(1.05); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      style.remove();
    };
  }, []);

  return (
    <>
      {/* Photo Container */}
      <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden" />
      
      {/* Dark gradient overlay (lighter so photos visible) */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0c]/20 via-[#0a0a0c]/50 to-[#0a0a0c]/75 pointer-events-none" />
    </>
  );
}

