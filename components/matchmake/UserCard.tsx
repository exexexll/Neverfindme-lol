'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { generateReferralLink } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatDistance } from '@/lib/distanceCalculation';

interface UserCardProps {
  user: {
    userId: string;
    name: string;
    gender: 'female' | 'male' | 'nonbinary' | 'unspecified';
    selfieUrl?: string;
    videoUrl?: string;
    wasIntroducedToMe?: boolean;
    introducedBy?: string | null;
    distance?: number | null; // meters
    hasLocation?: boolean;
  };
  onInvite: (userId: string, seconds: number) => void;
  onRescind?: (userId: string) => void;
  inviteStatus?: 'idle' | 'waiting' | 'declined' | 'timeout' | 'cooldown';
  cooldownExpiry?: number | null;
  isActive: boolean;
}

export function UserCard({ user, onInvite, onRescind, inviteStatus = 'idle', cooldownExpiry, isActive }: UserCardProps) {
  const [seconds, setSeconds] = useState(300);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [tempSeconds, setTempSeconds] = useState('300');
  const [waitTime, setWaitTime] = useState(20);
  const [showWaitOptions, setShowWaitOptions] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralLink, setReferralLink] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [cooldownTimeRemaining, setCooldownTimeRemaining] = useState('');
  const [isHovered, setIsHovered] = useState(true); // Start with full UI visible
  const [hasMounted, setHasMounted] = useState(false); // Track if component has mounted
  const [isVideoPaused, setIsVideoPaused] = useState(false); // Track manual pause state
  const [videoOrientation, setVideoOrientation] = useState<'portrait' | 'landscape' | 'unknown'>('unknown');
  const videoRef = useRef<HTMLVideoElement>(null);
  const waitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoMinimizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTime = useRef<number>(0);
  
  // Detect mobile Safari for compact UI
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Detect video orientation when metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const { videoWidth, videoHeight } = video;
      const orientation = videoHeight > videoWidth ? 'portrait' : 'landscape';
      setVideoOrientation(orientation);
      console.log('[UserCard] Video orientation detected:', orientation, `(${videoWidth}x${videoHeight})`);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    // Check if metadata already loaded
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [user.videoUrl]);

  // CRITICAL: Dedicated cleanup effect that ALWAYS runs on unmount
  // This ensures video stops even if other effects don't run cleanup
  useEffect(() => {
    const video = videoRef.current;
    
    // Cleanup function runs when component unmounts
    return () => {
      if (video) {
        console.log('[UserCard] 🧹 Component unmounting - forcing video cleanup for:', user.name);
        video.pause();
        video.muted = true;
        video.currentTime = 0;
        video.src = ''; // CRITICAL: Clear src to fully release video resources
        console.log('[UserCard] ✅ Video fully stopped and resources released');
      }
    };
  }, [user.name]); // Only depends on user.name so it runs cleanup when user changes or component unmounts

  // Set mounted flag after initial render (prevents glitch on card change)
  useEffect(() => {
    setHasMounted(true);
    
    // MOBILE AUTO-MINIMIZE: After 1 second of no interaction, minimize UI to show just video
    if (isMobile && inviteStatus !== 'waiting') {
      // Clear any existing timer
      if (autoMinimizeTimerRef.current) {
        clearTimeout(autoMinimizeTimerRef.current);
      }
      
      // Start fresh UI
      setIsHovered(true);
      
      // Auto-minimize after 1 second
      autoMinimizeTimerRef.current = setTimeout(() => {
        console.log('[UserCard] Auto-minimizing UI for cleaner mobile view');
        setIsHovered(false);
      }, 1000);
      
      return () => {
        if (autoMinimizeTimerRef.current) {
          clearTimeout(autoMinimizeTimerRef.current);
        }
      };
    }
  }, [user.userId, isMobile, inviteStatus]); // Reset when user changes or status changes
  
  // On any user interaction, show full UI temporarily
  const handleUserInteraction = () => {
    if (isMobile && !isHovered) {
      console.log('[UserCard] User interaction - showing full UI');
      setIsHovered(true);
      
      // Auto-minimize again after 1 second
      if (autoMinimizeTimerRef.current) {
        clearTimeout(autoMinimizeTimerRef.current);
      }
      
      autoMinimizeTimerRef.current = setTimeout(() => {
        setIsHovered(false);
      }, 1000);
    }
  };

  // Check if this card is showing the user themselves
  useEffect(() => {
    const session = getSession();
    if (session && user.userId === session.userId) {
      setIsSelf(true);
      console.warn('[UserCard] This is your own card - invite disabled');
    }
  }, [user.userId]);

  // Auto-play/pause video based on active state (respects manual pause)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return; // Guard against null ref
    
    console.log('[UserCard] Video state check:', { 
      isActive, 
      isVideoPaused, 
      userName: user.name,
      videoSrc: video.src?.substring(video.src.lastIndexOf('/') + 1)
    });
    
    if (isActive && !isVideoPaused) {
      // Unmute and play when card becomes active
      console.log('[UserCard] ▶️ UNMUTING and PLAYING video for:', user.name);
      video.muted = false;
      video.volume = 1.0;
      video.play().catch((err) => {
        console.log('[UserCard] Video autoplay blocked, trying muted:', err);
        // Fallback: play muted if autoplay blocked
        if (video) {
          video.muted = true;
          video.play().catch(() => {});
        }
      });
    } else {
      // CRITICAL: Immediately pause and mute when card becomes inactive
      console.log('[UserCard] ⏸️ PAUSING and MUTING video for:', user.name);
      video.pause();
      video.muted = true;
      video.volume = 0;
    }
    
    // CRITICAL CLEANUP: Stop video when component unmounts or becomes inactive
    return () => {
      if (video) {
        console.log('[UserCard] 🧹 CLEANUP - Stopping video for:', user.name);
        video.pause();
        video.muted = true;
        video.volume = 0;
        video.currentTime = 0;
      }
    };
  }, [isActive, isVideoPaused, user.name]);

  // Handle double tap/click on video to pause/play
  const handleVideoInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation(); // Don't trigger card navigation
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    // Double tap/click detection (within 300ms)
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      if (videoRef.current) {
        if (isVideoPaused || videoRef.current.paused) {
          // Resume playback
          videoRef.current.play();
          setIsVideoPaused(false);
          console.log('[UserCard] Video resumed by user');
        } else {
          // Pause playback
          videoRef.current.pause();
          setIsVideoPaused(true);
          console.log('[UserCard] Video paused by user');
        }
      }
      lastTapTime.current = 0; // Reset to prevent triple-tap issues
    } else {
      lastTapTime.current = now;
    }
  };

  // Wait timer countdown with safety timeout
  useEffect(() => {
    if (inviteStatus === 'waiting') {
      console.log('[UserCard] Starting wait timer for user');
      setWaitTime(20);
      setShowWaitOptions(false);
      
      // Client-side countdown timer
      waitTimerRef.current = setInterval(() => {
        setWaitTime(prev => {
          const newTime = prev - 1;
          console.log('[UserCard] Wait time:', newTime);
          if (newTime <= 0) {
            setShowWaitOptions(true);
            if (waitTimerRef.current) {
              clearInterval(waitTimerRef.current);
              waitTimerRef.current = null;
            }
            return 0;
          }
          return newTime;
        });
      }, 1000);
    } else {
      // Clear timer when not waiting
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }
      setShowWaitOptions(false);
    }

    return () => {
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }
    };
  }, [inviteStatus]); // ONLY depend on inviteStatus to prevent timer resets (user.name not needed)

  // Update cooldown timer
  useEffect(() => {
    if (inviteStatus === 'cooldown' && cooldownExpiry) {
      const updateCooldown = () => {
        const remaining = cooldownExpiry - Date.now();
        if (remaining <= 0) {
          setCooldownTimeRemaining('Cooldown expired');
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
          }
          return;
        }
        
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        setCooldownTimeRemaining(`${hours}h ${minutes}m`);
      };
      
      updateCooldown(); // Initial update
      cooldownTimerRef.current = setInterval(updateCooldown, 60000); // Update every minute
      
      return () => {
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
        }
      };
    }
  }, [inviteStatus, cooldownExpiry]);

  const getPronounCTA = () => {
    switch (user.gender) {
      case 'female': return 'Talk to her';
      case 'male': return 'Talk to him';
      default: return 'Talk to them';
    }
  };

  const getButtonText = () => {
    if (isSelf) return "That's you!";
    if (inviteStatus === 'waiting') return 'Waiting...';
    if (inviteStatus === 'cooldown') {
      // Show generic "On cooldown" since duration varies (1h timeout, 24h decline/post-call)
      return `On cooldown${cooldownTimeRemaining ? ` (${cooldownTimeRemaining})` : ''}`;
    }
    return getPronounCTA();
  };

  const getStatusDisplay = () => {
    switch (inviteStatus) {
      case 'waiting': return { text: 'Waiting for reply...', color: 'bg-yellow-500/20 text-yellow-200' };
      case 'declined': return { text: 'Declined', color: 'bg-red-500/20 text-red-400' };
      case 'timeout': return { text: 'No response', color: 'bg-gray-500/20 text-gray-400' };
      case 'cooldown': return { text: `Try again later${cooldownTimeRemaining ? ` (${cooldownTimeRemaining} remaining)` : ''}`, color: 'bg-orange-500/20 text-orange-300' };
      default: return null;
    }
  };

  const handleSaveTimer = () => {
    const num = parseInt(tempSeconds) || 0;
    const clamped = Math.min(500, Math.max(1, num));
    setSeconds(clamped);
    setTempSeconds(clamped.toString());
    setShowTimerModal(false);
  };

  const handleGenerateReferral = async () => {
    const session = getSession();
    if (!session) return;

    try {
      // Generate link FOR THIS USER (not for yourself)
      const response = await generateReferralLink(session.sessionToken, user.userId);
      // Use window.location for proper client-side URL
      const fullUrl = `${window.location.origin}/onboarding?ref=${response.referralCode}`;
      setReferralLink(fullUrl);
      setShowReferralModal(true);
      console.log('[Referral] Generated intro link for', user.name, ':', fullUrl);
    } catch (err: any) {
      console.error('[Referral] Failed to generate link:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('[Referral] Failed to copy:', err);
    }
  };

  const status = getStatusDisplay();

  return (
    <div 
      className="relative flex h-full w-full flex-col overflow-hidden"
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
      onClick={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      {/* User Info Overlay - Top (Animates based on hover) - Auto-minimizes on mobile */}
      <motion.div 
        className="absolute top-2 md:top-0 left-0 right-0 z-30"
        initial={{ 
          padding: isMobile ? '0.5rem' : '2rem',
          opacity: 1
        }}
        animate={{
          padding: isHovered ? (isMobile ? '0.5rem' : '2rem') : (isMobile ? '0.25rem' : '1rem'),
          opacity: isHovered ? 1 : (isMobile ? 0.7 : 1),
        }}
        transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
      >
        <motion.div 
          className="flex items-center gap-2 md:gap-4 rounded-xl md:rounded-2xl bg-black/70 backdrop-blur-md"
          initial={{ padding: isMobile ? '0.5rem' : '1.5rem' }}
          animate={{
            padding: isHovered ? (isMobile ? '0.5rem' : '1.5rem') : (isMobile ? '0.25rem' : '0.75rem'),
          }}
          transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
        >
          {/* Profile Picture - Much smaller on mobile when minimized */}
          <motion.div
            initial={{ 
              width: isMobile ? '2rem' : '5rem', 
              height: isMobile ? '2rem' : '5rem' 
            }}
            animate={{
              width: isHovered ? (isMobile ? '2rem' : '5rem') : (isMobile ? '1.5rem' : '3rem'),
              height: isHovered ? (isMobile ? '2rem' : '5rem') : (isMobile ? '1.5rem' : '3rem'),
            }}
            transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
            className="relative flex-shrink-0 overflow-hidden rounded-full border-white/30"
            style={{ borderWidth: isHovered ? (isMobile ? '1px' : '4px') : '1px' }}
          >
            {user.selfieUrl ? (
              <Image
                src={user.selfieUrl}
                alt={user.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-white/10 flex items-center justify-center">
                <motion.span
                  animate={{ fontSize: isHovered ? '2.25rem' : '1.5rem' }}
                  transition={{ duration: 0.3 }}
                >
                  👤
                </motion.span>
              </div>
            )}
          </motion.div>

          {/* Text Content - Animates */}
          <div className="flex-1 min-w-0">
            {/* Name + Distance - Wrap on mobile if needed */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <motion.h3 
                className="font-playfair font-bold text-white leading-none"
                initial={{ fontSize: isMobile ? '1.5rem' : '3rem' }}
                animate={{
                  fontSize: isHovered ? (isMobile ? '1.5rem' : '3rem') : (isMobile ? '1.25rem' : '1.5rem'),
                }}
                transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
                style={{ maxWidth: isMobile ? '60%' : 'none' }}
              >
                {user.name}
              </motion.h3>
              
              {/* Distance Badge (Location-based) - Always visible, wraps on mobile */}
              {user.hasLocation && user.distance !== null && user.distance !== undefined && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-shrink-0 rounded-full bg-[#ff9b6b]/20 px-2.5 py-0.5 border border-[#ff9b6b]/40"
                >
                  <div className="flex items-center gap-1">
                    <svg className="h-3 w-3 text-[#ff9b6b]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-xs font-bold text-[#ff9b6b]">
                      {formatDistance(user.distance)}
                    </span>
                  </div>
                </motion.div>
              )}
              
              {user.wasIntroducedToMe && isHovered && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex-shrink-0 rounded-full bg-purple-500/30 px-2 py-0.5 border border-purple-400/50"
                >
                  <span className="text-xs font-bold text-purple-200">⭐ INTRO</span>
                </motion.div>
              )}
            </div>

            {/* Additional Info - Only shown when hovered */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {user.wasIntroducedToMe && user.introducedBy && (
                    <div className="mb-2 rounded-lg bg-purple-500/10 px-3 py-1 inline-block border border-purple-400/30">
                      <p className="text-sm text-purple-200">
                        👥 Introduced by <span className="font-bold">{user.introducedBy}</span>
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-lg capitalize text-white/80">{user.gender}</span>
                    <span className="text-white/50 text-lg">•</span>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-sm text-green-300">Online</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      {/* Full Height Video - With padding for bottom controls */}
      <div className="relative flex-1 bg-black flex items-center justify-center pb-32">
        {user.videoUrl ? (
          <div 
            className="relative cursor-pointer w-full h-full flex items-center justify-center"
            onClick={handleVideoInteraction}
            onTouchEnd={handleVideoInteraction}
          >
            <video
              ref={videoRef}
              src={user.videoUrl}
              loop
              playsInline
              className="w-full h-full"
              style={{
                objectFit: 'contain',
                objectPosition: 'center'
              }}
            />
            {/* Pause indicator */}
            {isVideoPaused && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                <svg className="h-16 w-16 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-black/80">
            <p className="text-lg text-white/50">No intro video</p>
          </div>
        )}
      </div>

      {/* Status Banner - Removed for minimal UI */}

      {/* Controls - Bottom (Animates based on hover) */}
      <motion.div 
        className="absolute bottom-0 left-0 right-0 z-20"
        initial={{ padding: isMobile ? '1rem' : '2rem' }}
        animate={{
          padding: isHovered ? '2rem' : '1rem',
        }}
        transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
      >
        <div className="space-y-3">
          {/* Referral Button - Only shown when hovered */}
          <AnimatePresence>
            {isHovered && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="flex justify-end"
              >
                <button
                  onClick={handleGenerateReferral}
                  className="focus-ring rounded-xl bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-200 backdrop-blur-md transition-all hover:bg-blue-500/30 border border-blue-400/30"
                >
                  👥 Introduce Friend to {user.name}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Action Row: Timer Button + CTA Button */}
          <div className="flex gap-2 sm:gap-3">
            {/* Timer Display Button - Shrinks when not hovered */}
            <motion.button
              onClick={() => setShowTimerModal(true)}
              disabled={inviteStatus === 'waiting'}
              className="focus-ring flex-shrink-0 rounded-2xl bg-black/70 backdrop-blur-md transition-all hover:bg-black/80 disabled:opacity-50"
              initial={{
                paddingLeft: '2rem',
                paddingRight: '2rem',
                paddingTop: '1.5rem',
                paddingBottom: '1.5rem',
              }}
              animate={{
                paddingLeft: isHovered ? '2rem' : '1rem',
                paddingRight: isHovered ? '2rem' : '1rem',
                paddingTop: isHovered ? '1.5rem' : '1rem',
                paddingBottom: isHovered ? '1.5rem' : '1rem',
              }}
              transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
            >
              <div className="text-center">
                <motion.div 
                  className="font-mono font-bold text-white"
                  initial={{ fontSize: '2.25rem' }}
                  animate={{
                    fontSize: isHovered ? '2.25rem' : '1.5rem',
                  }}
                  transition={hasMounted ? { duration: 0.3 } : { duration: 0 }}
                >
                  {seconds.toString().padStart(3, '0')}
                </motion.div>
                <AnimatePresence>
                  {isHovered && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-white/70 mt-1"
                    >
                      seconds
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>

            {/* CTA Button - Responsive sizing to prevent overlap */}
            <motion.button
              onClick={() => !isSelf && inviteStatus !== 'cooldown' && onInvite(user.userId, seconds)}
              disabled={inviteStatus === 'waiting' || inviteStatus === 'cooldown' || seconds < 1 || isSelf}
              className="focus-ring flex-1 rounded-2xl bg-[#ff9b6b] font-playfair font-bold text-[#0a0a0c] shadow-2xl transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              initial={{
                paddingLeft: isMobile ? '1rem' : '3rem',
                paddingRight: isMobile ? '1rem' : '3rem',
                paddingTop: isMobile ? '1rem' : '1.5rem',
                paddingBottom: isMobile ? '1rem' : '1.5rem',
                fontSize: isMobile ? '1.125rem' : '2.25rem',
              }}
              animate={{
                paddingLeft: isHovered ? (isMobile ? '1rem' : '3rem') : (isMobile ? '0.75rem' : '1.5rem'),
                paddingRight: isHovered ? (isMobile ? '1rem' : '3rem') : (isMobile ? '0.75rem' : '1.5rem'),
                paddingTop: isHovered ? (isMobile ? '1rem' : '1.5rem') : (isMobile ? '0.75rem' : '1rem'),
                paddingBottom: isHovered ? (isMobile ? '1rem' : '1.5rem') : (isMobile ? '0.75rem' : '1rem'),
                fontSize: isHovered ? (isMobile ? '1.125rem' : '2.25rem') : (isMobile ? '1rem' : '1.5rem'),
              }}
              transition={hasMounted ? { duration: 0.3, ease: 'easeOut' } : { duration: 0 }}
            >
              {getButtonText()}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Timer Edit Modal */}
      <AnimatePresence>
        {showTimerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/20"
            >
              <h3 className="mb-6 font-playfair text-2xl font-bold text-center text-[#eaeaf0]">
                Set Call Duration
              </h3>

              <div className="space-y-6">
                <div>
                  <input
                    type="number"
                    value={tempSeconds}
                    onChange={(e) => setTempSeconds(e.target.value)}
                    min="1"
                    max="500"
                    autoFocus
                    className="w-full rounded-xl bg-white/10 px-6 py-4 text-center font-mono text-4xl text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
                    placeholder="300"
                  />
                  <p className="mt-3 text-center text-sm text-[#eaeaf0]/70">
                    Enter seconds (1-500)
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setTempSeconds(seconds.toString());
                      setShowTimerModal(false);
                    }}
                    className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTimer}
                    className="focus-ring flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Referral Link Modal */}
      <AnimatePresence>
        {showReferralModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-blue-500/30"
            >
              <h3 className="mb-4 font-playfair text-2xl font-bold text-center text-[#eaeaf0]">
                👥 Introduce Your Friend
              </h3>
              
              <p className="mb-6 text-center text-sm text-[#eaeaf0]/70">
                Share this link to introduce your friend to <strong className="text-[#ff9b6b]">{user.name}</strong>. 
                When they sign up, {user.name} will be notified!
              </p>

              <div className="space-y-4">
                {/* Link Display */}
                <div className="rounded-xl bg-white/10 p-4">
                  <p className="text-xs text-white/50 mb-2">Your unique link:</p>
                  <p className="text-sm text-blue-300 font-mono break-all">
                    {referralLink}
                  </p>
                </div>

                {/* Copy Button */}
                <button
                  onClick={handleCopyLink}
                  className="focus-ring w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                >
                  {copySuccess ? '✓ Copied!' : '📋 Copy Link'}
                </button>

                {/* Social Share Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => window.open(`https://twitter.com/intent/tweet?text=Join me on Napalm Sky!&url=${encodeURIComponent(referralLink)}`, '_blank')}
                    className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition-all hover:bg-white/20"
                  >
                    𝕏 Tweet
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'Join Napalm Sky',
                          text: 'Check out this speed-dating platform!',
                          url: referralLink,
                        }).catch(() => {});
                      }
                    }}
                    className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition-all hover:bg-white/20"
                  >
                    📤 Share
                  </button>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowReferralModal(false);
                    setCopySuccess(false);
                  }}
                  className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Waiting Overlay - Locks Screen for 20 Seconds */}
      <AnimatePresence>
        {inviteStatus === 'waiting' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg"
          >
            <div className="text-center space-y-4 md:space-y-6 px-4 md:px-8 w-full max-w-md mx-auto">
              {/* Countdown Circle */}
              <div className="mx-auto">
                <div className="relative inline-flex items-center justify-center">
                  <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                    {/* Background circle */}
                    <circle
                      cx="60"
                      cy="60"
                      r="54"
                      stroke="rgba(255, 155, 107, 0.2)"
                      strokeWidth="8"
                      fill="none"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="60"
                      cy="60"
                      r="54"
                      stroke="#ff9b6b"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${(2 * Math.PI * 54)}`}
                      strokeDashoffset={`${(2 * Math.PI * 54) * (1 - waitTime / 20)}`}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-5xl font-bold text-white">
                      {waitTime}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Text */}
              <div className="space-y-2">
                <h3 className="font-playfair text-3xl font-bold text-white">
                  Waiting for {user.name}
                </h3>
                <p className="text-lg text-white/70">
                  {showWaitOptions ? 'No response yet...' : 'They have 20 seconds to respond'}
                </p>
              </div>

              {/* Options After 20 Seconds */}
              {showWaitOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <p className="text-white/80">What would you like to do?</p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => onRescind?.(user.userId)}
                      className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-white transition-all hover:bg-white/20"
                    >
                      Cancel Request
                    </button>
                    <button
                      onClick={() => {
                        console.log('[UserCard] Keep Waiting clicked - restarting timer');
                        setShowWaitOptions(false);
                        setWaitTime(20);
                        
                        // IMPORTANT: Notify receiver to extend their timer too!
                        const session = getSession();
                        if (session) {
                          const socket = require('@/lib/socket').getSocket();
                          if (socket) {
                            socket.emit('call:extend-wait', { toUserId: user.userId });
                            console.log('[UserCard] ✅ Sent extend-wait notification to receiver');
                          }
                        }
                        
                        // Clear existing timer if any before creating new one
                        if (waitTimerRef.current) {
                          clearInterval(waitTimerRef.current);
                          waitTimerRef.current = null;
                        }
                        
                        // Restart timer for another 20 seconds
                        waitTimerRef.current = setInterval(() => {
                          setWaitTime(prev => {
                            const newTime = prev - 1;
                            if (newTime <= 0) {
                              setShowWaitOptions(true);
                              if (waitTimerRef.current) {
                                clearInterval(waitTimerRef.current);
                                waitTimerRef.current = null;
                              }
                              return 0;
                            }
                            return newTime;
                          });
                        }, 1000);
                      }}
                      className="focus-ring flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                    >
                      Keep Waiting
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Hint */}
              {!showWaitOptions && (
                <p className="text-sm text-white/40">
                  Screen locked • Navigation disabled
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
