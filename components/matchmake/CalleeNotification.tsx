'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface CalleeNotificationProps {
  invite: {
    inviteId: string;
    fromUser: {
      userId: string;
      name: string;
      gender: string;
      selfieUrl?: string;
      videoUrl?: string;
    };
    requestedSeconds: number;
    ttlMs: number;
  };
  onAccept: (inviteId: string, requestedSeconds: number) => void;
  onDecline: (inviteId: string) => void;
}

export function CalleeNotification({ invite, onAccept, onDecline }: CalleeNotificationProps) {
  const [seconds, setSeconds] = useState(invite.requestedSeconds);
  const [inputValue, setInputValue] = useState(invite.requestedSeconds.toString());
  const [timeLeft, setTimeLeft] = useState(20);
  const [videoOrientation, setVideoOrientation] = useState<'portrait' | 'landscape' | 'unknown'>('unknown');
  const videoRef = useRef<HTMLVideoElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const onDeclineRef = useRef(onDecline);
  
  // Keep ref updated silently (no re-render)
  onDeclineRef.current = onDecline;

  // Detect video orientation
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const { videoWidth, videoHeight } = video;
      setVideoOrientation(videoHeight > videoWidth ? 'portrait' : 'landscape');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    if (video.readyState >= 1) handleLoadedMetadata();

    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, []);

  // CRITICAL: Cleanup video on unmount to prevent audio leak
  useEffect(() => {
    const video = videoRef.current;
    
    return () => {
      if (video) {
        console.log('[CalleeNotification] Cleaning up video on unmount');
        video.pause();
        video.muted = true;
        video.volume = 0;
        video.src = '';
      }
    };
  }, []);

  // Countdown timer - starts on mount, never restarts
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => t > 0 ? t - 1 : 0);
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Watch for timer hitting 0 - then decline
  useEffect(() => {
    if (timeLeft === 0) {
      onDeclineRef.current(invite.inviteId);
    }
  }, [timeLeft, invite.inviteId]); // USE REF, not onDecline prop

  // Focus trap - focus first button on mount
  useEffect(() => {
    firstFocusRef.current?.focus();
  }, []);

  // Prevent ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  const handleSecondsChange = (value: string) => {
    // Allow empty string while typing
    setInputValue(value);
    
    if (value === '') {
      setSeconds(60); // Set to minimum for validation, but don't show in input
      return;
    }
    
    const num = parseInt(value);
    
    // Update actual seconds value (clamped)
    if (!isNaN(num)) {
      setSeconds(Math.min(500, Math.max(60, num)));
    }
  };
  
  // Detect mobile for compact UI
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-full max-w-lg rounded-2xl bg-[#0a0a0c] shadow-2xl border-2 border-[#ff9b6b]/30 ${
          isMobile ? 'space-y-3 p-4 max-h-[90vh] overflow-y-auto' : 'space-y-6 p-8'
        }`}
        role="alertdialog"
        aria-labelledby="callee-title"
        aria-describedby="callee-description"
      >
        {/* Timer Warning */}
        <div className="text-center">
          <div className={`inline-block rounded-lg px-4 py-2 ${
            timeLeft <= 10 ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'
          }`}>
            <span className="font-mono text-sm font-bold">
              {timeLeft}s to respond
            </span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h2 id="callee-title" className="font-playfair text-3xl font-bold text-[#eaeaf0]">
            Incoming Call
          </h2>
          <p id="callee-description" className="mt-2 text-[#eaeaf0]/70">
            {invite.fromUser.name} wants to connect
          </p>
        </div>

        {/* Caller Info */}
        <div className={isMobile ? 'space-y-2' : 'space-y-4'}>
          {/* Selfie */}
          {invite.fromUser.selfieUrl && (
            <div className={`relative mx-auto overflow-hidden rounded-full border-4 border-[#ff9b6b]/30 ${
              isMobile ? 'h-24 w-24' : 'h-32 w-32'
            }`}>
              <Image
                src={invite.fromUser.selfieUrl}
                alt={invite.fromUser.name}
                fill
                className="object-cover"
              />
            </div>
          )}

          {/* Intro Video Preview */}
          {invite.fromUser.videoUrl && (
            <div className={`relative overflow-hidden rounded-xl bg-black flex items-center justify-center ${
              isMobile ? 'max-h-48' : 'max-h-64'
            }`}>
              <video
                ref={videoRef}
                src={invite.fromUser.videoUrl}
                autoPlay
                loop
                muted
                playsInline
                className={`${
                  videoOrientation === 'portrait'
                    ? 'h-full w-auto max-w-full' // Portrait: full height, auto width
                    : 'w-full h-auto max-h-full' // Landscape/unknown: full width, auto height
                } object-contain`}
              />
            </div>
          )}

          {/* Gender + Requested Duration */}
          <div className="flex items-center justify-center gap-4 text-sm text-[#eaeaf0]/70">
            <span className="capitalize">{invite.fromUser.gender}</span>
            <span>•</span>
            <span>Wants {invite.requestedSeconds}s call</span>
          </div>
        </div>

        {/* Your Duration Input */}
        <div>
          <label className="block text-sm font-medium text-[#eaeaf0] mb-2 text-center">
            Your preferred duration (seconds)
          </label>
          <input
            type="number"
            value={inputValue}
            onChange={(e) => handleSecondsChange(e.target.value)}
            onBlur={() => {
              // On blur, ensure value is valid
              if (inputValue === '' || parseInt(inputValue) < 60) {
                setInputValue('60');
                setSeconds(60);
              }
            }}
            min="60"
            max="500"
            className={`w-full rounded-xl bg-white/10 px-4 text-center font-mono text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ff9b6b] ${
              isMobile ? 'py-2 text-xl' : 'py-3 text-2xl'
            }`}
            placeholder="60-500"
            aria-label="Your preferred call duration in seconds"
          />
          <p className="mt-2 text-xs text-[#eaeaf0]/50 text-center">
            Final duration will be averaged: {Math.floor((invite.requestedSeconds + seconds) / 2)}s
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onDecline(invite.inviteId)}
            className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            aria-label="Decline call"
          >
            Decline
          </button>
          <button
            ref={firstFocusRef}
            onClick={() => onAccept(invite.inviteId, seconds)}
            disabled={seconds < 60 || seconds > 500}
            className="focus-ring flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label="Accept call"
          >
            Accept
          </button>
        </div>

        <p className="text-center text-xs text-[#eaeaf0]/40">
          Decision required • ESC disabled
        </p>
      </motion.div>
    </div>
  );
}

