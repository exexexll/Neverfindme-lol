'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Firework {
  id: string;
  x: number;
  y: number;
}

export function FireworkStars() {
  const [fireworks, setFireworks] = useState<Firework[]>([]);

  useEffect(() => {
    // Generate continuous fireworks
    const generateFirework = () => {
      const newFirework: Firework = {
        id: `fw-${Date.now()}-${Math.random()}`,
        x: 10 + Math.random() * 80, // Random x: 10-90%
        y: 15 + Math.random() * 70, // Random y: 15-85%
      };
      
      setFireworks(prev => [...prev, newFirework]);
      
      // Remove after animation completes (2.5 seconds)
      setTimeout(() => {
        setFireworks(prev => prev.filter(fw => fw.id !== newFirework.id));
      }, 2500);
    };

    // Initial fireworks
    for (let i = 0; i < 3; i++) {
      setTimeout(generateFirework, i * 600);
    }

    // Continuous generation - new firework every 800ms
    const interval = setInterval(generateFirework, 800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {fireworks.map((fw) => (
          <Firework key={fw.id} x={fw.x} y={fw.y} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Firework({ x, y }: { x: number; y: number }) {
  // Generate 12 stars radiating outward for fuller explosion
  const starCount = 12;
  const stars = Array.from({ length: starCount }, (_, i) => {
    const angle = (i / starCount) * Math.PI * 2;
    return {
      id: i,
      angle,
      distance: 50 + Math.random() * 60,
    };
  });

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Launch trail */}
      <motion.div
        className="absolute w-0.5 h-8 bg-gradient-to-t from-yellow-400 to-transparent rounded-full"
        initial={{ y: 80, opacity: 0, scaleY: 0 }}
        animate={{ y: 0, opacity: [0, 0.8, 0], scaleY: [0, 1, 0] }}
        transition={{
          duration: 0.5,
          ease: 'easeOut',
        }}
      />

      {/* Star explosion - continuous burst */}
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          initial={{
            x: 0,
            y: 0,
            opacity: 0,
            scale: 0,
          }}
          animate={{
            x: Math.cos(star.angle) * star.distance,
            y: Math.sin(star.angle) * star.distance,
            opacity: [0, 1, 1, 0.5, 0],
            scale: [0, 1.2, 1, 0.8, 0],
          }}
          transition={{
            duration: 1.8,
            delay: 0.5,
            ease: [0.33, 1, 0.68, 1],
          }}
        >
          {/* Star particle - CSS shape */}
          <div className="relative w-2 h-2">
            {/* Main star */}
            <div className="absolute inset-0 bg-yellow-300" style={{ 
              clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
            }} />
            {/* Glow effect */}
            <div className="absolute inset-0 blur-sm bg-yellow-200 opacity-60" style={{ 
              clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
            }} />
          </div>
        </motion.div>
      ))}
      
      {/* Center burst flash */}
      <motion.div
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0], scale: [0, 2, 0] }}
        transition={{
          duration: 0.6,
          delay: 0.5,
          ease: 'easeOut',
        }}
      />
    </motion.div>
  );
}

