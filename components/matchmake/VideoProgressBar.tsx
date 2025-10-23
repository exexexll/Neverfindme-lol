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
    // Find current video element
    const updateProgress = () => {
      const videoElements = document.querySelectorAll('video');
      const currentVideo = Array.from(videoElements).find(v => 
        v.src === users[currentIndex]?.videoUrl
      );
      
      if (currentVideo && currentVideo.duration) {
        const percent = (currentVideo.currentTime / currentVideo.duration) * 100;
        setProgress(percent);
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
        className="h-full bg-[#ff9b6b] transition-all"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

