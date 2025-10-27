'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { getSession } from '@/lib/session';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { reportUser } from '@/lib/api';
import { getMediaConstraints, getIceServers, detectDevice } from '@/lib/webrtc-config';
import { FloatingBrowser } from '@/components/FloatingBrowser';
import { useLinkInterceptor } from '@/lib/useLinkInterceptor';

type ViewState = 'room' | 'ended';

interface ChatMessage {
  from: string;
  text?: string;
  timestamp: number;
  type: 'message' | 'social';
  socials?: any;
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Room params
  const roomId = params.roomId as string;
  const agreedSeconds = parseInt(searchParams.get('duration') || '0');
  const peerUserId = searchParams.get('peerId') || '';
  const peerName = searchParams.get('peerName') || 'Partner';
  const isInitiator = searchParams.get('initiator') === 'true';

  // Prevent mobile viewport juggling
  useEffect(() => {
    // Lock viewport height to prevent address bar show/hide from causing layout shifts
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    return () => {
      window.removeEventListener('resize', setViewportHeight);
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  console.log('[Room] URL Params:', {
    roomId,
    duration: searchParams.get('duration'),
    agreedSeconds,
    peerUserId,
    peerName,
    isInitiator
  });

  // State
  const [viewState, setViewState] = useState<ViewState>('room');
  const [timeRemaining, setTimeRemaining] = useState(agreedSeconds);
  const [isMuted, setIsMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showSocialConfirm, setShowSocialConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showPermissionSheet, setShowPermissionSheet] = useState(false);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(10);
  const [permissionError, setPermissionError] = useState('');
  const [peerDisconnected, setPeerDisconnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [remoteTrackReceived, setRemoteTrackReceived] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState('');
  
  // Floating browser state
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  
  // Connecting phase tracking
  const [connectionPhase, setConnectionPhase] = useState<'initializing' | 'gathering' | 'connecting' | 'connected' | 'reconnecting'>('initializing');
  const [connectionTimeout, setConnectionTimeout] = useState(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [connectionFailureReason, setConnectionFailureReason] = useState('');
  const [peerConnectionFailed, setPeerConnectionFailed] = useState(false);
  
  // Connection quality monitoring
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'unknown'>('unknown');
  const statsMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const partnerDisconnectCountdownRef = useRef<NodeJS.Timeout | null>(null); // CRITICAL: Track partner disconnect countdown
  const poorConnectionStartRef = useRef<number | null>(null); // Track when poor connection started
  const poorConnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Auto-disconnect timer
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const iceRetryCount = useRef(0);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const remoteDescriptionSet = useRef(false);
  const timerStarted = useRef(false);

  // Link interceptor - open external links in floating browser
  useLinkInterceptor({
    onLinkClick: (url) => {
      console.log('[VideoRoom] Opening link in browser:', url);
      setBrowserUrl(url);
      setBrowserOpen(true);
    },
    enabled: !browserOpen, // Disable when browser is open
  });

  // Cleanup function - stops all media and closes connections
  // DEFINED EARLY so it can be used in event listeners
  const cleanupConnections = useCallback(() => {
    console.log('[Room] 🧹 Cleaning up WebRTC connections and media streams...');
    
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      console.log('[Room] ✅ Timer cleared');
    }
    
    // CRITICAL FIX: Clear partner disconnect countdown
    if (partnerDisconnectCountdownRef.current) {
      clearInterval(partnerDisconnectCountdownRef.current);
      partnerDisconnectCountdownRef.current = null;
      console.log('[Room] ✅ Partner disconnect countdown cleared');
    }
    
    // CRITICAL FIX: Clear poor connection timeout
    if (poorConnectionTimeoutRef.current) {
      clearTimeout(poorConnectionTimeoutRef.current);
      poorConnectionTimeoutRef.current = null;
      poorConnectionStartRef.current = null;
      console.log('[Room] ✅ Poor connection timeout cleared');
    }
    
    // Stop all media tracks (camera/mic)
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log('[Room] Stopping', tracks.length, 'local media tracks...');
      tracks.forEach((track, index) => {
        console.log(`[Room] Stopping track ${index + 1}: ${track.kind} (${track.label})`);
        track.stop();
      });
      localStreamRef.current = null;
      console.log('[Room] ✅ All local media tracks stopped');
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      console.log('[Room] Closing peer connection, state:', peerConnectionRef.current.connectionState);
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log('[Room] ✅ Peer connection closed');
    }
    
    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
      console.log('[Room] ✅ Connection timeout cleared');
    }
    
    // Reset refs
    iceCandidateQueue.current = [];
    remoteDescriptionSet.current = false;
    timerStarted.current = false;
    iceRetryCount.current = 0;
    
    console.log('[Room] ✅ Cleanup complete - camera/mic stopped, connections closed');
  }, []);

  // End call function
  // DEFINED EARLY so it can be used in timer and event listeners
  const handleEndCall = useCallback(() => {
    console.log('[Room] 🔴 handleEndCall called - ending video call');
    
    // Emit call end to server FIRST (before cleanup)
    if (socketRef.current) {
      console.log('[Room] Emitting call:end to server for room:', roomId);
      socketRef.current.emit('call:end', { roomId });
    } else {
      console.error('[Room] ⚠️ Socket not available when trying to end call');
    }
    
    // CRITICAL: Clean up WebRTC and media immediately
    cleanupConnections();
  }, [roomId, cleanupConnections]);

  // Guards
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    if (!roomId || !agreedSeconds || !peerUserId) {
      router.push('/main');
      return;
    }

    console.log('[Room] Initialized:', { roomId, agreedSeconds, peerUserId, peerName });
  }, [roomId, agreedSeconds, peerUserId, peerName, router]);

  // Initialize media and WebRTC
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    async function initializeRoom() {
      const currentSession = getSession();
      if (!currentSession) return;

      try {
        // 1. Request user media with optimized constraints
        console.log('[Media] Requesting getUserMedia...');
        setConnectionPhase('initializing');
        
        const { isSafari, isMobile } = detectDevice();
        const constraints = getMediaConstraints();
        console.log('[Media] Quality:', isMobile ? '720p HD' : '1080p Full HD');
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log('[Media] Got local stream with tracks:', stream.getTracks().length);
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true; // Always mute local preview
        }

        // 2. EFFICIENCY: Get ICE servers (uses cache if available, saves 0.5-1s)
        console.log('[WebRTC] Getting ICE servers...');
        setConnectionPhase('gathering');
        
        const iceServers = await getIceServers(currentSession.sessionToken);

        // 3. Create RTCPeerConnection with Safari-optimized config
        const config: RTCConfiguration = {
          iceServers,
          iceCandidatePoolSize: 10,
          // Safari on mobile: Force TURN relay for better stability
          iceTransportPolicy: (isSafari && isMobile) ? 'relay' : 'all',
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
          // Safari-specific: Prefer H.264 codec
          ...(isSafari && { 
            sdpSemantics: 'unified-plan',
          })
        };

        const pc = new RTCPeerConnection(config);
        peerConnectionRef.current = pc;

        console.log('[WebRTC] PeerConnection created with', iceServers.length, 'ICE servers');
        console.log('[WebRTC] Config:', { 
          iceTransportPolicy: config.iceTransportPolicy,
          isSafari,
          isMobile 
        });
        
        // Safari on mobile needs longer timeout (45s vs 30s)
        const timeoutDuration = (isSafari && isMobile) ? 45000 : 30000;
        const connectionTimeout = setTimeout(() => {
          if (pc.connectionState !== 'connected') {
            console.error(`[WebRTC] Connection timeout after ${timeoutDuration/1000} seconds`);
            setPermissionError(`Connection timeout - ${isSafari ? 'Safari on mobile may need both users to keep app in foreground' : 'please check your internet connection and try again'}`);
            setShowPermissionSheet(true);
          }
        }, timeoutDuration);

        // Attach local tracks
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });

        // Handle remote track
        pc.ontrack = (event) => {
          console.log('[WebRTC] Remote track received');
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setRemoteTrackReceived(true);
            setConnectionPhase('connected');
            
            // Update timestamp to mark successful connection
            // This helps reconnection logic know we had a stable connection
            sessionStorage.setItem('room_join_time', Date.now().toString());
            
            // Clear connection timeout on successful connection
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
              console.log('[WebRTC] Connection timeout cleared - successfully connected');
            }
            // Timer will start via useEffect when both conditions are met
          }
        };

        // BEST-IN-CLASS: Handle ICE candidates with immediate trickle (no batching)
        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current) {
            // Log candidate type for debugging
            const type = event.candidate.type; // 'host', 'srflx', 'relay'
            const protocol = event.candidate.protocol; // 'udp', 'tcp'
            console.log(`[ICE] Sending candidate: ${type} (${protocol})`);
            
            // Send immediately - Trickle ICE for fastest connection
            socketRef.current.emit('rtc:ice', {
              roomId,
              candidate: event.candidate,
            });
            
            // Log when TURN relay candidates are found (important for NAT traversal)
            if (type === 'relay') {
              console.log('[ICE] ✅ TURN relay candidate sent - NAT traversal enabled');
            }
          } else if (!event.candidate) {
            // null candidate = gathering complete
            console.log('[ICE] ICE gathering complete');
          }
        };

        // Handle connection state
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          console.log('[WebRTC] Connection state:', state);
          setConnectionState(state);
          
          // Update connection phase
          if (state === 'connecting') {
            setConnectionPhase('connecting');
          }
          
          if (state === 'connected') {
            setConnectionPhase('connected');
            clearTimeout(connectionTimeout);
            console.log('[WebRTC] ✓ Connection established - timer will start when remote track received');
            
            // Clear connection timeout ref
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
          }
          
          if (state === 'failed') {
            console.error('[WebRTC] 🔴 Connection FAILED');
            clearTimeout(connectionTimeout);
            
            // CRITICAL: Notify peer immediately (don't wait for timeout!)
            if (socketRef.current) {
              const reason = `${peerName}'s connection failed (network/firewall issue)`;
              console.log('[WebRTC] Notifying peer of connection failure...');
              socketRef.current.emit('connection:failed', { 
                roomId, 
                reason 
              });
            }
            
            // Clear connection timeout ref
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
            
            // Try ICE restart (one attempt)
            handleICEFailure();
          }
          
          if (state === 'disconnected') {
            // CRITICAL: Only handle disconnection if we were previously connected
            // This prevents false positives during initial connection phase
            if (connectionPhase !== 'connected' && connectionPhase !== 'reconnecting') {
              console.log('[WebRTC] Connection disconnected during initial setup - ignoring (not yet established)');
              return;
            }
            
            // If we're already in reconnecting state, don't trigger again
            if (connectionPhase === 'reconnecting') {
              console.log('[WebRTC] Already in reconnecting state - skipping duplicate handler');
              return;
            }
            
            console.warn('[WebRTC] Connection disconnected - entering grace period');
            setConnectionPhase('reconnecting');
            
            // Grace period: 10 seconds to allow automatic reconnection
            // This handles both ephemeral signal loss and brief network interruptions
            const disconnectTime = Date.now();
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 3;
            const gracePeriodMs = 10000; // 10 seconds grace period
            
            // Show reconnecting UI
            setPermissionError('Connection lost. Attempting to reconnect...');
            
            // Track reconnection timeouts so we can clear them on success
            const reconnectTimeouts: NodeJS.Timeout[] = [];
            
            // Attempt ICE restart to help reconnection
            const attemptReconnect = async () => {
              if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                reconnectAttempts++;
                console.log(`[WebRTC] Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
                
                try {
                  // ICE restart - this triggers renegotiation
                  pc.restartIce();
                  
                  // If we're the initiator, create a new offer
                  if (isInitiator) {
                    console.log('[WebRTC] Creating new offer for reconnection (preserving m-line order)');
                    const offer = await pc.createOffer({ iceRestart: true });
                    await pc.setLocalDescription(offer);
                    
                    if (socketRef.current) {
                      socketRef.current.emit('rtc:offer', { roomId, offer });
                      console.log('[WebRTC] Reconnection offer sent');
                    }
                  }
                } catch (error) {
                  console.error('[WebRTC] Error during reconnection attempt:', error);
                }
              }
            };
            
            // Schedule reconnection attempts and track them
            reconnectTimeouts.push(setTimeout(attemptReconnect, 2000));
            reconnectTimeouts.push(setTimeout(attemptReconnect, 5000));
            reconnectTimeouts.push(setTimeout(attemptReconnect, 8000));
            
            // Final check after grace period
            const finalTimeout = setTimeout(() => {
              if (pc.connectionState === 'connected') {
                console.log('[WebRTC] ✅ Reconnected successfully during grace period');
                setConnectionPhase('connected');
                setPermissionError('');
                // Clear all pending reconnection attempts
                reconnectTimeouts.forEach(t => clearTimeout(t));
                return;
              }
              
              if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                console.error(`[WebRTC] Still disconnected after ${gracePeriodMs}ms grace period, treating as failed`);
                
                // Clear pending reconnection attempts
                reconnectTimeouts.forEach(t => clearTimeout(t));
                
                // Notify peer
                if (socketRef.current) {
                  socketRef.current.emit('connection:failed', { 
                    roomId, 
                    reason: `${peerName} lost connection (reconnection failed)` 
                  });
                }
                
                // Update room status to grace period on server
                if (socketRef.current) {
                  socketRef.current.emit('room:disconnected', { roomId });
                }
                
                setConnectionFailed(true);
                setConnectionFailureReason('Connection lost - unable to reconnect');
                setShowPermissionSheet(true);
                setPermissionError('Connection lost. Please refresh the page or check your internet connection.');
              }
            }, gracePeriodMs);
            
            // Store final timeout ref for potential cleanup
            reconnectTimeouts.push(finalTimeout);
          }
        };

        // 3. Connect socket
        const socket = connectSocket(currentSession.sessionToken);
        socketRef.current = socket;

        // CRITICAL: Check if this is a reconnection (tab reload) or a NEW room
        const storedRoomId = sessionStorage.getItem('current_room_id');
        const wasActiveCall = sessionStorage.getItem('room_connection_active') === 'true';
        const lastJoinTime = parseInt(sessionStorage.getItem('room_join_time') || '0');
        const timeSinceJoin = Date.now() - lastJoinTime;
        
        // ONLY treat as reconnection if:
        // 1. Same room ID (not a different room)
        // 2. Was active in last 30 seconds
        // 3. Had an active connection flag
        const isSameRoom = storedRoomId === roomId;
        const isRecentReload = lastJoinTime > 0 && timeSinceJoin > 0 && timeSinceJoin < 10000; // 10s grace period
        
        if (isSameRoom && wasActiveCall && isRecentReload) {
          // User reloaded the SAME room within 30 seconds - this is a reconnection attempt
          console.log('[Room] Detected tab reload during active call - attempting reconnection');
          // DON'T set to 'reconnecting' yet - let it connect first, then it will transition to 'connected'
          // The 'reconnecting' phase should only be set by the disconnect handler, not here
          console.log('[Room] Will attempt to rejoin room via server grace period');
        } else if (!isSameRoom && wasActiveCall) {
          // Different room - clear old session data
          console.log('[Room] New room detected - clearing old session data');
          sessionStorage.removeItem('room_connection_active');
          sessionStorage.removeItem('room_join_time');
          sessionStorage.removeItem('current_room_id');
        }
        
        // Store room info immediately (optimistic) - will be confirmed by room:joined
        sessionStorage.setItem('current_room_id', roomId);
        sessionStorage.setItem('room_join_time', Date.now().toString());
        sessionStorage.setItem('room_connection_active', 'true');
        
        // Join room
        socket.emit('room:join', { roomId });
        
        // CRITICAL FIX: Handle socket reconnection properly
        // When socket reconnects, we need to rejoin the room IF still on this page
        const handleSocketReconnect = () => {
          // Check if we're still in this room (user didn't navigate away)
          const currentPath = window.location.pathname;
          if (!currentPath.includes(roomId)) {
            console.log('[Room] Socket reconnected but user navigated away - not rejoining');
            return;
          }
          
          console.log('[Room] ✅ Socket reconnected - rejoining room');
          setConnectionPhase('reconnecting');
          setShowReconnecting(true);
          
          // Re-auth first
          const session = getSession();
          if (session) {
            socket.emit('auth', { sessionToken: session.sessionToken });
          }
          
          // Then rejoin room
          socket.emit('room:join', { roomId });
        };
        
        // Register handler
        socket.on('reconnect', handleSocketReconnect);
        
        // Store handler reference for cleanup
        (socket as any)._roomReconnectHandler = handleSocketReconnect;
        
        // Listen for room security events
        socket.on('room:invalid', () => {
          // Clear stored room data since this room is invalid
          sessionStorage.removeItem('room_connection_active');
          sessionStorage.removeItem('room_join_time');
          sessionStorage.removeItem('current_room_id');
          console.log('[Room] Room invalid - redirecting');
          cleanupConnections();
          alert('This room does not exist');
          router.push('/main');
        });
        
        // Update timestamp on successful join confirmation
        socket.on('room:joined', () => {
          sessionStorage.setItem('room_join_time', Date.now().toString());
        });
        
        socket.on('room:unauthorized', () => {
          alert('You are not authorized to join this room');
          router.push('/main');
        });
        
        socket.on('room:ended', () => {
          console.log('[Room] Room ended by server');
          alert('This session has ended');
          cleanupConnections();
          router.push('/history');
        });
        
        socket.on('room:partner-disconnected', ({ gracePeriodSeconds }: any) => {
          console.log('[Room] ⚠️ Partner disconnected - starting grace period:', gracePeriodSeconds, 's');
          
          // Clear any existing countdown
          if (partnerDisconnectCountdownRef.current) {
            clearInterval(partnerDisconnectCountdownRef.current);
            partnerDisconnectCountdownRef.current = null;
          }
          
          // CRITICAL: Wait 1 second before showing popup
          // This gives time for quick reconnections to complete
          // Prevents showing popup when partner already reconnected
          setTimeout(() => {
            // Triple-check before showing popup
            const pc = peerConnectionRef.current;
            
            // Skip if WebRTC connected
            if (pc && (pc.connectionState === 'connected' || pc.connectionState === 'connecting')) {
              console.log('[Room] WebRTC already connected - skipping popup');
              return;
            }
            
            // Skip if showReconnecting is false (partner reconnected via socket)
            setShowReconnecting((current) => {
              if (current === false) {
                console.log('[Room] Partner already reconnected - skipping popup');
                return false;
              }
              return true; // Show popup
            });
            
            setReconnectCountdown(gracePeriodSeconds);
            setPeerDisconnected(true);
            
            console.log('[Room] Showing disconnect countdown');
            
            // Start countdown
            const interval = setInterval(() => {
              setReconnectCountdown((prev: number) => {
                // Auto-hide if WebRTC reconnects during countdown
                const currentPc = peerConnectionRef.current;
                if (currentPc && currentPc.connectionState === 'connected') {
                  console.log('[Room] WebRTC reconnected during countdown - hiding');
                  setShowReconnecting(false);
                  clearInterval(interval);
                  partnerDisconnectCountdownRef.current = null;
                  return 10;
                }
                
                if (prev <= 1) {
                  clearInterval(interval);
                  partnerDisconnectCountdownRef.current = null;
                  setShowReconnecting(false);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
            
            partnerDisconnectCountdownRef.current = interval;
          }, 1000); // 1 second delay
        });
        
        socket.on('room:partner-reconnected', () => {
          console.log('[Room] ✅ Partner reconnected via socket');
          
          // CRITICAL FIX: Clear countdown IMMEDIATELY
          if (partnerDisconnectCountdownRef.current) {
            clearInterval(partnerDisconnectCountdownRef.current);
            partnerDisconnectCountdownRef.current = null;
            console.log('[Room] Countdown cleared immediately');
          }
          
          // Hide reconnecting UI immediately
          setShowReconnecting(false);
          setPeerDisconnected(false);
          setReconnectCountdown(10); // Reset for next time
          
          // Only change connectionPhase if not already connected
          if (connectionPhase !== 'connected') {
            setConnectionPhase('connected');
          }
          
          // If WebRTC is disconnected, attempt to renegotiate
          if (peerConnectionRef.current && 
              (peerConnectionRef.current.connectionState === 'disconnected' || 
               peerConnectionRef.current.connectionState === 'failed')) {
            console.log('[Room] WebRTC still disconnected, renegotiating...');
            
            // Trigger ICE restart to re-establish connection
            if (isInitiator) {
              peerConnectionRef.current.restartIce();
              
              peerConnectionRef.current.createOffer({ iceRestart: true })
                .then(offer => peerConnectionRef.current!.setLocalDescription(offer))
                .then(() => {
                  socket.emit('rtc:offer', { 
                    roomId, 
                    offer: peerConnectionRef.current!.localDescription 
                  });
                  console.log('[Room] Sent reconnection offer to partner');
                })
                .catch(err => console.error('[Room] Error creating reconnection offer:', err));
            }
          }
        });
        
        socket.on('room:ended-by-disconnect', () => {
          console.log('[Room] Session ended by disconnect timeout');
          // Show alert then redirect
          alert('Session ended due to connection timeout');
          cleanupConnections();
          router.push('/history');
        });

        // Listen for WebRTC signaling
        socket.on('rtc:offer', async ({ offer }: any) => {
          console.log('[WebRTC] Received offer, current signaling state:', pc.signalingState);
          try {
            // Check if this is a renegotiation (ICE restart)
            const isRenegotiation = pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer';
            
            if (isRenegotiation) {
              console.log('[WebRTC] Renegotiation detected, rolling back to stable state');
              // Handle glare: if we're in 'have-local-offer', we need to roll back
              if (pc.signalingState === 'have-local-offer') {
                console.log('[WebRTC] Rolling back local offer to accept remote offer');
                await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
              }
            }
            
            // Only set remote description if we're in a valid state
            if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(offer));
              remoteDescriptionSet.current = true;
              console.log('[WebRTC] Remote offer set successfully');
              
              // Flush queued ICE candidates
              while (iceCandidateQueue.current.length > 0) {
                const candidate = iceCandidateQueue.current.shift();
                if (candidate) {
                  await pc.addIceCandidate(candidate);
                }
              }
              
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('rtc:answer', { roomId, answer });
              console.log('[WebRTC] Answer sent');
            } else {
              console.warn('[WebRTC] Invalid signaling state for offer:', pc.signalingState);
            }
          } catch (error: any) {
            console.error('[WebRTC] Error handling offer:', error);
            
            // If it's the m-line order error, try to recover by creating a new peer connection
            if (error.message && error.message.includes('m-lines')) {
              console.error('[WebRTC] M-line order mismatch detected - this requires peer connection reset');
              // Don't auto-reset here, let the disconnection handler deal with it
            }
          }
        });

        socket.on('rtc:answer', async ({ answer }: any) => {
          console.log('[WebRTC] Received answer, current signaling state:', pc.signalingState);
          try {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
              remoteDescriptionSet.current = true;
              console.log('[WebRTC] Remote answer set successfully');
              
              // Flush queued ICE candidates
              while (iceCandidateQueue.current.length > 0) {
                const candidate = iceCandidateQueue.current.shift();
                if (candidate) {
                  await pc.addIceCandidate(candidate);
                }
              }
            } else {
              console.warn('[WebRTC] Ignoring answer in wrong state:', pc.signalingState);
            }
          } catch (error: any) {
            console.error('[WebRTC] Error setting remote answer:', error);
            
            // If it's the m-line order error during answer, this is critical
            if (error.message && error.message.includes('m-lines')) {
              console.error('[WebRTC] M-line order mismatch in answer - peers are out of sync');
            }
          }
        });

        socket.on('rtc:ice', async ({ candidate }: any) => {
          if (candidate) {
            const iceCandidate = new RTCIceCandidate(candidate);
            
            // Queue if remote description not set yet
            if (!remoteDescriptionSet.current) {
              console.log('[WebRTC] Queueing ICE candidate (remote desc not set)');
              iceCandidateQueue.current.push(iceCandidate);
            } else {
              try {
                await pc.addIceCandidate(iceCandidate);
              } catch (error) {
                console.error('[WebRTC] Error adding ICE candidate:', error);
              }
            }
          }
        });

        // Chat messages
        socket.on('room:chat', (msg: ChatMessage) => {
          setMessages(prev => [...prev, msg]);
        });

        // Social shared
        socket.on('room:socialShared', (msg: ChatMessage) => {
          setMessages(prev => [...prev, msg]);
        });

        // Session finalized
        socket.on('session:finalized', ({ sessionId: sid }: any) => {
          console.log('[Room] 🎬 SESSION FINALIZED received:', sid);
          console.log('[Room] Setting viewState to ended...');
          setSessionId(sid);
          
          // CRITICAL: Clean up WebRTC and media when session ends
          cleanupConnections();
          
          console.log('[Room] ✅ Changing to ended screen NOW');
          setViewState('ended');
        });

        // Peer disconnected
        socket.on('peer:disconnected', () => {
          console.log('[Room] Peer disconnected - ending session');
          setPeerDisconnected(true);
          // Stop timer immediately when peer disconnects
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
          handleEndCall();
        });

        // CRITICAL: Peer's connection failed (early notification)
        socket.on('connection:peer-failed', ({ reason }: { reason: string }) => {
          console.error('[Room] 🔴 Peer connection failed:', reason);
          setPeerConnectionFailed(true);
          setConnectionFailureReason(reason || 'Partner could not establish connection');
          
          // Clear our timeout since we know it failed
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          
          // Clean up our side
          cleanupConnections();
          
          // Show error immediately
          setShowPermissionSheet(true);
          setPermissionError(reason || 'Partner could not connect');
        });

        // Create offer (initiator role only)
        if (isInitiator) {
          console.log('[WebRTC] Creating offer (initiator role)');
          
          // Wait for at least one relay (TURN) candidate before sending offer
          // This is CRITICAL for cross-network calls (5G + WiFi, university networks)
          console.log('[WebRTC] Waiting for ICE candidates (especially relay candidates)...');
          
          const waitForRelayCandidates = new Promise<void>((resolve) => {
            let hasRelay = false;
            let candidateCount = 0;
            
            const checkCandidate = (event: RTCPeerConnectionIceEvent) => {
              if (event.candidate) {
                candidateCount++;
                console.log(`[WebRTC] ICE candidate #${candidateCount}:`, event.candidate.type, event.candidate.protocol);
                
                if (event.candidate.type === 'relay') {
                  hasRelay = true;
                  console.log('[WebRTC] ✅ TURN relay candidate found!');
                }
              } else {
                // null candidate = gathering complete
                console.log('[WebRTC] ICE gathering complete, total candidates:', candidateCount);
                pc.removeEventListener('icecandidate', checkCandidate);
                resolve();
              }
            };
            
            pc.addEventListener('icecandidate', checkCandidate);
            
            // Timeout: Wait longer for Safari mobile
            const gatherTimeout = (isSafari && isMobile) ? 6000 : 4000;
            setTimeout(() => {
              console.log(`[WebRTC] ICE gather timeout after ${gatherTimeout}ms, proceeding with ${candidateCount} candidates`);
              console.log(`[WebRTC] Has relay candidate: ${hasRelay}`);
              pc.removeEventListener('icecandidate', checkCandidate);
              resolve();
            }, gatherTimeout);
          });
          
          await waitForRelayCandidates;
          
          // Create offer with Safari-compatible options
          const offerOptions: RTCOfferOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          };
          
          console.log('[WebRTC] Creating offer...');
          const offer = await pc.createOffer(offerOptions);
          await pc.setLocalDescription(offer);
          
          console.log('[WebRTC] Offer created with SDP length:', offer.sdp?.length);
          console.log('[WebRTC] Sending offer to peer...');
          
          socket.emit('rtc:offer', { roomId, offer });
          console.log('[WebRTC] ✅ Offer sent via socket');
          
          // Start connection timeout (45 seconds)
          connectionTimeoutRef.current = setTimeout(() => {
            if (connectionPhase !== 'connected') {
              console.error('[WebRTC] Connection timeout - peer may have failed to connect');
              setConnectionTimeout(true);
            }
          }, 45000);
        } else {
          console.log('[WebRTC] Waiting for offer (responder role)');
        }

      } catch (err: any) {
        console.error('[Media] Permission denied:', err);
        const errorMessage = err.name === 'NotAllowedError' 
          ? 'Camera/microphone access denied. Please allow access in your browser settings.'
          : err.message || 'Camera/microphone access denied';
        
        setPermissionError(errorMessage);
        setConnectionFailed(true);
        setConnectionFailureReason('Permission denied');
        setShowPermissionSheet(true);
        
        // CRITICAL: Notify peer that we can't join (don't make them wait!)
        const socket = connectSocket(currentSession.sessionToken);
        socket.emit('connection:failed', { 
          roomId, 
          reason: 'Partner denied camera/microphone permission' 
        });
        
        // Clean up
        cleanupConnections();
      }
    }

    initializeRoom();

    // Cleanup on unmount
    return () => {
      console.log('[Room] Component unmounting - running cleanup');
      // Clear reconnection state completely
      sessionStorage.removeItem('room_connection_active');
      sessionStorage.removeItem('room_join_time');
      sessionStorage.removeItem('current_room_id');
      
      // Clean up stats monitor
      if (statsMonitorRef.current) {
        clearInterval(statsMonitorRef.current);
        statsMonitorRef.current = null;
      }
      
      // CRITICAL FIX: Clear poor connection timeout
      if (poorConnectionTimeoutRef.current) {
        clearTimeout(poorConnectionTimeoutRef.current);
        poorConnectionTimeoutRef.current = null;
        poorConnectionStartRef.current = null;
      }
      
      // CRITICAL FIX: Remove ALL socket event listeners to prevent memory leaks
      if (socketRef.current) {
        // Remove room-specific event listeners
        socketRef.current.off('room:invalid');
        socketRef.current.off('room:joined');
        socketRef.current.off('room:unauthorized');
        socketRef.current.off('room:ended');
        socketRef.current.off('room:partner-disconnected');
        socketRef.current.off('room:partner-reconnected');
        socketRef.current.off('room:ended-by-disconnect');
        socketRef.current.off('rtc:offer');
        socketRef.current.off('rtc:answer');
        socketRef.current.off('rtc:ice');
        socketRef.current.off('room:chat');
        socketRef.current.off('room:socialShared');
        socketRef.current.off('session:finalized');
        socketRef.current.off('peer:disconnected');
        socketRef.current.off('connection:peer-failed');
        
        // Remove reconnect handler using stored reference
        if ((socketRef.current as any)._roomReconnectHandler) {
          socketRef.current.off('reconnect', (socketRef.current as any)._roomReconnectHandler);
          delete (socketRef.current as any)._roomReconnectHandler;
        }
        
        console.log('[Room] ✅ All 16 room-specific socket listeners removed');
      }
      
      cleanupConnections();
      // CRITICAL FIX: DON'T disconnect socket on unmount!
      // Socket is shared singleton - disconnecting breaks the entire app
      // Only remove room-specific listeners (done above)
      // Socket stays connected for app-level use (main page, matchmaking, etc.)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupConnections]);

  // BEST-IN-CLASS: Network Change Detection (Proactive ICE Restart)
  useEffect(() => {
    // Check if Network Information API is available
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    if (!connection) {
      console.log('[Network] Network Information API not available');
      return;
    }
    
    const handleNetworkChange = () => {
      const pc = peerConnectionRef.current;
      const type = connection.effectiveType; // '4g', '3g', '2g', 'slow-2g'
      const downlink = connection.downlink; // Mbps
      
      console.log('[Network] Network changed:', { type, downlink });
      
      // If connected, proactively restart ICE to adapt to new network
      if (pc && pc.connectionState === 'connected') {
        console.log('[Network] 🔄 Proactive ICE restart due to network change');
        pc.restartIce();
        
        // If initiator, create new offer
        if (isInitiator && socketRef.current) {
          pc.createOffer({ iceRestart: true })
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              socketRef.current?.emit('rtc:offer', { roomId, offer: pc.localDescription });
              console.log('[Network] ✅ Sent ICE restart offer after network change');
            })
            .catch(err => console.error('[Network] Error creating ICE restart offer:', err));
        }
      }
    };
    
    connection.addEventListener('change', handleNetworkChange);
    
    return () => {
      connection.removeEventListener('change', handleNetworkChange);
    };
  }, [roomId, isInitiator]);

  // CRITICAL FIX: Send heartbeat from room to prevent being marked offline
  useEffect(() => {
    if (!socketRef.current) return;
    
    // Send heartbeat every 20s while in room
    const heartbeatInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('heartbeat', { timestamp: Date.now() });
        console.log('[Room] 💓 Heartbeat sent (keep online during call)');
      }
    }, 20000);
    
    return () => clearInterval(heartbeatInterval);
  }, []);

  // BEST-IN-CLASS: RTCStats Monitoring (Connection Quality Tracking)
  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (!pc || connectionPhase !== 'connected') return;
    
    console.log('[Stats] Starting connection quality monitoring');
    
    // Monitor every 5 seconds
    const monitorStats = async () => {
      if (!pc || pc.connectionState !== 'connected') {
        setConnectionQuality('unknown');
        return;
      }
      
      try {
        const stats = await pc.getStats();
        
        let packetsLost = 0;
        let packetsReceived = 0;
        let jitter = 0;
        let rtt = 0;
        let bytesReceived = 0;
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
            jitter = report.jitter || 0;
            bytesReceived += report.bytesReceived || 0;
          }
          
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime || 0;
          }
        });
        
        // Calculate quality metrics
        const lossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0;
        const jitterMs = jitter * 1000; // Convert to ms
        const rttMs = rtt * 1000;
        
        console.log('[Stats] Quality metrics:', {
          lossRate: (lossRate * 100).toFixed(2) + '%',
          jitter: jitterMs.toFixed(1) + 'ms',
          rtt: rttMs.toFixed(1) + 'ms',
          bytesReceived: (bytesReceived / 1024).toFixed(0) + 'KB'
        });
        
        // Determine quality level
        if (lossRate > 0.1 || jitterMs > 100 || rttMs > 300) {
          setConnectionQuality('poor');
          console.warn('[Stats] ⚠️ Poor connection quality detected');
          
          // CRITICAL: Start poor connection timeout if not already started
          if (!poorConnectionStartRef.current) {
            poorConnectionStartRef.current = Date.now();
            console.warn('[Stats] Poor connection timer started - will disconnect in 10s if not improved');
            
            // Auto-disconnect after 10 seconds of poor quality
            poorConnectionTimeoutRef.current = setTimeout(() => {
              console.error('[Stats] ❌ Poor connection for 10+ seconds - auto-disconnecting');
              setConnectionFailureReason('Connection quality too poor - disconnected after 10 seconds');
              setConnectionFailed(true);
              setShowPermissionSheet(true);
              handleEndCall();
            }, 10000);
          }
        } else if (lossRate > 0.05 || jitterMs > 50 || rttMs > 150) {
          setConnectionQuality('fair');
          console.log('[Stats] Fair connection quality');
          
          // Clear poor connection timeout if quality improved
          if (poorConnectionStartRef.current) {
            console.log('[Stats] ✅ Connection quality improved from poor to fair');
            poorConnectionStartRef.current = null;
            if (poorConnectionTimeoutRef.current) {
              clearTimeout(poorConnectionTimeoutRef.current);
              poorConnectionTimeoutRef.current = null;
            }
          }
        } else {
          setConnectionQuality('good');
          console.log('[Stats] ✅ Good connection quality');
          
          // Clear poor connection timeout if quality improved
          if (poorConnectionStartRef.current) {
            console.log('[Stats] ✅ Connection quality improved from poor to good');
            poorConnectionStartRef.current = null;
            if (poorConnectionTimeoutRef.current) {
              clearTimeout(poorConnectionTimeoutRef.current);
              poorConnectionTimeoutRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('[Stats] Error getting stats:', error);
      }
    };
    
    // Initial check
    monitorStats();
    
    // Set up interval
    statsMonitorRef.current = setInterval(monitorStats, 5000);
    
    return () => {
      if (statsMonitorRef.current) {
        clearInterval(statsMonitorRef.current);
        statsMonitorRef.current = null;
      }
    };
  }, [connectionPhase]);

  // Timer (useCallback to avoid dependency warnings)
  const startTimer = useCallback(() => {
    if (timerStarted.current) {
      console.log('[Timer] Already started, skipping');
      return;
    }
    
    timerStarted.current = true;
    console.log('[Timer] ⏰ Starting countdown from', agreedSeconds, 'seconds');
    
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1;
        
        // Log every 10 seconds to avoid spam
        if (newTime % 10 === 0 || newTime <= 5) {
          console.log('[Timer] ⏱️ Countdown:', newTime, 'seconds remaining');
        }
        
        if (newTime <= 0) {
          console.log('[Timer] ⏰ Time expired - ending call');
          handleEndCall();
          return 0;
        }
        return newTime;
      });
    }, 1000);
    
    console.log('[Timer] ✅ Interval created, ticking every 1000ms');
  }, [agreedSeconds, handleEndCall]);

  // Start timer when BOTH conditions are met (fixes race condition)
  // Uses state to trigger re-checks when connection state changes
  const [connectionState, setConnectionState] = useState<string>('new');
  
  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (pc) {
      const handleConnectionStateChange = () => {
        console.log('[WebRTC] Connection state changed to:', pc.connectionState);
        setConnectionState(pc.connectionState);
      };
      
      // Listen for connection state changes
      pc.addEventListener('connectionstatechange', handleConnectionStateChange);
      
      return () => {
        pc.removeEventListener('connectionstatechange', handleConnectionStateChange);
      };
    }
  }, []); // Only set up once
  
  useEffect(() => {
    const pc = peerConnectionRef.current;
    console.log('[Timer] Checking start conditions:', {
      hasPC: !!pc,
      connectionState: connectionState,
      remoteTrackReceived,
      timerStarted: timerStarted.current,
      agreedSeconds
    });
    
    if (pc && 
        connectionState === 'connected' && 
        remoteTrackReceived &&
        !timerStarted.current &&
        agreedSeconds > 0) {
      console.log('[Timer] All conditions met - starting timer from', agreedSeconds, 'seconds');
      startTimer();
    }
  }, [connectionState, remoteTrackReceived, agreedSeconds, startTimer]); // Watch for ALL changes

  // ICE failure handler
  const handleICEFailure = () => {
    if (iceRetryCount.current < 2) {
      iceRetryCount.current++;
      console.log(`[WebRTC] ICE failed, retry ${iceRetryCount.current}/2`);
      // Attempt ICE restart
      peerConnectionRef.current?.restartIce();
    } else {
      console.error('[WebRTC] ICE failed after retries');
      // Clear ICE queue on final failure
      iceCandidateQueue.current = [];
      remoteDescriptionSet.current = false;
      handleEndCall();
    }
  };

  // Toggle mic
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (!chatInput.trim() || !socketRef.current) return;

    const message: ChatMessage = {
      from: getSession()?.userId || '',
      text: chatInput,
      timestamp: Date.now(),
      type: 'message',
    };

    socketRef.current.emit('room:chat', { roomId, text: chatInput });
    setChatInput('');
  };

  // Give social
  const handleGiveSocial = () => {
    const savedSocials = localStorage.getItem('bumpin_socials');
    if (!savedSocials) {
      // Show helpful message instead of alert
      const message: ChatMessage = {
        from: 'system',
        text: '⚠️ Please set up your socials in the Socials page first before sharing',
        timestamp: Date.now(),
        type: 'message',
      };
      setMessages(prev => [...prev, message]);
      setChatOpen(true);
      return;
    }

    try {
      const socials = JSON.parse(savedSocials);
      const hasAnySocial = Object.values(socials).some((v: any) => v && v.trim());
      
      if (!hasAnySocial) {
        // Show helpful message in chat
        const message: ChatMessage = {
          from: 'system',
          text: '⚠️ Add at least one social handle in the Socials page to share with your partner',
          timestamp: Date.now(),
          type: 'message',
        };
        setMessages(prev => [...prev, message]);
        setChatOpen(true);
        return;
      }

      setShowSocialConfirm(true);
    } catch (e) {
      console.error('Failed to parse socials');
    }
  };

  const confirmGiveSocial = () => {
    const savedSocials = localStorage.getItem('bumpin_socials');
    if (savedSocials && socketRef.current) {
      const socials = JSON.parse(savedSocials);
      socketRef.current.emit('room:giveSocial', { roomId, socials });
      setShowSocialConfirm(false);
    }
  };

  const confirmLeave = useCallback(() => {
    console.log('[Room] confirmLeave called');
    handleEndCall();
    setShowLeaveConfirm(false);
  }, [handleEndCall]);

  // Retry permissions
  const retryPermissions = () => {
    setShowPermissionSheet(false);
    window.location.reload();
  };

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Report user
  const handleReportUser = async () => {
    console.log('[Report] handleReportUser called');
    console.log('[Report] peerUserId:', peerUserId);
    console.log('[Report] roomId:', roomId);
    console.log('[Report] reportReason:', reportReason);
    
    const session = getSession();
    if (!session) {
      console.error('[Report] No session found');
      setReportError('Session expired. Please refresh the page.');
      return;
    }

    if (!peerUserId) {
      console.error('[Report] No peerUserId available');
      setReportError('Unable to identify user to report');
      return;
    }

    try {
      console.log('[Report] Sending report request...');
      const result = await reportUser(
        session.sessionToken,
        peerUserId,
        reportReason || 'No reason provided',
        roomId
      );
      
      setReportSubmitted(true);
      setShowReportConfirm(false);
      console.log('[Report] ✅ User reported successfully:', result);
    } catch (error: any) {
      console.error('[Report] ❌ Failed to report user:', error);
      setReportError(error.message || 'Failed to submit report');
    }
  };

  if (viewState === 'ended') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-6 rounded-2xl bg-white/5 p-8 text-center shadow-2xl"
        >
          <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0]">
            Session ended
          </h1>
          
          <div className="space-y-2">
            <p className="text-lg text-[#eaeaf0]/70">
              Chat with <span className="font-bold text-[#eaeaf0]">{peerName}</span>
            </p>
            <p className="text-sm text-[#eaeaf0]/50">
              Duration: {formatTime(agreedSeconds)}
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => router.push(`/history`)}
              className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90"
            >
              View Past Chats
            </button>
            <button
              onClick={() => router.push('/main')}
              className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              Return to dashboard
            </button>
            
            {!reportSubmitted && (
              <button
                onClick={() => {
                  console.log('[Report] Report button clicked, opening modal');
                  console.log('[Report] Current peerUserId:', peerUserId);
                  setShowReportConfirm(true);
                }}
                className="focus-ring w-full rounded-xl bg-red-500/20 px-6 py-3 font-medium text-red-300 transition-all hover:bg-red-500/30 border border-red-500/30"
              >
                Report & Block User
              </button>
            )}

            {reportSubmitted && (
              <div className="rounded-xl bg-green-500/10 px-6 py-3 border border-green-500/30">
                <p className="text-center text-sm text-green-300">
                  ✓ Report submitted successfully
                </p>
              </div>
            )}

            {reportError && (
              <div className="rounded-xl bg-red-500/10 px-6 py-3 border border-red-500/30">
                <p className="text-center text-sm text-red-300">
                  {reportError}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-[#eaeaf0]/40">
            No re-connect in-app. Share socials during a call if you want to continue elsewhere.
          </p>
        </motion.div>

        {/* Report Confirm Modal - In ended view */}
        {showReportConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
            >
              <h3 className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
                Report {peerName}?
              </h3>
              <p className="mb-4 text-[#eaeaf0]/70">
                This will report {peerName} for inappropriate behavior. Each user can only report another user once.
                If a user receives 4 or more reports from different users, they will be temporarily banned pending review.
              </p>
              
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-[#eaeaf0]/70">
                  Reason (optional)
                </label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={3}
                  className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {reportError && (
                <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 border border-red-500/30">
                  <p className="text-sm text-red-300">{reportError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowReportConfirm(false);
                    setReportReason('');
                    setReportError('');
                  }}
                  className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReportUser}
                  className="focus-ring flex-1 rounded-xl bg-red-500/80 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
                >
                  Submit Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="relative flex h-screen flex-col bg-[#0a0a0c]">
      {/* Header */}
      <header className="relative z-20 bg-black/40 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <h1 className="font-playfair text-xl font-bold text-white">BUMPIN</h1>
          
          <div className="font-playfair text-3xl font-bold text-[#eaeaf0] sm:text-4xl">
            {formatTime(timeRemaining)}
          </div>

          <div className="flex items-center gap-3">
            {/* Connection Quality Indicator */}
            {connectionQuality !== 'unknown' && (
              <div className="flex items-center gap-1.5" title={`Connection: ${connectionQuality}`}>
                <div className={`flex gap-0.5 items-end h-3`}>
                  <div className={`w-1 h-1 rounded-sm ${connectionQuality === 'poor' ? 'bg-red-400' : connectionQuality === 'fair' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                  <div className={`w-1 h-2 rounded-sm ${connectionQuality === 'poor' ? 'bg-red-400/30' : connectionQuality === 'fair' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                  <div className={`w-1 h-3 rounded-sm ${connectionQuality === 'poor' ? 'bg-red-400/30' : connectionQuality === 'fair' ? 'bg-yellow-400/30' : 'bg-green-400'}`} />
                </div>
                <span className={`text-xs font-medium ${connectionQuality === 'poor' ? 'text-red-400' : connectionQuality === 'fair' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {connectionQuality === 'poor' ? 'Poor' : connectionQuality === 'fair' ? 'Fair' : 'Good'}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#ffc46a]" />
              <span className="text-sm font-medium text-[#ffc46a]">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Reconnection Banner */}
      {connectionPhase === 'reconnecting' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="relative z-20 bg-yellow-500/20 backdrop-blur-md border-b border-yellow-500/30"
        >
          <div className="flex items-center justify-center gap-3 px-4 py-2">
            <svg className="h-5 w-5 text-yellow-300 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-medium text-yellow-300">
              Connection lost - attempting to reconnect...
            </span>
          </div>
        </motion.div>
      )}

      {/* Video Stage */}
      <div className="relative flex-1">
        {/* Remote Video (large, centered) */}
        <div className="absolute inset-4">
          <div className="relative h-full overflow-hidden rounded-2xl bg-black shadow-inner">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-contain"
            />
            {!remoteVideoRef.current?.srcObject && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center">
                  <div className="mb-4 text-6xl">🎥</div>
                  <p className="text-lg text-[#eaeaf0]/70">
                    Connecting to {peerName}...
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Local Preview - Bottom left on mobile (above controls), bottom-right on desktop */}
        <div className="fixed bottom-24 left-2 z-20 sm:top-auto sm:bottom-8 sm:left-auto sm:right-8">
          <div className="h-32 w-24 overflow-hidden rounded-lg bg-black shadow-xl sm:h-40 sm:w-56 sm:rounded-2xl border-2 border-white/20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      </div>

      {/* Controls Footer - Always Visible, Highest Z-Index, Touch-Friendly */}
      <div className="fixed bottom-0 left-0 right-0 z-[200] pointer-events-none" style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)',
      }}>
        <div className="flex items-center justify-center gap-4 px-6 pb-8 pt-12 pointer-events-auto bg-gradient-to-t from-black via-black/80 to-transparent">
          {/* Mic Toggle */}
          <button
            onClick={toggleMute}
            aria-pressed={isMuted}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            className="focus-ring rounded-full bg-black/80 backdrop-blur-md p-4 transition-all hover:bg-black/90 active:scale-95 border border-white/20"
          >
            <svg className="h-6 w-6 text-[#eaeaf0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isMuted ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>

          {/* Chat with notification badge */}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            aria-label="Toggle chat"
            className="focus-ring relative rounded-full bg-black/80 backdrop-blur-md p-4 transition-all hover:bg-black/90 active:scale-95 border border-white/20"
          >
            <svg className="h-6 w-6 text-[#eaeaf0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {/* Notification badge - show if has unread messages and chat closed */}
            {!chatOpen && messages.some(m => m.from !== getSession()?.userId) && (
              <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#ffc46a] border-2 border-black flex items-center justify-center">
                <span className="text-xs font-bold text-[#0a0a0c]">
                  {messages.filter(m => m.from !== getSession()?.userId).length}
                </span>
              </div>
            )}
          </button>

          {/* Give Social */}
          <button
            onClick={handleGiveSocial}
            aria-label="Share socials"
            className="focus-ring rounded-full bg-black/80 backdrop-blur-md p-4 transition-all hover:bg-black/90 active:scale-95 border border-[#ffc46a]/40"
          >
            <svg className="h-6 w-6 text-[#ffc46a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          {/* Leave */}
          <button
            onClick={() => setShowLeaveConfirm(true)}
            aria-label="End call"
            className="focus-ring rounded-full bg-black/80 backdrop-blur-md p-4 transition-all hover:bg-black/90 active:scale-95 border border-red-500/40"
          >
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chat Drawer - Fixed Position */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed right-0 top-0 bottom-0 z-40 flex w-full flex-col bg-black/95 backdrop-blur-md sm:w-96 border-l border-white/10"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <h3 className="font-playfair text-xl font-bold text-[#eaeaf0]">Chat</h3>
              <button
                onClick={() => setChatOpen(false)}
                className="focus-ring rounded-lg p-2 hover:bg-white/10"
              >
                <svg className="h-5 w-5 text-[#eaeaf0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.type === 'message' && (
                    <div
                      className={`rounded-lg p-3 ${
                        msg.from === 'system'
                          ? 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/30'
                          : msg.from === getSession()?.userId
                          ? 'bg-[#ffc46a]/20 text-[#eaeaf0] ml-8'
                          : 'bg-white/10 text-[#eaeaf0]/90 mr-8'
                      }`}
                    >
                      <p className="text-sm">{msg.text}</p>
                      <p className="mt-1 text-xs text-[#eaeaf0]/50">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                  {msg.type === 'social' && (
                    <div className="rounded-xl bg-green-500/10 p-4 border border-green-500/30">
                      <p className="mb-2 text-xs font-medium text-green-300">
                        {msg.from === getSession()?.userId ? 'You' : peerName} shared socials:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(msg.socials || {}).map(([platform, handle]: any) => 
                          handle && handle.trim() ? (
                            <div key={platform} className="rounded-lg bg-green-500/20 px-3 py-1 text-xs text-green-200">
                              {platform}: {handle}
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-white/10 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                />
                <button
                  onClick={sendMessage}
                  disabled={!chatInput.trim()}
                  className="focus-ring rounded-xl bg-[#ffc46a] px-4 py-2 text-sm font-medium text-[#0a0a0c] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Permission/Connection Error Sheet */}
      {showPermissionSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
          >
            {/* Icon based on error type */}
            <div className="mb-4 text-center text-6xl">
              {peerConnectionFailed ? '🔌' : connectionFailed ? '⚠️' : '📹'}
            </div>
            
            {/* Title based on error type */}
            <h3 className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0] text-center">
              {peerConnectionFailed 
                ? 'Partner Connection Failed' 
                : connectionFailed 
                  ? 'Connection Failed'
                  : 'Camera/Mic Access Needed'}
            </h3>
            
            {/* Error message */}
            <p className="mb-4 text-[#eaeaf0]/70 text-center">
              {permissionError || 'Please allow camera and microphone access to join the call.'}
            </p>
            
            {/* Additional context */}
            {peerConnectionFailed && (
              <div className="mb-6 rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
                <p className="text-sm text-yellow-200">
                  {peerName} could not establish a connection. They may have network issues, firewall restrictions, or denied camera/mic access.
                </p>
              </div>
            )}
            
            {connectionFailed && !peerConnectionFailed && (
              <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/30 p-4">
                <p className="text-sm text-red-200">
                  Your connection could not be established. Please check your internet connection and camera/microphone permissions.
                </p>
              </div>
            )}
            
            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  cleanupConnections();
                  router.push('/main');
                }}
                className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
              >
                {peerConnectionFailed ? 'Back to Main' : 'Leave'}
              </button>
              {!peerConnectionFailed && (
                <button
                  onClick={retryPermissions}
                  className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                >
                  Retry
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Partner Reconnecting Modal */}
      <AnimatePresence>
        {showReconnecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-yellow-500/50 text-center"
            >
              <div className="text-6xl mb-4">🔄</div>
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
                Partner Disconnected
              </h3>
              <p className="text-[#eaeaf0]/80 mb-6">
                Waiting for {peerName} to reconnect...
              </p>
              <div className="text-4xl font-mono font-bold text-yellow-300 mb-4">
                {reconnectCountdown}s
              </div>
              <p className="text-sm text-[#eaeaf0]/60">
                {reconnectCountdown > 0 
                  ? 'Session will end if they don\'t reconnect' 
                  : 'Grace period ended'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave Confirm */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
          >
            <h3 className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
              End this chat?
            </h3>
            <p className="mb-6 text-[#eaeaf0]/70">
              The call will end for both participants. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  console.log('[Room] Cancel button clicked');
                  setShowLeaveConfirm(false);
                }}
                className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log('[Room] End call button clicked in modal');
                  confirmLeave();
                }}
                className="focus-ring flex-1 rounded-xl bg-red-500/80 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
              >
                End call
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Give Social Confirm */}
      {showSocialConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
          >
            <h3 className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
              Share your socials?
            </h3>
            <p className="mb-6 text-[#eaeaf0]/70">
              This will share your saved social media handles with {peerName}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSocialConfirm(false)}
                className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={confirmGiveSocial}
                className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
              >
                Share
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Connecting Loading Screen */}
      {connectionPhase !== 'connected' && !connectionTimeout && !remoteTrackReceived && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8 px-8"
          >
            {/* Connection Phase Messages */}
            <div className="space-y-3">
              <h3 className="font-playfair text-3xl font-bold text-white">
                {connectionPhase === 'initializing' && 'Initializing...'}
                {connectionPhase === 'gathering' && 'Preparing connection...'}
                {connectionPhase === 'connecting' && `Connecting to ${peerName}...`}
                {connectionPhase === 'reconnecting' && '🔄 Reconnecting...'}
              </h3>
              <p className="text-base text-white/70 max-w-md mx-auto">
                {connectionPhase === 'initializing' && 'Setting up camera and microphone'}
                {connectionPhase === 'gathering' && 'Gathering network information for secure connection'}
                {connectionPhase === 'connecting' && 'Establishing peer-to-peer connection...'}
                {connectionPhase === 'reconnecting' && 'Connection lost - attempting to reconnect automatically (up to 10 seconds)'}
              </p>
            </div>

            {/* Progress Bar Only (removed spinning circle) */}
            <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mx-auto">
              <motion.div
                className="h-full bg-gradient-to-r from-[#ffc46a] to-[#ffc46a]"
                initial={{ width: '0%' }}
                animate={{ 
                  width: connectionPhase === 'initializing' ? '33%' : 
                         connectionPhase === 'gathering' ? '66%' : 
                         connectionPhase === 'connecting' ? '90%' :
                         connectionPhase === 'reconnecting' ? '75%' : '100%'
                }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* Helpful Tip */}
            <p className="text-xs text-white/40 max-w-sm mx-auto">
              {connectionPhase === 'connecting' && 'This may take a few seconds on mobile networks'}
              {connectionPhase === 'reconnecting' && 'Please wait while we restore your connection...'}
            </p>
          </motion.div>
        </div>
      )}

      {/* Connection Timeout Error */}
      {connectionTimeout && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6 max-w-md"
          >
            {/* Error Icon */}
            <div className="mx-auto w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h3 className="font-playfair text-2xl font-bold text-white">
                Connection Failed
              </h3>
              <p className="text-white/70">
                {peerName} may have connection issues or closed the app. The connection timed out after 45 seconds.
              </p>
            </div>

            {/* Help Text */}
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
              <p className="text-sm text-yellow-200">
                This can happen due to poor internet, firewall restrictions, or if the other person left.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => router.push('/main')}
                className="w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] 
                         shadow-lg transition-all hover:opacity-90"
              >
                Return to Main
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-white 
                         transition-all hover:bg-white/20"
              >
                Try Again
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Peer Disconnected Toast */}
      {peerDisconnected && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-red-500/90 px-6 py-3 shadow-lg backdrop-blur-sm"
          >
            <p className="font-medium text-white">
              {peerName} left the call
            </p>
          </motion.div>
        </div>
      )}

      {/* Floating Browser for External Links */}
      <FloatingBrowser
        isOpen={browserOpen}
        url={browserUrl}
        onClose={() => setBrowserOpen(false)}
      />
    </main>
  );
}

