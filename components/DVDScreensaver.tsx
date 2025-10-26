'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

export function DVDScreensaver() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [color, setColor] = useState('#FF6B9D');
  const [showSparkle, setShowSparkle] = useState(false);
  const velocityRef = useRef({ x: 3, y: 3 }); // Slightly faster for more engagement
  const logoSize = { width: 140, height: 70 }; // Larger for better visibility
  const lastColorChangeRef = useRef(0);
  
  // Vibrant gradient colors that pop on white background
  const colors = [
    '#FF1744', // Vibrant red
    '#00E5FF', // Electric cyan
    '#FFD600', // Bright yellow
    '#76FF03', // Neon green
    '#D500F9', // Vivid purple
    '#FF9100', // Vibrant orange
    '#00B0FF', // Bright blue
    '#FF4081', // Hot pink
  ];
  const colorIndexRef = useRef(0);
  
  // Initialize random starting position and direction
  useEffect(() => {
    const startX = Math.random() * (window.innerWidth - logoSize.width);
    const startY = Math.random() * (window.innerHeight - logoSize.height);
    setPosition({ x: startX, y: startY });
    
    // Random initial direction (diagonal movement)
    velocityRef.current = {
      x: Math.random() > 0.5 ? 3 : -3,
      y: Math.random() > 0.5 ? 3 : -3,
    };
  }, []);
  
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    
    const animate = (currentTime: number) => {
      // Smooth animation with delta time
      const deltaTime = (currentTime - lastTime) / 16.67; // Normalize to 60fps
      lastTime = currentTime;
      
      setPosition(prev => {
        let newX = prev.x + velocityRef.current.x * deltaTime;
        let newY = prev.y + velocityRef.current.y * deltaTime;
        let hitWall = false;
        
        const maxX = window.innerWidth - logoSize.width;
        const maxY = window.innerHeight - logoSize.height;
        
        // Authentic DVD screensaver physics - bounce and change color
        if (newX <= 0) {
          newX = 0;
          velocityRef.current.x = Math.abs(velocityRef.current.x);
          hitWall = true;
        } else if (newX >= maxX) {
          newX = maxX;
          velocityRef.current.x = -Math.abs(velocityRef.current.x);
          hitWall = true;
        }
        
        if (newY <= 0) {
          newY = 0;
          velocityRef.current.y = Math.abs(velocityRef.current.y);
          hitWall = true;
        } else if (newY >= maxY) {
          newY = maxY;
          velocityRef.current.y = -Math.abs(velocityRef.current.y);
          hitWall = true;
        }
        
        // Change color on bounce (with small delay to prevent rapid changes)
        if (hitWall && currentTime - lastColorChangeRef.current > 100) {
          colorIndexRef.current = (colorIndexRef.current + 1) % colors.length;
          setColor(colors[colorIndexRef.current]);
          lastColorChangeRef.current = currentTime;
          
          // Show sparkle effect on bounce
          setShowSparkle(true);
          setTimeout(() => setShowSparkle(false), 300);
        }
        
        return { x: newX, y: newY };
      });
      
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [colors]);
  
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      <motion.div
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        animate={{
          scale: showSparkle ? [1, 1.1, 1] : 1,
        }}
        transition={{ duration: 0.3 }}
      >
        {/* Retro BUMPIN logo with pixelated aesthetic */}
        <svg
          width={logoSize.width}
          height={logoSize.height}
          viewBox="0 0 140 70"
          style={{ 
            filter: `drop-shadow(0 0 12px ${color}) drop-shadow(0 0 24px ${color}40)`,
          }}
        >
          {/* Retro border with rounded corners */}
          <rect 
            x="2" 
            y="2" 
            width="136" 
            height="66" 
            fill="rgba(0,0,0,0.8)" 
            stroke={color} 
            strokeWidth="3" 
            rx="6"
          />
          
          {/* BUMPIN text - bold and clear */}
          <text
            x="70"
            y="45"
            fontFamily="Arial Black, sans-serif"
            fontSize="28"
            fontWeight="900"
            fill={color}
            textAnchor="middle"
            letterSpacing="2"
          >
            BUMPIN
          </text>
          
          {/* Retro scanlines effect */}
          <defs>
            <pattern id="scanlines" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="4" height="2" fill="rgba(255,255,255,0.02)"/>
            </pattern>
          </defs>
          <rect x="2" y="2" width="136" height="66" fill="url(#scanlines)" rx="6"/>
        </svg>
        
        {/* Sparkle effect on bounce */}
        {showSparkle && (
          <>
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  left: `${logoSize.width / 2}px`,
                  top: `${logoSize.height / 2}px`,
                  width: '4px',
                  height: '4px',
                  background: color,
                  borderRadius: '50%',
                }}
                initial={{ opacity: 1, scale: 0 }}
                animate={{
                  opacity: 0,
                  scale: 2,
                  x: Math.cos((i / 4) * Math.PI * 2) * 30,
                  y: Math.sin((i / 4) * Math.PI * 2) * 30,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            ))}
          </>
        )}
      </motion.div>
    </div>
  );
}

