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

    // Photo configurations - scattered, NO overlap with center text
    const photoConfigs = [
      // Left side
      { src: '/team-photo.jpg', width: 240, height: 300, top: '8%', left: '2%', rotation: -8, zIndex: 3 },
      { src: '/team-photo2.jpg', width: 220, height: 280, top: '55%', left: '5%', rotation: 6, zIndex: 2 },
      
      // Right side  
      { src: '/team-photo3.jpg', width: 230, height: 290, top: '5%', right: '3%', left: 'auto', rotation: -10, zIndex: 4 },
      { src: '/team-photo4.jpg', width: 250, height: 310, top: '45%', right: '8%', left: 'auto', rotation: 8, zIndex: 1 },
      
      // Bottom right (moved from center to avoid text overlap)
      { src: '/team-photo5.jpg', width: 200, height: 250, top: '70%', right: '15%', left: 'auto', rotation: -6, zIndex: 5 },
    ];

    // Create regular Image elements (NO pixelation, just dim)
    photoConfigs.forEach((config, index) => {
      const photoDiv = document.createElement('div');
      photoDiv.className = 'absolute polaroid-photo';
      photoDiv.style.top = config.top;
      if (config.left !== 'auto') photoDiv.style.left = config.left;
      if ((config as any).right) photoDiv.style.right = (config as any).right;
      photoDiv.style.width = `${config.width}px`;
      photoDiv.style.height = `${config.height}px`;
      photoDiv.style.transform = `rotate(${config.rotation}deg)`;
      photoDiv.style.zIndex = String(config.zIndex);
      photoDiv.style.animation = `fadeInBounce 0.6s ease-out ${index * 0.1}s both`;
      photoDiv.style.mixBlendMode = 'normal'; // Allows layering visibility

      // Polaroid frame (responsive opacity, semi-transparent for layering)
      const frame = document.createElement('div');
      frame.className = 'w-full h-full p-2.5';
      // Almost invisible on mobile
      if (window.innerWidth < 768) {
        frame.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'; // Very dim on mobile
        frame.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      } else {
        frame.style.backgroundColor = 'rgba(255, 255, 255, 0.75)'; // Semi-transparent for layering
        frame.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.15)';
      }
      frame.style.backdropFilter = 'blur(4px)'; // Subtle blur for depth

      // Image container (regular image, very dim)
      const imgContainer = document.createElement('div');
      imgContainer.className = 'relative w-full h-[85%] overflow-hidden bg-black/5';
      
      const imgEl = document.createElement('img');
      imgEl.src = config.src;
      imgEl.alt = 'Team moments';
      imgEl.className = 'w-full h-full object-cover';
      // Responsive opacity: almost invisible on mobile, visible on desktop
      if (window.innerWidth < 768) {
        imgEl.style.opacity = '0.08'; // Almost invisible on mobile
      } else {
        imgEl.style.opacity = '0.35'; // Visible on desktop
      }
      imgEl.style.filter = 'brightness(0.75) contrast(1.15) saturate(0.8)';
      
      imgContainer.appendChild(imgEl);
      frame.appendChild(imgContainer);

      // Bottom strip
      const bottom = document.createElement('div');
      bottom.className = 'h-[15%] flex items-center justify-center';
      bottom.innerHTML = '<div class="w-2 h-2 rounded-full bg-black/20"></div>';
      frame.appendChild(bottom);

      photoDiv.appendChild(frame);

      // Minimal tape (cleaner look)
      if (index % 2 === 0) {
        const tape = document.createElement('div');
        tape.className = 'absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 bg-white/25 rotate-1';
        tape.style.boxShadow = 'inset 0 1px 1px rgba(0,0,0,0.05)';
        photoDiv.appendChild(tape);
      }

      containerRef.current?.appendChild(photoDiv);
      
      console.log(`[Photos] Photo ${index + 1} added (no pixelation, barely visible)`);
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
      
      {/* Desktop only gradient (mobile has no photos, no gradient needed) */}
      <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-[#0a0a0c]/15 via-[#0a0a0c]/40 to-[#0a0a0c]/70 pointer-events-none" />
    </>
  );
}

