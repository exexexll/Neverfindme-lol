'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getSession } from '@/lib/session';
import { getQueue, ReelUser } from '@/lib/matchmaking';
import { connectSocket } from '@/lib/socket';
import { UserCard } from './UserCard';
import { CalleeNotification } from './CalleeNotification';
import { LocationPermissionModal } from '@/components/LocationPermissionModal';
import { requestAndUpdateLocation } from '@/lib/locationAPI';

interface MatchmakeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  directMatchTarget?: string | null;
}

export function MatchmakeOverlay({ isOpen, onClose, directMatchTarget }: MatchmakeOverlayProps) {
  const router = useRouter();
  const [users, setUsers] = useState<ReelUser[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, 'idle' | 'waiting' | 'declined' | 'timeout' | 'cooldown'>>({});
  const [incomingInvite, setIncomingInvite] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  const [totalAvailable, setTotalAvailable] = useState(0); // Total available count (before reported user filter)
  const [autoInviteSent, setAutoInviteSent] = useState(false);
  const [mouseY, setMouseY] = useState(0);
  const [mouseX, setMouseX] = useState(0);
  const [showCursor, setShowCursor] = useState(false);
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const [viewedUserIds, setViewedUserIds] = useState<Set<string>>(new Set()); // Track by userId, not index
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationAsked, setLocationAsked] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [showProfileIncompleteModal, setShowProfileIncompleteModal] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{hasSelfie: boolean; hasVideo: boolean} | null>(null);
  const [chatMode, setChatMode] = useState<'video' | 'text'>('video');
  const [modeLocked, setModeLocked] = useState(false); // Lock mode after user starts browsing
  const [showModeSelection, setShowModeSelection] = useState(true); // Show mode selection first
  
  const socketRef = useRef<any>(null);
  const prevIndexRef = useRef<number>(-1);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Track user activity for inactivity detection
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // If was inactive, reactivate
    if (isInactive) {
      console.log('[Matchmake] User reactivated!');
      setIsInactive(false);
      setShowInactivityWarning(false);
      
      // Send heartbeat to server to refresh presence
      if (socketRef.current) {
        socketRef.current.emit('heartbeat');
        socketRef.current.emit('queue:join'); // Rejoin queue
        console.log('[Matchmake] ✅ Sent reactivation heartbeat');
      }
    }
  }, [isInactive]);

  // CRITICAL: Stop previous video immediately when currentIndex changes
  useEffect(() => {
    if (prevIndexRef.current !== -1 && prevIndexRef.current !== currentIndex) {
      // Index changed - immediately stop ALL videos to prevent audio leak
      console.log('[MatchmakeOverlay] 🎵 Stopping all videos due to navigation');
      const allVideos = document.querySelectorAll('video');
      allVideos.forEach((video) => {
        video.pause();
        video.muted = true;
        video.volume = 0;
        console.log('[MatchmakeOverlay] Stopped video:', video.src?.substring(0, 50));
      });
    }
    prevIndexRef.current = currentIndex;
    
    // Record activity on navigation
    recordActivity();
  }, [currentIndex, recordActivity]);

  // Load rate limit state from sessionStorage on mount (survives overlay close/open)
  useEffect(() => {
    const savedLimit = sessionStorage.getItem('napalmsky_rate_limit');
    if (savedLimit) {
      const { expiry, viewedIds } = JSON.parse(savedLimit);
      if (Date.now() < expiry) {
        setIsRateLimited(true);
        setViewedUserIds(new Set(viewedIds));
        console.log('[RateLimit] Restored active rate limit from session');
      } else {
        sessionStorage.removeItem('napalmsky_rate_limit');
      }
    }
  }, []);

  // Show toast (no dependencies needed - just sets state)
  const showToast = useCallback((message: string, type: 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []); // Empty deps is correct - no external dependencies

  // Track navigation rate and apply cooldown if needed
  const trackNavigation = useCallback((userId: string) => {
    const now = Date.now();
    
    // Add userId to viewed set
    setViewedUserIds(prev => {
      const newSet = new Set(prev);
      newSet.add(userId);
      return newSet;
    });
    
    // Get timestamps from sessionStorage
    const stored = sessionStorage.getItem('napalmsky_nav_timestamps');
    let timestamps: number[] = stored ? JSON.parse(stored) : [];
    timestamps.push(now);
    
    // Keep only last 30 seconds
    const thirtySecondsAgo = now - 30000;
    timestamps = timestamps.filter(ts => ts > thirtySecondsAgo);
    sessionStorage.setItem('napalmsky_nav_timestamps', JSON.stringify(timestamps));
    
    // Check if 10+ NEW card views in 30 seconds
    if (timestamps.length >= 10) {
      const cooldownEnd = now + 180000;
      setIsRateLimited(true);
      
      sessionStorage.setItem('napalmsky_rate_limit', JSON.stringify({
        expiry: cooldownEnd,
        viewedIds: Array.from(viewedUserIds),
      }));
      
      showToast('Slow down! 3-minute cooldown. You can still review seen cards.', 'error');
      
      setTimeout(() => {
        setIsRateLimited(false);
        sessionStorage.removeItem('napalmsky_rate_limit');
        sessionStorage.removeItem('napalmsky_nav_timestamps');
        showToast('Cooldown ended! Explore new cards again.', 'info');
      }, 180000);
    }
  }, [viewedUserIds, showToast]);

  // Check if rate limit expired (on mount and interval)
  useEffect(() => {
    const checkExpiry = () => {
      const savedLimit = sessionStorage.getItem('napalmsky_rate_limit');
      if (savedLimit) {
        const { expiry } = JSON.parse(savedLimit);
        if (Date.now() >= expiry) {
          setIsRateLimited(false);
          sessionStorage.removeItem('napalmsky_rate_limit');
          sessionStorage.removeItem('napalmsky_nav_timestamps');
          console.log('[RateLimit] Cooldown expired');
        }
      }
    };
    
    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, []);

  // Track mouse position for cursor-synced arrow
  const handleMouseMove = (e: React.MouseEvent) => {
    setMouseX(e.clientX);
    setMouseY(e.clientY);
    setShowCursor(true);
    recordActivity(); // Record mouse movement as activity
  };

  // Hide custom cursor when mouse leaves
  const handleMouseLeave = () => {
    setShowCursor(false);
  };

  // Handle click - navigate based on cursor position
  const handleCardClick = (e: React.MouseEvent) => {
    // Record activity
    recordActivity();
    
    // Don't navigate if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a')) {
      return;
    }

    // Check if waiting
    const currentUserId = users[currentIndex]?.userId;
    const isWaiting = currentUserId && inviteStatuses[currentUserId] === 'waiting';
    if (isWaiting) return;

    const screenHeight = window.innerHeight;
    const isTopHalf = mouseY < screenHeight / 2;

    if (isTopHalf && currentIndex > 0) {
      goToPrevious();
    } else if (!isTopHalf && (currentIndex < users.length - 1 || hasMore)) {
      goToNext();
    }
  };

  // Swipe detection for mobile - Improved to prevent conflicts
  const handleTouchStart = (e: React.TouchEvent) => {
    // Record activity
    recordActivity();
    
    const target = e.target as HTMLElement;
    
    // Don't capture touch if user is interacting with buttons or inputs
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }
    
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Record activity
    recordActivity();
    
    const target = e.target as HTMLElement;
    
    // Don't navigate if touching buttons or inputs
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }
    
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaY = touchStartY.current - touchEndY;
    const deltaX = Math.abs(touchStartX.current - touchEndX);
    
    // IMPROVED: Require more significant swipe to prevent accidental navigation
    // Vertical swipe must be > 100px and horizontal < 60px
    if (deltaX < 60 && Math.abs(deltaY) > 100) {
      // Check if waiting
      const currentUserId = users[currentIndex]?.userId;
      const isWaiting = currentUserId && inviteStatuses[currentUserId] === 'waiting';
      if (isWaiting) return;
      
      if (deltaY > 0) {
        // Swiped up - go to next
        goToNext();
      } else {
        // Swiped down - go to previous (always allowed)
        goToPrevious();
      }
    }
  };

  // Prevent body scroll when matchmaking is open
  useEffect(() => {
    if (isOpen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      
      // Prevent scrolling on body
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      return () => {
        // Restore scrolling
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Inactivity detection - warn user when going stale
  useEffect(() => {
    if (!isOpen) return;
    
    // Check for inactivity every 10 seconds
    inactivityCheckRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;
      
      // Warn at 45 seconds of inactivity (before 60s server threshold)
      if (timeSinceActivity > 45000 && !isInactive) {
        console.warn('[Matchmake] ⚠️ User inactive for 45s - showing warning');
        setIsInactive(true);
        setShowInactivityWarning(true);
      }
    }, 10000); // Check every 10 seconds
    
    return () => {
      if (inactivityCheckRef.current) {
        clearInterval(inactivityCheckRef.current);
      }
    };
  }, [isOpen, isInactive]);

  // Ask for location permission (once per session)
  const askForLocation = useCallback(async () => {
    const session = getSession();
    if (!session || locationAsked) return;
    
    // Check if user previously granted location
    const hasLocationConsent = localStorage.getItem('napalmsky_location_consent');
    
    if (hasLocationConsent === 'true') {
      // Auto-update location
      console.log('[Location] User previously consented, updating...');
      await requestAndUpdateLocation(session.sessionToken);
      setLocationAsked(true);
    } else if (hasLocationConsent === null) {
      // First time: Ask for permission
      setShowLocationModal(true);
    }
    // If 'false', user declined before, don't ask again
  }, [locationAsked]);

  // Load initial queue (no shuffling, consistent order)
  const loadInitialQueue = useCallback(async () => {
    const session = getSession();
    if (!session || loading) return;

    // Ask for location permission before loading queue
    await askForLocation();

    setLoading(true);
    try {
      console.log('[Matchmake] Fetching initial queue');
      const queueData = await getQueue(session.sessionToken);
      console.log('[Matchmake] ✅ Received from API:', queueData.users.length, 'users shown,', queueData.totalAvailable, 'total available');
      
      // DEBUG: Log location data from API
      queueData.users.forEach(u => {
        if (u.distance !== null && u.distance !== undefined) {
          console.log('[Matchmake] 📍 User', u.name, 'has distance:', u.distance, 'm, hasLocation:', u.hasLocation);
        }
      });
      
      // Extra safety: Filter out current user from client side too
      let filteredUsers = queueData.users.filter(u => u.userId !== session.userId);
      if (filteredUsers.length < queueData.users.length) {
        console.warn('[Matchmake] ⚠️ Filtered out self from queue (server should have done this)');
      }
      
      // Deduplicate users (safety check to prevent React key warnings)
      const uniqueUserIds = new Set<string>();
      filteredUsers = filteredUsers.filter(user => {
        if (uniqueUserIds.has(user.userId)) {
          console.warn('[Matchmake] ⚠️ Duplicate user in initial queue, removing:', user.name);
          return false;
        }
        uniqueUserIds.add(user.userId);
        return true;
      });
      
      console.log('[Matchmake] User names:', filteredUsers.map(u => `${u.name}${u.hasCooldown ? ' [COOLDOWN]' : ''}${u.wasIntroducedToMe ? ' [INTRO]' : ''}`).join(', '));
      console.log('[Matchmake] Setting users state with', filteredUsers.length, 'users');
      
      // Prioritize users: 1) Direct match target, 2) Introductions, 3) Others
      const sortedUsers = [...filteredUsers];
      
      // First, prioritize direct match target if specified
      if (directMatchTarget) {
        const targetIndex = sortedUsers.findIndex(u => u.userId === directMatchTarget);
        if (targetIndex > 0) {
          const target = sortedUsers[targetIndex];
          sortedUsers.splice(targetIndex, 1);
          sortedUsers.unshift(target);
          console.log('[Matchmake] ⭐ Prioritized direct match target:', target.name);
        }
      } else {
        // If no direct target, prioritize all introductions
        const introductions = sortedUsers.filter(u => u.wasIntroducedToMe);
        const others = sortedUsers.filter(u => !u.wasIntroducedToMe);
        
        if (introductions.length > 0) {
          sortedUsers.splice(0, sortedUsers.length, ...introductions, ...others);
          console.log('[Matchmake] ⭐ Prioritized', introductions.length, 'introductions at top');
        }
      }
      
      setUsers(sortedUsers);
      setTotalAvailable(queueData.totalAvailable); // Store total available count
      setCurrentIndex(0);
      
      // Mark first user as viewed
      if (sortedUsers.length > 0 && sortedUsers[0]) {
        setViewedUserIds(prev => {
          const newSet = new Set(prev);
          newSet.add(sortedUsers[0].userId);
          return newSet;
        });
      }
      
      console.log('[Matchmake] State updated - should now show', filteredUsers.length, 'users');
    } catch (err: any) {
      console.error('[Matchmake] Failed to load initial queue:', err);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, directMatchTarget, showToast]);

  // Check for new users and update existing user data (cooldown, intro status)
  const checkForNewUsers = useCallback(async () => {
    const session = getSession();
    if (!session) return;

    try {
      const queueData = await getQueue(session.sessionToken);
      
      // Filter out self (extra safety)
      const filteredQueue = queueData.users.filter(u => u.userId !== session.userId);
      
      console.log('[Matchmake] Queue check - Total in queue:', filteredQueue.length, 'users shown,', queueData.totalAvailable, 'total available');
      console.log('[Matchmake] Users in queue:', filteredQueue.map(u => `${u.name} (${u.userId.substring(0, 8)})`));
      
      // Update total available count
      setTotalAvailable(queueData.totalAvailable);
      
      setUsers(prevUsers => {
        const currentViewingUserId = prevUsers[currentIndex]?.userId;
        console.log('[Matchmake] Background update - currently viewing:', prevUsers[currentIndex]?.name);
        
        // TRUST BACKEND'S ORDER: Backend returns distance-sorted if user has location
        // filteredQueue is already: closest→farthest if location enabled, random if not
        let newOrder = [...filteredQueue];
        
        // Only add priority overrides (don't break distance order)
        if (directMatchTarget) {
          const idx = newOrder.findIndex(u => u.userId === directMatchTarget);
          if (idx > 0) {
            const [target] = newOrder.splice(idx, 1);
            newOrder.unshift(target);
          }
        } else {
          // Intros first, but maintain distance order within each group
          const intros = newOrder.filter(u => u.wasIntroducedToMe);
          const others = newOrder.filter(u => !u.wasIntroducedToMe);
          if (intros.length > 0 && others.length > 0) {
            newOrder = [...intros, ...others];
          }
        }
        
        // Log what changed
        const prevIds = new Set(prevUsers.map(u => u.userId));
        const newIds = new Set(newOrder.map(u => u.userId));
        const added = newOrder.filter(u => !prevIds.has(u.userId));
        const removed = prevUsers.filter(u => !newIds.has(u.userId));
        
        if (added.length > 0) console.log('[Matchmake] ➕ Added:', added.map(u => u.name));
        if (removed.length > 0) console.log('[Matchmake] ➖ Removed:', removed.map(u => u.name));
        
        // GRACEFUL: Adjust currentIndex so user still sees same card
        if (currentViewingUserId) {
          const newIdx = newOrder.findIndex(u => u.userId === currentViewingUserId);
          if (newIdx !== -1) {
            if (newIdx !== currentIndex) {
              console.log(`[Matchmake] 📍 Reordered: card moved ${currentIndex}→${newIdx} (still showing ${prevUsers[currentIndex]?.name})`);
              setCurrentIndex(newIdx);
            }
          } else {
            console.log('[Matchmake] Current user left queue');
            // Stay at same index, will show whoever is there now
          }
        }
        
        console.log('[Matchmake] Order updated: distance ranking applied (user view preserved)');
        return newOrder;
      });
    } catch (err: any) {
      console.error('[Matchmake] ❌ Failed to check for new users:', err);
    }
  }, [directMatchTarget]);

  // Initialize socket and presence
  useEffect(() => {
    if (!isOpen) {
      // Remove data attribute when closed
      if (typeof window !== 'undefined') {
        document.body.dataset.matchmakingOpen = 'false';
      }
      return;
    }

    // Set data attribute to hide header
    if (typeof window !== 'undefined') {
      document.body.dataset.matchmakingOpen = 'true';
    }

    const session = getSession();
    if (!session) {
      console.error('[Matchmake] No session found');
      router.push('/onboarding');
      return;
    }

    console.log('[Matchmake] Session found:', { userId: session.userId, accountType: session.accountType });

    // Connect socket
    const socket = connectSocket(session.sessionToken);
    socketRef.current = socket;

    // WAIT for authentication before joining queue!
    const handleAuth = async () => {
      console.log('[Matchmake] Socket authenticated, checking profile completion...');
      
      // Check if user has selfie AND video before allowing queue join
      try {
        const session = getSession();
        if (!session) return;
        
        const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/user/me`, {
          headers: { 'Authorization': `Bearer ${session.sessionToken}` },
        });
        
        if (userRes.ok) {
          const userData = await userRes.json();
          const hasSelfie = !!userData.selfieUrl;
          const hasVideo = !!userData.videoUrl;
          
          setProfileStatus({ hasSelfie, hasVideo });
          
          // If missing photo or video, show modal
          if (!hasSelfie || !hasVideo) {
            console.warn('[Matchmake] Profile incomplete - selfie:', hasSelfie, 'video:', hasVideo);
            setShowProfileIncompleteModal(true);
            return; // Don't join queue
          }
        }
      } catch (error) {
        console.error('[Matchmake] Failed to check profile:', error);
        // Continue anyway (fail open for better UX)
      }
      
      console.log('[Matchmake] Profile complete, joining presence and queue');
      
      // Mark as online (presence:join)
      socket.emit('presence:join');

      // Join queue (available for matching)
      socket.emit('queue:join');

      // Load initial queue
      console.log('[Matchmake] Loading initial queue...');
      loadInitialQueue();
    };

    // Remove any existing auth:success listeners first (prevent duplicates)
    socket.off('auth:success');
    
    // Listen for auth success
    socket.on('auth:success', handleAuth);
    
    // If already authenticated (reconnection), join immediately
    if (socket.connected) {
      console.log('[Matchmake] Socket already connected, emitting auth event');
      socket.emit('auth', { sessionToken: session.sessionToken });
    } else {
      console.log('[Matchmake] Socket connecting, will auth after connect event');
    }

    // Real-time presence tracking - instant updates
    socket.on('presence:update', ({ userId, online, available }: any) => {
      console.log('[Matchmake] Presence update:', { userId: userId.substring(0, 8), online, available });
      
      if (!online || !available) {
        // User went offline or unavailable - remove immediately
        setUsers(prev => {
          const filtered = prev.filter(u => u.userId !== userId);
          console.log('[Matchmake] Removed user from queue (offline/unavailable)');
          return filtered;
        });
        
        // Update total count
        setTotalAvailable(prev => Math.max(0, prev - 1));
      } else if (online && available) {
        // User came online - refresh queue to add them
        console.log('[Matchmake] User came online, refreshing queue...');
        setTimeout(() => checkForNewUsers(), 300);
      }
    });

    // Listen for queue-specific updates (busy/in-call status)
    socket.on('queue:update', ({ userId, available }: any) => {
      console.log('[Matchmake] Queue update:', { userId: userId.substring(0, 8), available });
      
      if (!available) {
        // User became busy (in call) - remove immediately
        setUsers(prev => {
          const filtered = prev.filter(u => u.userId !== userId);
          console.log('[Matchmake] Removed user (busy/in-call)');
          return filtered;
        });
        setTotalAvailable(prev => Math.max(0, prev - 1));
      } else {
        // User became available (call ended) - add back
        console.log('[Matchmake] User available again, refreshing...');
        setTimeout(() => checkForNewUsers(), 300);
      }
    });

    // Aggressive polling for status changes (5s for instant updates)
    const refreshInterval = setInterval(() => {
      console.log('[Matchmake] Polling for queue updates...');
      checkForNewUsers();
    }, 5000); // Fast polling for real-time feel

    // Listen for incoming invites
    socket.on('call:notify', (invite: any) => {
      console.log('[Matchmake] Incoming invite:', invite);
      setIncomingInvite(invite);
    });

    // Listen for rescinded invites (someone cancelled their invite to you)
    socket.on('call:rescinded', ({ inviteId }: any) => {
      console.log('[Matchmake] 🚫 Incoming invite was rescinded:', inviteId);
      // Close the incoming invite notification if it's currently showing
      if (incomingInvite && incomingInvite.inviteId === inviteId) {
        setIncomingInvite(null);
        showToast('Invite was cancelled', 'info');
      }
    });

    // Listen for declined invites
    socket.on('call:declined', ({ inviteId, reason }: any) => {
      console.log('[Matchmake] 📞 Invite declined - Reason:', reason, 'InviteId:', inviteId);
      
      // Find which user this was for
      const targetUserId = Object.entries(inviteStatuses).find(
        ([_, status]) => status === 'waiting'
      )?.[0];

      console.log('[Matchmake] Target user for this decline:', targetUserId?.substring(0, 8) || 'NOT FOUND');

      if (targetUserId) {
        // Rejoin queue when invite is declined
        if (socketRef.current) {
          socketRef.current.emit('queue:join');
          console.log('[Matchmake] Rejoined queue after decline');
        }
        
        if (reason === 'cooldown') {
          setInviteStatuses(prev => ({ ...prev, [targetUserId]: 'cooldown' }));
          showToast('You chatted recently — try again later (24h cooldown)', 'info');
        } else if (reason === 'user_declined') {
          // Decline triggers 24h cooldown on server, so show cooldown status
          setInviteStatuses(prev => ({ ...prev, [targetUserId]: 'cooldown' }));
          showToast('Declined — 24h cooldown activated', 'info');
        } else {
          // Other errors (offline, invalid, etc.) - just show declined
          setInviteStatuses(prev => ({ ...prev, [targetUserId]: 'declined' }));
        }
      }
    });

    // Listen for call start (matched!)
    socket.on('call:start', ({ roomId, agreedSeconds, isInitiator, chatMode, peerUser }: any) => {
      console.log('[Matchmake] Call starting:', { roomId, agreedSeconds, isInitiator, chatMode, peerUser });
      
      const mode = chatMode || 'video'; // Default to video
      
      // Route to appropriate room based on mode
      if (mode === 'text') {
        router.push(
          `/text-room/${roomId}?duration=${agreedSeconds}&peerId=${peerUser.userId}&peerName=${encodeURIComponent(peerUser.name)}&peerSelfie=${encodeURIComponent(peerUser.selfieUrl || '')}`
        );
      } else {
        router.push(
          `/room/${roomId}?duration=${agreedSeconds}&peerId=${peerUser.userId}&peerName=${encodeURIComponent(peerUser.name)}&initiator=${isInitiator}`
        );
      }
    });

    // Cleanup
    return () => {
      clearInterval(refreshInterval);
      socket.emit('queue:leave');
      socket.off('auth:success');
      socket.off('presence:update');
      socket.off('queue:update');
      socket.off('call:notify');
      socket.off('call:rescinded');
      socket.off('call:declined');
      socket.off('call:start');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, router]);

  // Debug: Log users array whenever it changes and adjust index if needed
  useEffect(() => {
    console.log('[Matchmake] 🔍 Users array changed - now has:', users.length, 'users');
    console.log('[Matchmake] 🔍 User list:', users.map(u => u.name).join(', '));
    
    // Adjust currentIndex if it's out of bounds
    if (users.length > 0 && currentIndex >= users.length) {
      const newIndex = users.length - 1;
      console.log('[Matchmake] ⚠️ Index out of bounds, adjusting from', currentIndex, 'to', newIndex);
      setCurrentIndex(newIndex);
    } else if (users.length === 0) {
      setCurrentIndex(0);
    }
  }, [users, currentIndex]);

  // Navigate cards (TikTok-style)
  const goToNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= users.length) return;
    
    const nextUser = users[nextIndex];
    if (!nextUser) return;
    
    // Check if this is a NEW card (by userId)
    const isNewCard = !viewedUserIds.has(nextUser.userId);
    
    if (isRateLimited && isNewCard) {
      showToast('Rate limited! Review cards you\'ve already seen.', 'error');
      return;
    }
    
    // Track navigation for NEW cards only
    if (isNewCard) {
      trackNavigation(nextUser.userId);
    }
    
    setCurrentIndex(nextIndex);
  }, [currentIndex, users, isRateLimited, viewedUserIds, trackNavigation]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || incomingInvite) return;

    // Disable navigation if current user has waiting status
    const currentUserId = users[currentIndex]?.userId;
    const isWaiting = currentUserId && inviteStatuses[currentUserId] === 'waiting';
    if (isWaiting) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentIndex, users.length, hasMore, loading, incomingInvite, inviteStatuses]);

  // Page Visibility API: Auto-offline when tab out, auto-rejoin when tab back
  useEffect(() => {
    if (!isOpen) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User tabbed out or minimized - leave queue to prevent ghost users
        console.log('[Matchmake] 👻 User tabbed out, leaving queue to prevent ghost users...');
        
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('queue:leave');
          socketRef.current.emit('presence:leave');
          console.log('[Matchmake] ✅ Left queue and presence (tab hidden)');
        }
      } else {
        // User came back - rejoin queue automatically
        console.log('[Matchmake] 👋 User tabbed back in, rejoining queue...');
        
        if (socketRef.current) {
          // Wait for socket to be connected before emitting
          if (socketRef.current.connected) {
            socketRef.current.emit('presence:join');
            socketRef.current.emit('queue:join');
            
            // Reload queue to get fresh users
            console.log('[Matchmake] 🔄 Reloading queue after tab return...');
            setTimeout(() => {
              loadInitialQueue();
            }, 500); // Small delay to ensure server state is updated
            
            console.log('[Matchmake] ✅ Rejoined queue and presence (tab visible)');
          } else {
            console.log('[Matchmake] Socket not connected yet, waiting...');
            // Will rejoin automatically via auth:success listener
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, loadInitialQueue]);

  // Auto-invite when direct match target is set
  useEffect(() => {
    const autoInvite = localStorage.getItem('napalmsky_auto_invite');
    
    if (autoInvite === 'true' && directMatchTarget && users.length > 0 && !autoInviteSent && socketRef.current) {
      // Find the target user in the list
      const targetUser = users.find(u => u.userId === directMatchTarget);
      
      if (targetUser && !targetUser.hasCooldown) {
        console.log('[Matchmake] 🎯 Auto-inviting direct match target:', targetUser.name, 'with 300 seconds');
        
        // Clear the flag
        localStorage.removeItem('napalmsky_auto_invite');
        setAutoInviteSent(true);
        
        // Send invite automatically with default 300 seconds
        setTimeout(() => {
          if (socketRef.current) {
            socketRef.current.emit('call:invite', {
              toUserId: directMatchTarget,
              requestedSeconds: 300,
            });
            
            setInviteStatuses(prev => ({ ...prev, [directMatchTarget]: 'waiting' }));
            console.log('[Matchmake] ✅ Auto-invite sent successfully');
          }
        }, 500); // Small delay to ensure socket is ready
      } else if (targetUser && targetUser.hasCooldown) {
        console.log('[Matchmake] ⚠️ Cannot auto-invite - target has cooldown');
        localStorage.removeItem('napalmsky_auto_invite');
      }
    }
  }, [directMatchTarget, users, autoInviteSent]);

  // CRITICAL: Handle page visibility changes (tab switch, minimize, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page/tab becoming hidden
        const waitingInvites = Object.entries(inviteStatuses)
          .filter(([_, status]) => status === 'waiting');
        
        if (waitingInvites.length > 0 && socketRef.current) {
          console.warn('[Matchmake] ⚠️ Page hidden while waiting - auto-rescinding');
          
          // Send rescind for all waiting invites
          waitingInvites.forEach(([userId]) => {
            socketRef.current.emit('call:rescind', { toUserId: userId });
          });
          
          // Clear waiting states locally
          setInviteStatuses(prev => {
            const newStatuses = { ...prev };
            waitingInvites.forEach(([userId]) => {
              delete newStatuses[userId];
            });
            return newStatuses;
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [inviteStatuses]);
  
  // CRITICAL: Handle page unload/close (backup for hard closes)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const waitingInvites = Object.entries(inviteStatuses)
        .filter(([_, status]) => status === 'waiting');
      
      if (waitingInvites.length > 0 && socketRef.current) {
        // Send rescind immediately (synchronous)
        waitingInvites.forEach(([userId]) => {
          socketRef.current.emit('call:rescind', { toUserId: userId });
        });
        
        // Force warning dialog (prevents accidental close)
        e.preventDefault();
        e.returnValue = 'You are waiting for a response. Closing will cancel and set a 1-hour cooldown.';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [inviteStatuses]);

  // CRITICAL: Block browser back navigation during waiting state
  useEffect(() => {
    const hasWaitingInvite = Object.values(inviteStatuses).includes('waiting');
    
    if (hasWaitingInvite) {
      // Push a dummy state to prevent immediate back navigation
      window.history.pushState(null, '', window.location.href);
      
      const handlePopState = (e: PopStateEvent) => {
        // Prevent back navigation during waiting
        console.log('[Matchmake] ⚠️ Back navigation blocked - user is waiting for response');
        window.history.pushState(null, '', window.location.href);
        showToast('Cannot go back while waiting for a response. Cancel the invite first.', 'error');
      };
      
      window.addEventListener('popstate', handlePopState);
      
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [inviteStatuses]);

  // Handle invite
  const handleInvite = (toUserId: string, requestedSeconds: number, mode: 'video' | 'text') => {
    if (!socketRef.current) {
      console.error('[Matchmake] ❌ Cannot send invite - socket not available');
      return;
    }

    // Check if already in a call
    const session = getSession();
    if (!session) {
      console.error('[Matchmake] ❌ Cannot send invite - no session');
      return;
    }

    // Record activity when inviting
    recordActivity();

    console.log(`[Matchmake] 📞 Sending ${mode} invite to user ${toUserId.substring(0, 8)} for ${requestedSeconds}s`);

    // Mark self as unavailable while waiting (prevents others from inviting you)
    socketRef.current.emit('queue:leave');
    console.log('[Matchmake] Left queue while waiting for response');

    setInviteStatuses(prev => ({ ...prev, [toUserId]: 'waiting' }));

    socketRef.current.emit('call:invite', {
      toUserId,
      requestedSeconds,
      chatMode: mode, // Include chat mode
    });
    
    console.log('[Matchmake] ✅ Invite event emitted to server');
  };

  // Handle rescind (cancel invite)
  const handleRescind = (toUserId: string) => {
    if (!socketRef.current) return;

    console.log('[Matchmake] 🚫 Rescinding invite to:', toUserId.substring(0, 8));

    // Emit rescind event to server (sets 1h cooldown)
    socketRef.current.emit('call:rescind', { toUserId });

    // Rejoin queue (become available again)
    socketRef.current.emit('queue:join');
    console.log('[Matchmake] Rejoined queue after canceling invite');

    // Set cooldown status immediately (server will enforce)
    setInviteStatuses(prev => ({ ...prev, [toUserId]: 'cooldown' }));
    showToast('Invite cancelled — 1h cooldown', 'info');
    
    console.log('[Matchmake] ✅ Rescind sent, cooldown status set');
  };

  // Handle accept incoming - useCallback to prevent recreating on every render
  const handleAccept = useCallback((inviteId: string, requestedSeconds: number) => {
    if (!socketRef.current) {
      console.error('[Matchmake] ❌ Cannot accept - socket not available');
      return;
    }

    // Record activity when accepting
    recordActivity();

    console.log(`[Matchmake] 📞 Accepting invite ${inviteId} with ${requestedSeconds}s`);
    
    socketRef.current.emit('call:accept', {
      inviteId,
      requestedSeconds,
    });

    setIncomingInvite(null);
    console.log('[Matchmake] ✅ Accept event sent to server');
  }, [recordActivity]); // Stable dependencies

  // Handle decline incoming - useCallback to prevent recreating on every render
  const handleDecline = useCallback((inviteId: string) => {
    if (!socketRef.current) return;

    // Record activity when declining
    recordActivity();

    socketRef.current.emit('call:decline', { inviteId });
    setIncomingInvite(null);
    console.log('[Matchmake] Declined invite:', inviteId);
  }, [recordActivity]); // Stable dependencies

  // Handle location permission allow
  const handleLocationAllow = useCallback(async () => {
    const session = getSession();
    if (!session) return;
    
    setShowLocationModal(false);
    setLocationAsked(true);
    
    const success = await requestAndUpdateLocation(session.sessionToken);
    if (success) {
      localStorage.setItem('napalmsky_location_consent', 'true');
      showToast('Location enabled - showing nearby people first', 'info');
      loadInitialQueue();
    } else {
      showToast('Location permission denied', 'error');
      localStorage.setItem('napalmsky_location_consent', 'false');
    }
  }, [showToast, loadInitialQueue]);

  // Handle location permission deny
  const handleLocationDeny = useCallback(() => {
    setShowLocationModal(false);
    setLocationAsked(true);
    localStorage.setItem('napalmsky_location_consent', 'false');
  }, []);

  // Handle mode selection and start browsing
  const handleStartBrowsing = () => {
    setShowModeSelection(false);
    setModeLocked(true);
    console.log(`[Matchmake] Mode locked to: ${chatMode}`);
  };

  // Handle close overlay
  const handleClose = () => {
    if (incomingInvite) {
      // Cannot close while there's a pending invite
      return;
    }

    // Clean up
    if (socketRef.current) {
      socketRef.current.emit('queue:leave');
    }

    // Clear reel state for fresh load next time
    setUsers([]);
    setCursor(null);
    setHasMore(true);
    setInviteStatuses({});
    setAutoInviteSent(false);
    
    // Clear direct match flags
    localStorage.removeItem('napalmsky_direct_match_target');
    localStorage.removeItem('napalmsky_auto_invite');
    
    // Reset mode selection for next time
    setModeLocked(false);
    setShowModeSelection(true);

    onClose();
  };

  if (!isOpen) return null;

  console.log('[Matchmake] 🎨 RENDERING with', users.length, 'users in state');

  return (
    <>
      {/* Mode Selection Screen - First thing user sees */}
      <AnimatePresence>
        {showModeSelection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0c] p-4"
          >
            <div className="max-w-2xl w-full text-center space-y-8">
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <h2 className="font-playfair text-4xl sm:text-5xl font-bold text-[#eaeaf0] mb-3">
                  Choose Your Chat Mode
                </h2>
                <p className="text-[#eaeaf0]/70 text-lg">
                  Select how you'd like to connect with people
                </p>
              </motion.div>

              <div className="grid sm:grid-cols-2 gap-6">
                {/* Video Mode */}
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  onClick={() => setChatMode('video')}
                  className={`group relative rounded-2xl p-8 transition-all ${
                    chatMode === 'video'
                      ? 'bg-[#ff9b6b] shadow-2xl shadow-[#ff9b6b]/20'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {chatMode === 'video' && (
                    <div className="absolute top-4 right-4">
                      <svg className="w-6 h-6 text-[#0a0a0c]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  
                  <div className={`text-6xl mb-4 ${chatMode === 'video' ? 'scale-110' : ''} transition-transform`}>
                    📹
                  </div>
                  <h3 className={`font-playfair text-2xl font-bold mb-2 ${
                    chatMode === 'video' ? 'text-[#0a0a0c]' : 'text-[#eaeaf0]'
                  }`}>
                    Video Chat
                  </h3>
                  <p className={`text-sm ${
                    chatMode === 'video' ? 'text-[#0a0a0c]/80' : 'text-[#eaeaf0]/60'
                  }`}>
                    Face-to-face video calls with live camera and audio
                  </p>
                </motion.button>

                {/* Text Mode */}
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  onClick={() => setChatMode('text')}
                  className={`group relative rounded-2xl p-8 transition-all ${
                    chatMode === 'text'
                      ? 'bg-[#ff9b6b] shadow-2xl shadow-[#ff9b6b]/20'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {chatMode === 'text' && (
                    <div className="absolute top-4 right-4">
                      <svg className="w-6 h-6 text-[#0a0a0c]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  
                  <div className={`text-6xl mb-4 ${chatMode === 'text' ? 'scale-110' : ''} transition-transform`}>
                    💬
                  </div>
                  <h3 className={`font-playfair text-2xl font-bold mb-2 ${
                    chatMode === 'text' ? 'text-[#0a0a0c]' : 'text-[#eaeaf0]'
                  }`}>
                    Text Chat
                  </h3>
                  <p className={`text-sm ${
                    chatMode === 'text' ? 'text-[#0a0a0c]/80' : 'text-[#eaeaf0]/60'
                  }`}>
                    Message with text, images, and GIFs. Upgrade to video anytime after 60s.
                  </p>
                </motion.button>
              </div>

              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={handleStartBrowsing}
                className="w-full sm:w-auto mx-auto rounded-xl bg-[#ff9b6b] px-12 py-4 text-lg font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity shadow-xl"
              >
                Continue with {chatMode === 'video' ? 'Video' : 'Text'} Mode
              </motion.button>
              
              <button
                onClick={handleClose}
                className="text-sm text-[#eaeaf0]/50 hover:text-[#eaeaf0]/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    
      {/* Transparent Overlay - Only Card Visible */}
      <div 
        className={`fixed inset-0 z-50 flex flex-col md:cursor-none ${showModeSelection ? 'hidden' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Custom Cursor - Desktop only (mobile uses swipe) */}
        {showCursor && typeof window !== 'undefined' && !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
          <div
            className="fixed pointer-events-none z-[60] transition-opacity duration-200"
            style={{
              left: `${mouseX}px`,
              top: `${mouseY}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {mouseY < window.innerHeight / 2 ? (
              // Top half - Up arrow or disabled icon
              currentIndex > 0 && inviteStatuses[users[currentIndex]?.userId] !== 'waiting' ? (
                <svg 
                  className="h-10 w-10 text-white/70 drop-shadow-lg" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                // Can't go up - show error/disabled icon
                <svg 
                  className="h-10 w-10 text-red-400/60 drop-shadow-lg" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )
            ) : (
              // Bottom half - Down arrow, error if at end, or rate limited icon
              (() => {
                const nextIndex = currentIndex + 1;
                const nextUser = users[nextIndex];
                const isNewCard = nextUser && !viewedUserIds.has(nextUser.userId);
                const canGoDown = currentIndex < users.length - 1 || hasMore;
                const isBlocked = isRateLimited && isNewCard;
                
                if (inviteStatuses[users[currentIndex]?.userId] === 'waiting') {
                  // Waiting state - show disabled
                  return (
                    <svg 
                      className="h-10 w-10 text-red-400/60 drop-shadow-lg" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  );
                } else if (isBlocked) {
                  // Rate limited - show clock/pause icon
                  return (
                    <svg 
                      className="h-10 w-10 text-orange-400/70 drop-shadow-lg" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  );
                } else if (canGoDown) {
                  // Can go down - show down arrow
                  return (
                    <svg 
                      className="h-10 w-10 text-white/70 drop-shadow-lg" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  );
                } else {
                  // Can't go down - show error/disabled icon
                  return (
                    <svg 
                      className="h-10 w-10 text-red-400/60 drop-shadow-lg" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor" 
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  );
                }
              })()
            )}
          </div>
        )}

        {/* Mode Indicator - Top Center (Locked, read-only) */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur-md px-6 py-3 border border-white/20">
            <div className="flex items-center gap-2">
              {chatMode === 'video' ? (
                <>
                  <svg className="w-5 h-5 text-[#ff9b6b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium text-white">Video Mode</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-[#ff9b6b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-sm font-medium text-white">Text Mode</span>
                </>
              )}
            </div>
            <div className="h-4 w-px bg-white/20" />
            <span className="text-sm text-white/80">
              {totalAvailable} {totalAvailable === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>
        
        {/* Close Button - Top Right */}
        <div className="absolute top-6 right-6 z-20">
          <button
            onClick={handleClose}
            disabled={!!incomingInvite}
            style={{
              display: Object.values(inviteStatuses).includes('waiting') ? 'none' : 'block'
            }}
            className="rounded-full bg-black/60 p-3 backdrop-blur-md hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed border border-white/20"
            aria-label="Close matchmaking"
            title={incomingInvite ? "Cannot close while receiving a call" : "Close matchmaking"}
          >
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mobile: Close button only (top right corner) */}
        <div className="absolute top-6 right-6 z-40 flex md:hidden">
          <button
            onClick={handleClose}
            disabled={!!incomingInvite}
            style={{
              display: Object.values(inviteStatuses).includes('waiting') ? 'none' : 'block'
            }}
            className="focus-ring rounded-full bg-black/70 p-3 backdrop-blur-md transition-all hover:bg-black/90 disabled:opacity-30 disabled:cursor-not-allowed shadow-xl border-2 border-white/20"
            aria-label="Close matchmaking"
            title={incomingInvite ? "Cannot close while receiving a call" : "Close matchmaking"}
          >
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* TikTok-Style Single Card View - Centered */}
        <div className="relative flex-1 flex items-center justify-center px-4" role="list" aria-label="Available users">
            {users.length === 0 && !loading && (
              <div className="rounded-2xl bg-black/70 p-12 backdrop-blur-md text-center border border-white/20">
                <p className="text-xl text-white drop-shadow">
                  No one else is online right now
                </p>
                <p className="mt-3 text-sm text-white/80">
                  Check back in a bit or invite a friend!
                </p>
              </div>
            )}

            {users.length > 0 && users[currentIndex] && (
              <>
                {/* Current Card - Larger, Centered */}
                <div className="relative w-full max-w-2xl h-[85vh]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={users[currentIndex].userId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0 } }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0"
                    >
                      <UserCard
                        user={users[currentIndex]}
                        onInvite={handleInvite}
                        onRescind={handleRescind}
                        inviteStatus={
                          // Priority: local socket state > server API data
                          inviteStatuses[users[currentIndex].userId] === 'cooldown' || users[currentIndex].hasCooldown
                            ? 'cooldown'
                            : inviteStatuses[users[currentIndex].userId] || 'idle'
                        }
                        cooldownExpiry={users[currentIndex].cooldownExpiry}
                        isActive={true}
                        chatMode={chatMode}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Navigation removed - use swipe on mobile, arrow keys on desktop */}

                {/* Progress Indicator - Right Side */}
                <div className="absolute right-8 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
                  {users.slice(0, Math.min(10, users.length)).map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-2 rounded-full transition-all ${
                        idx === currentIndex 
                          ? 'h-10 bg-[#ff9b6b] shadow-lg' 
                          : 'h-2 bg-white/40'
                      }`}
                    />
                  ))}
                  {users.length > 10 && (
                    <div className="text-xs text-white/70 mt-2 font-medium">
                      +{users.length - 10}
                    </div>
                  )}
                </div>
              </>
            )}

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#ff9b6b] border-t-transparent" />
              </div>
            )}
          </div>
      </div>

      {/* Inactivity Warning - Non-blocking, tap to reactivate */}
      <AnimatePresence>
        {showInactivityWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={recordActivity}
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-md cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={recordActivity}
              className="max-w-md mx-4 rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-orange-500/50 text-center"
            >
              <div className="text-6xl mb-4">⏸️</div>
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
                You&apos;re Hidden from Others
              </h3>
              <p className="text-[#eaeaf0]/80 mb-6">
                You&apos;ve been inactive for 45 seconds. Other users can&apos;t see you in matchmaking right now.
              </p>
              <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-4 mb-6">
                <p className="text-sm text-orange-200">
                  💡 <strong>Tap anywhere to reactivate</strong> and appear in matchmaking again
                </p>
              </div>
              <button
                onClick={recordActivity}
                className="w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
              >
                Reactivate Now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Incomplete Modal - Require photo/video for matchmaking */}
      <AnimatePresence>
        {showProfileIncompleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md mx-4 rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-yellow-500/50 text-center"
            >
              <div className="text-6xl mb-4">📸</div>
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
                Complete Your Profile First
              </h3>
              <p className="text-[#eaeaf0]/80 mb-6">
                {!profileStatus?.hasSelfie && !profileStatus?.hasVideo && 
                  'You need a photo and intro video to start matchmaking.'}
                {profileStatus?.hasSelfie && !profileStatus?.hasVideo && 
                  'You need an intro video to start matchmaking.'}
                {!profileStatus?.hasSelfie && profileStatus?.hasVideo && 
                  'You need a profile photo to start matchmaking.'}
              </p>
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4 mb-6">
                <p className="text-sm text-yellow-200">
                  💡 Other users need to see your photo and video before calling you
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowProfileIncompleteModal(false);
                    router.push('/refilm');
                  }}
                  className="w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                >
                  Upload Photo & Video
                </button>
                <button
                  onClick={() => {
                    setShowProfileIncompleteModal(false);
                    onClose();
                  }}
                  className="w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                >
                  Back to Dashboard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Permission Modal */}
      {showLocationModal && (
        <LocationPermissionModal
          onAllow={handleLocationAllow}
          onDeny={handleLocationDeny}
        />
      )}

      {/* Incoming Invite (Blocking) */}
      <AnimatePresence mode="wait">
        {incomingInvite && (
          <CalleeNotification
            key={incomingInvite.inviteId}
            invite={incomingInvite}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 z-[90] -translate-x-1/2"
          >
            <div className={`rounded-xl px-6 py-3 shadow-lg backdrop-blur-sm ${
              toast.type === 'error' 
                ? 'bg-red-500/90 text-white'
                : 'bg-[#eaeaf0]/90 text-[#0a0a0c]'
            }`}>
              <p className="font-medium">{toast.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}


