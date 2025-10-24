'use client';

import { useEffect, useState, useRef } from 'react';

interface VideoProgressBarProps {
  currentIndex: number;
  users: any[];
}

export function VideoProgressBar({ currentIndex, users }: VideoProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const animationFrameRef = useRef<number>();
  
  useEffect(() => {
    let lastTime = 0;
    
    const updateProgress = () => {
      const videoElements = document.querySelectorAll('video');
      const currentVideo = Array.from(videoElements).find(v => 
        v.src === users[currentIndex]?.videoUrl
      );
      
      if (currentVideo && currentVideo.duration) {
        // Only update if time actually changed (reduce reflows)
        if (Math.abs(currentVideo.currentTime - lastTime) > 0.1) {
          const percent = (currentVideo.currentTime / currentVideo.duration) * 100;
          setProgress(percent);
          lastTime = currentVideo.currentTime;
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateProgress);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentIndex, users]);
  
  return (
    <div className="fixed bottom-0 left-0 right-0 h-1 bg-white/10 z-[45]">
      <div 
        className="h-full bg-[#fcf290] will-change-transform"
        style={{ 
          width: `${progress}%`,
          transform: 'translateZ(0)', // Force GPU acceleration
        }}
      />
    </div>
  );
}

