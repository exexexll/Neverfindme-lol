'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import { generateReferralLink } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatDistance } from '@/lib/distanceCalculation';
import { SocialHandlesPreview } from '@/components/SocialHandlesPreview';
import { InstagramEmbed } from '@/components/InstagramEmbed';

interface UserCardProps {
  user: {
    userId: string;
    name: string;
    gender: 'female' | 'male' | 'nonbinary' | 'unspecified';
    selfieUrl?: string;
    videoUrl?: string;
    instagramPosts?: string[]; // NEW: Instagram post URLs for carousel
    wasIntroducedToMe?: boolean;
    introducedBy?: string | null;
    distance?: number | null;
    hasLocation?: boolean;
  };
  onInvite: (userId: string, seconds: number, mode: 'video' | 'text') => void;
  onRescind?: (userId: string) => void;
  inviteStatus?: 'idle' | 'waiting' | 'declined' | 'timeout' | 'cooldown';
  cooldownExpiry?: number | null;
  isActive: boolean;
  chatMode?: 'video' | 'text';
  overlayOpen?: boolean;
  showingModeSelection?: boolean; // NEW: Don't play video during mode selection
}

export function UserCard({ user, onInvite, onRescind, inviteStatus = 'idle', cooldownExpiry, isActive, chatMode = 'video', overlayOpen = true, showingModeSelection = false }: UserCardProps) {
  const [seconds, setSeconds] = useState(300);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [tempSeconds, setTempSeconds] = useState('300');
  const [tempInputValue, setTempInputValue] = useState('300');
  const [waitTime, setWaitTime] = useState(20);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralLink, setReferralLink] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [cooldownTimeRemaining, setCooldownTimeRemaining] = useState('');
  const [isHovered, setIsHovered] = useState(true); // Start with full UI visible
  const [hasMounted, setHasMounted] = useState(false); // Track if component has mounted
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<'portrait' | 'landscape' | 'unknown'>('unknown');
  
  // CAROUSEL: Media index (0 = video, 1+ = Instagram photos)
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  
  // Build media items (video first, then Instagram posts)
  const mediaItems = [
    ...(user.videoUrl ? [{ type: 'video' as const, url: user.videoUrl }] : []),
    ...(user.instagramPosts || []).map(postUrl => ({ 
      type: 'instagram' as const, 
      url: postUrl 
    }))
  ];
  const totalMedia = mediaItems.length;
  
  // OPTIMIZATION: Preload next/previous Instagram embeds
  useEffect(() => {
    if (mediaItems.length <= 1) return;
    
    // Preload next slide
    const nextIndex = (currentMediaIndex + 1) % totalMedia;
    if (mediaItems[nextIndex]?.type === 'instagram') {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = mediaItems[nextIndex].url;
      document.head.appendChild(link);
      console.log('[Carousel] 🚀 Preloading next:', mediaItems[nextIndex].url);
    }
    
    // Preload previous slide
    const prevIndex = currentMediaIndex === 0 ? totalMedia - 1 : currentMediaIndex - 1;
    if (mediaItems[prevIndex]?.type === 'instagram') {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = mediaItems[prevIndex].url;
      document.head.appendChild(link);
      console.log('[Carousel] 🚀 Preloading previous:', mediaItems[prevIndex].url);
    }
  }, [currentMediaIndex, mediaItems, totalMedia]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const waitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoMinimizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTime = useRef<number>(0);
  
  // Detect mobile Safari for compact UI
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // CAROUSEL: Navigation handlers with video autoplay
  const handleSwipeLeft = () => {
    if (totalMedia <= 1) return;
    
    const nextIndex = (currentMediaIndex + 1) % totalMedia;
    console.log('[Carousel] Swipe left:', currentMediaIndex, '→', nextIndex);
    
    // Pause current video
    if (videoRef.current && mediaItems[currentMediaIndex].type === 'video') {
      videoRef.current.pause();
      setIsVideoPaused(true);
    }
    
    setCurrentMediaIndex(nextIndex);
    
    // Autoplay if navigating TO video
    if (mediaItems[nextIndex]?.type === 'video') {
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => console.log('[Carousel] Autoplay blocked'));
          setIsVideoPaused(false);
        }
      }, 100);
    }
  };

  const handleSwipeRight = () => {
    if (totalMedia <= 1) return;
    
    const prevIndex = currentMediaIndex === 0 ? totalMedia - 1 : currentMediaIndex - 1;
    console.log('[Carousel] Swipe right:', currentMediaIndex, '→', prevIndex);
    
    // Pause current video
    if (videoRef.current && mediaItems[currentMediaIndex].type === 'video') {
      videoRef.current.pause();
      setIsVideoPaused(true);
    }
    
    setCurrentMediaIndex(prevIndex);
    
    // Autoplay if navigating TO video
    if (mediaItems[prevIndex]?.type === 'video') {
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => console.log('[Carousel] Autoplay blocked'));
          setIsVideoPaused(false);
        }
      }, 100);
    }
  };
  
  // ENHANCEMENT: Swipe gesture handlers (MUST be unconditional)
  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleSwipeLeft,
    onSwipedRight: handleSwipeRight,
    trackMouse: true,
    preventScrollOnSwipe: true,
  });
  
  // ENHANCEMENT: Keyboard navigation
  useEffect(() => {
    if (totalMedia <= 1 || !isActive) return;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSwipeRight();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSwipeLeft();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [totalMedia, isActive, currentMediaIndex, handleSwipeLeft, handleSwipeRight]);

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
        console.log('[UserCard] 🧹 Component unmounting - pausing video for:', user.name);
        video.pause();
        video.muted = true;
        // CRITICAL FIX: Don't reset currentTime or src here either!
        // Only pause and mute - preserves video progress for next time
        // video.currentTime = 0; // ❌ REMOVED - was restarting video
        // video.src = ''; // ❌ REMOVED - was causing reload on re-enter
        console.log('[UserCard] ✅ Video paused, progress preserved');
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
    
    // CRITICAL FIX: Don't play if mode selection is showing!
    if (isActive && !isVideoPaused && overlayOpen && !showingModeSelection) {
      video.muted = false;
      video.volume = 1.0;
      video.play().catch(() => {
        if (video) {
          video.muted = true;
          video.play().catch(() => {});
        }
      });
    } else if (!isActive || showingModeSelection) {
      // Pause when inactive OR when mode selection showing
      video.pause();
      video.muted = true;
      video.volume = 0;
    }
    
    // CRITICAL FIX: Don't reset currentTime in cleanup!
    // This was causing video to restart on re-enter
    return () => {
      if (video && !isActive) {
        console.log('[UserCard] 🧹 CLEANUP - Pausing video for:', user.name);
        video.pause();
        video.muted = true;
        video.volume = 0;
        // DON'T RESET: video.currentTime = 0 (preserves progress)
      }
    };
  }, [isActive, isVideoPaused, overlayOpen, showingModeSelection, user.name]);

  // TikTok-style controls: Mobile = center only, Desktop = 3 zones
  const handleVideoTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!videoRef.current) return;
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    const isDoubleTap = timeSinceLastTap < 300 && timeSinceLastTap > 0;
    
    if (isDoubleTap) {
      // MOBILE: Only pause/play (no forward/backward to avoid conflicts)
      if (isMobile) {
        if (videoRef.current.paused || isVideoPaused) {
          videoRef.current.play();
          setIsVideoPaused(false);
          console.log('[UserCard] ▶️ Resume from:', Math.floor(videoRef.current.currentTime), 's');
        } else {
          videoRef.current.pause();
          setIsVideoPaused(true);
          console.log('[UserCard] ⏸️ Paused at:', Math.floor(videoRef.current.currentTime), 's');
        }
      } else {
        // DESKTOP: 3-zone controls (left=rewind, center=pause, right=forward)
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const leftThird = width / 3;
        const rightThird = (width / 3) * 2;
        
        if (x < leftThird) {
          // Left side - rewind 10s
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          console.log('[UserCard] ⏪ Rewind 10s');
        } else if (x > rightThird) {
          // Right side - forward 10s
          videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
          console.log('[UserCard] ⏩ Forward 10s');
        } else {
          // Center - pause/play
          if (videoRef.current.paused || isVideoPaused) {
            videoRef.current.play();
            setIsVideoPaused(false);
          } else {
            videoRef.current.pause();
            setIsVideoPaused(true);
          }
        }
      }
      lastTapTime.current = 0;
    } else {
      // Single tap - just record time for double-tap detection
      lastTapTime.current = now;
    }
  };

  // Wait timer countdown - Auto-cancel after 20 seconds
  useEffect(() => {
    if (inviteStatus !== 'waiting') {
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }
      return;
    }
    
    // Only start timer if not already running
    if (waitTimerRef.current) return;
    
    console.log('[UserCard] Starting 20s wait timer');
    setWaitTime(20);
    
    const interval = setInterval(() => {
      setWaitTime(prev => {
        const next = prev - 1;
        
        if (next <= 0) {
          console.log('[UserCard] Wait expired - auto-rescinding');
          clearInterval(interval);
          if (onRescind) onRescind(user.userId);
          return 0;
        }
        return next;
      });
    }, 1000);
    
    waitTimerRef.current = interval;

    return () => {
      if (waitTimerRef.current) {
        clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }
    };
  }, [inviteStatus]); // ONLY inviteStatus - not user.userId or onRescind

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
    const num = parseInt(tempInputValue);
    
    // Enforce server validation: 60-500 seconds
    if (isNaN(num) || num < 60) {
      const defaultValue = 60;
      setSeconds(defaultValue);
      setTempSeconds(defaultValue.toString());
      setTempInputValue(defaultValue.toString());
    } else {
      const clamped = Math.min(500, num);
      setSeconds(clamped);
      setTempSeconds(clamped.toString());
      setTempInputValue(clamped.toString());
    }
    
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
      style={{ touchAction: 'pan-y' }} // Allow vertical swipe gestures to bubble up
    >
      {/* User Info Overlay - Top (Animates based on hover) - Tap to show/hide on mobile */}
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
              {(() => {
                // DEBUG: Log badge conditions
                const shouldShow = !!(user.hasLocation && user.distance !== null && user.distance !== undefined);
                if (user.distance !== undefined || user.hasLocation) {
                  console.log('[UserCard] Badge Debug:', {
                    name: user.name,
                    hasLocation: user.hasLocation,
                    distance: user.distance,
                    distanceType: typeof user.distance,
                    shouldShow,
                    formattedDistance: user.distance !== null && user.distance !== undefined ? formatDistance(user.distance) : 'N/A'
                  });
                }
                
                if (shouldShow && user.distance !== null && user.distance !== undefined) {
                  return (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex-shrink-0 rounded-full bg-[#ffc46a]/20 px-2.5 py-0.5 border border-[#ffc46a]/40"
                    >
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3 text-[#ffc46a]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-bold text-[#ffc46a]">
                          {formatDistance(user.distance)}
                        </span>
                      </div>
                    </motion.div>
                  );
                }
                return null;
              })()}
              
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
                  
                  {/* Social Handles (if user has shared them) */}
                  <SocialHandlesPreview socials={(user as any).socials} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      {/* CAROUSEL: Full Height Video/Instagram Posts - With padding for bottom controls */}
      <div className="relative flex-1 bg-black flex items-center justify-center pb-32">
        {mediaItems.length > 0 ? (
          <div 
            className="relative w-full h-full flex items-center justify-center"
            {...swipeHandlers}
          >
            {/* Current Media Item */}
            <AnimatePresence mode="wait">
              {mediaItems[currentMediaIndex].type === 'video' ? (
                <motion.div
                  key="video"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 flex items-center justify-center"
                  onClick={handleVideoTap}
                >
                  <video
                    ref={videoRef}
                    src={user.videoUrl}
                    loop
                    playsInline
                    className="w-full h-full pointer-events-none"
                    style={{
                      objectFit: 'contain',
                      objectPosition: 'center'
                    }}
                  />
                  
                  {/* Pause indicator */}
                  {isVideoPaused && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                      <svg className="h-20 w-20 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Desktop: Click zone hints */}
                  {!isMobile && (
                    <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 rounded-lg px-3 py-2 backdrop-blur-sm">
                        <p className="text-xs text-white/80">Double-tap: ⏪ -10s</p>
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-black/60 rounded-lg px-3 py-2 backdrop-blur-sm">
                        <p className="text-xs text-white/80">Double-tap: ⏸/▶</p>
                      </div>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 rounded-lg px-3 py-2 backdrop-blur-sm">
                        <p className="text-xs text-white/80">Double-tap: +10s ⏩</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key={`instagram-${currentMediaIndex}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0"
                >
                  <InstagramEmbed postUrl={mediaItems[currentMediaIndex].url} />
                </motion.div>
              )}
            </AnimatePresence>
            
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-black/80">
            <p className="text-lg text-white/50">No media</p>
          </div>
        )}
      </div>

      {/* Video Progress Bar - Removed from UserCard, now in MatchmakeOverlay */}

      {/* Status Banner - Removed for minimal UI */}

      {/* Next Post Button - Positioned to not overlap */}
      {totalMedia > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSwipeLeft();
          }}
          className={`absolute z-25 rounded-xl bg-white/95 hover:bg-white shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 ${
            isMobile 
              ? 'top-4 right-4 px-3 py-1.5'
              : 'bottom-8 left-1/2 -translate-x-1/2 px-6 py-3'
          }`}
        >
          <span className={`text-gray-800 font-semibold ${isMobile ? 'text-xs' : 'text-base'}`}>
            Next
          </span>
          <svg className={isMobile ? 'w-3 h-3 text-gray-800' : 'w-5 h-5 text-gray-800'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      )}

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
          
          {/* Action Row: Timer Button (video only) + CTA Button */}
          <div className="flex gap-2 sm:gap-3">
            {/* TORCH RULE: Only show timer button for VIDEO mode */}
            {chatMode === 'video' && (
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
            )}

            {/* CTA Button - Responsive sizing to prevent overlap */}
            <motion.button
              onClick={() => !isSelf && inviteStatus !== 'cooldown' && onInvite(user.userId, seconds, chatMode)}
              disabled={inviteStatus === 'waiting' || inviteStatus === 'cooldown' || seconds < 60 || isSelf}
              className="focus-ring flex-1 rounded-2xl bg-[#ffc46a] font-playfair font-bold text-[#0a0a0c] shadow-2xl transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    value={tempInputValue}
                    onChange={(e) => setTempInputValue(e.target.value)}
                    onBlur={() => {
                      // On blur, validate and fix if needed
                      const num = parseInt(tempInputValue);
                      if (isNaN(num) || num < 60) {
                        setTempInputValue('60');
                      } else if (num > 500) {
                        setTempInputValue('500');
                      }
                    }}
                    min="60"
                    max="500"
                    autoFocus
                    onFocus={(e) => e.target.select()} 
                    className="w-full rounded-xl bg-white/10 px-6 py-4 text-center font-mono text-4xl text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                    placeholder="60-500"
                  />
                  <p className="mt-3 text-center text-sm text-[#eaeaf0]/70">
                    Enter seconds (60-500)
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setTempSeconds(seconds.toString());
                      setTempInputValue(seconds.toString());
                      setShowTimerModal(false);
                    }}
                    className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTimer}
                    className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
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
                Share this link to introduce your friend to <strong className="text-[#ffc46a]">{user.name}</strong>. 
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
                  className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                >
                  {copySuccess ? '✓ Copied!' : '📋 Copy Link'}
                </button>

                {/* Social Share Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => window.open(`https://twitter.com/intent/tweet?text=Join me on BUMPIN!&url=${encodeURIComponent(referralLink)}`, '_blank')}
                    className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition-all hover:bg-white/20"
                  >
                    𝕏 Tweet
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'Join BUMPIN',
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

      {/* Waiting Overlay - Locks Screen for 20 Seconds, Video Plays in Background */}
      <AnimatePresence>
        {inviteStatus === 'waiting' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
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
                      stroke="#ffc46a"
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
                  They have 20 seconds to respond
                </p>
              </div>

              {/* Hint - Timer countdown */}
              <p className="text-sm text-white/40">
                {waitTime <= 5 
                  ? `Auto-canceling in ${waitTime}s...`
                  : 'Screen locked • Navigation disabled'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
