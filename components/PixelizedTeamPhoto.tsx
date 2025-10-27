'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

/**
 * Scattered Photo Collage Background
 * Haphazard polaroid-style layout with pixelated aesthetic
 * Inspired by scrapbook/mood board designs
 */

export function PixelizedTeamPhoto() {
  // Photo configurations: position, rotation, size
  // Scattered across the section with intentional overlaps
  const photos = [
    {
      src: '/team-photo.jpg',
      width: 280,
      height: 350,
      top: '5%',
      left: '3%',
      rotation: -8,
      zIndex: 3,
    },
    {
      src: '/team-photo2.jpg',
      width: 300,
      height: 380,
      top: '15%',
      left: '18%',
      rotation: 5,
      zIndex: 2,
    },
    {
      src: '/team-photo3.jpg',
      width: 260,
      height: 330,
      top: '45%',
      left: '8%',
      rotation: -12,
      zIndex: 4,
    },
    {
      src: '/team-photo4.jpg',
      width: 290,
      height: 360,
      top: '60%',
      left: '22%',
      rotation: 7,
      zIndex: 1,
    },
    {
      src: '/team-photo5.jpg',
      width: 270,
      height: 340,
      top: '25%',
      left: '32%',
      rotation: -5,
      zIndex: 5,
    },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Scattered Photos - Polaroid Style */}
      {photos.map((photo, index) => (
        <motion.div
          key={photo.src}
          initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: photo.rotation }}
          transition={{ 
            delay: index * 0.1,
            duration: 0.6,
            ease: [0.34, 1.56, 0.64, 1] // Bouncy easing
          }}
          className="absolute"
          style={{
            top: photo.top,
            left: photo.left,
            width: `${photo.width}px`,
            height: `${photo.height}px`,
            zIndex: photo.zIndex,
          }}
        >
          {/* Polaroid Frame */}
          <div 
            className="relative w-full h-full bg-white/95 p-3 shadow-2xl"
            style={{
              boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 1px 8px rgba(0,0,0,0.3)',
            }}
          >
            {/* Photo */}
            <div className="relative w-full h-[85%] overflow-hidden bg-black/10">
              <Image
                src={photo.src}
                alt="Team moments"
                fill
                className="object-cover opacity-60"
                style={{
                  imageRendering: 'pixelated',
                  filter: 'brightness(0.8) contrast(1.1) saturate(0.9)',
                }}
                sizes="300px"
              />
            </div>
            
            {/* Polaroid Bottom */}
            <div className="h-[15%] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-black/20" />
            </div>
          </div>
          
          {/* Tape Effect (random) */}
          {index % 2 === 0 && (
            <div 
              className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-8 bg-yellow-100/40 rotate-2"
              style={{
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)',
              }}
            />
          )}
        </motion.div>
      ))}
      
      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0c]/30 via-[#0a0a0c]/60 to-[#0a0a0c]/85 pointer-events-none" />
    </div>
  );
}

