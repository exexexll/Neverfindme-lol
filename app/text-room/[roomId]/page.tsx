'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { getSession } from '@/lib/session';
import { connectSocket } from '@/lib/socket';
import { reportUser } from '@/lib/api';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { GIFPicker } from '@/components/chat/GIFPicker';
import { FloatingBrowser } from '@/components/FloatingBrowser';
import { useLinkInterceptor } from '@/lib/useLinkInterceptor';

type ViewState = 'chat' | 'ended';

interface Message {
  messageId: string;
  from: string;
  fromName: string;
  fromSelfie?: string;
  messageType: 'text' | 'image' | 'file' | 'gif' | 'system';
  content?: string;
  fileUrl?: string;
  fileName?: string;
  gifUrl?: string;
  timestamp: Date;
  readAt?: Date;
}

export default function TextChatRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Room params
  const roomId = params.roomId as string;
  const agreedSeconds = parseInt(searchParams.get('duration') || '0');
  const peerUserId = searchParams.get('peerId') || '';
  const peerName = searchParams.get('peerName') || 'Partner';
  const peerSelfie = searchParams.get('peerSelfie') || '';

  // State
  const [viewState, setViewState] = useState<ViewState>('chat');
  const [sessionId, setSessionId] = useState('');
  const [sessionDuration, setSessionDuration] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  // TORCH RULE: No fixed timer for text mode - unlimited time based on activity
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState(60);
  const [rateLimited, setRateLimited] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [showGIFPicker, setShowGIFPicker] = useState(false);
  const [showVideoRequest, setShowVideoRequest] = useState(false);
  const [videoRequested, setVideoRequested] = useState(false);
  const [incomingVideoRequest, setIncomingVideoRequest] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(10);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState('');
  
  // Floating browser state
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  
  // BEST-IN-CLASS: Offline detection and message queueing
  const [isOnline, setIsOnline] = useState(true);
  
  // CRITICAL FIX: Use ref for message queue to avoid stale closures in socket handlers
  const messageQueueRef = useRef<Array<{
    roomId: string;
    messageType: string;
    content?: string;
    gifUrl?: string;
    gifId?: string;
    fileUrl?: string;
    fileName?: string;
    timestamp: number;
  }>>([]);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0); // For UI only

  const socketRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const disconnectCountdownRef = useRef<NodeJS.Timeout | null>(null); // CRITICAL: Track disconnect countdown
  const partnerDisconnectCountdownRef = useRef<NodeJS.Timeout | null>(null); // CRITICAL: Track partner disconnect countdown
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Link interceptor - open external links in floating browser
  useLinkInterceptor({
    onLinkClick: (url) => {
      console.log('[TextRoom] Opening link in browser:', url);
      setBrowserUrl(url);
      setBrowserOpen(true);
    },
    enabled: !browserOpen, // Disable when browser is open
  });

  // CRITICAL: Exit protection + Visibility handling (prevent accidental close/back + timer freeze)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave this chat?';
      return e.returnValue;
    };
    
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      setShowEndConfirm(true); // Show confirmation modal instead
    };
    
    // CRITICAL: Handle tab visibility (pause timers when hidden to prevent freeze)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[TextRoom] Tab hidden - timers may slow down');
        // Note: Socket.io will maintain connection, timers continue but may lag
      } else {
        console.log('[TextRoom] Tab visible again - timers resuming');
        // Force sync state with server when tab becomes visible
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('textchat:sync-state', { roomId });
        }
      }
    };
    
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId]);

  // Initialize socket and load message history
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

    setCurrentUserId(session.userId);

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        setNotificationsEnabled(permission === 'granted');
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }

    const socket = connectSocket(session.sessionToken);
    socketRef.current = socket;

    // CRITICAL: Check if this is a page reload (reconnection attempt)
    const storedRoomId = sessionStorage.getItem('current_text_room_id');
    const wasActive = sessionStorage.getItem('text_room_active') === 'true';
    const lastJoinTime = parseInt(sessionStorage.getItem('text_room_join_time') || '0');
    const timeSinceJoin = Date.now() - lastJoinTime;
    
    const isSameRoom = storedRoomId === roomId;
    const isRecentReload = timeSinceJoin > 0 && timeSinceJoin < 10000; // 10 seconds (grace period)
    
    if (isSameRoom && wasActive && isRecentReload) {
      // Only show reconnecting if reload was quick enough for grace period
      setShowReconnecting(true);
    } else if (!isSameRoom && wasActive) {
      // Different room - clear old data
      sessionStorage.removeItem('text_room_active');
      sessionStorage.removeItem('text_room_join_time');
      sessionStorage.removeItem('current_text_room_id');
    } else if (isSameRoom && wasActive && !isRecentReload) {
      // Same room but too long ago - room likely deleted, clear data
      sessionStorage.removeItem('text_room_active');
      sessionStorage.removeItem('text_room_join_time');
      sessionStorage.removeItem('current_text_room_id');
    }
    
    // Store room info immediately (optimistic)
    sessionStorage.setItem('current_text_room_id', roomId);
    sessionStorage.setItem('text_room_join_time', Date.now().toString());
    sessionStorage.setItem('text_room_active', 'true');
    
    // Join room
    socket.emit('room:join', { roomId });
    
    // Update timestamp on successful join confirmation
    socket.on('room:joined', () => {
      sessionStorage.setItem('text_room_join_time', Date.now().toString());
    });
    
    // CRITICAL FIX: Handle socket reconnection properly with queue flushing
    const handleSocketReconnect = () => {
      // Check if we're still in this room (user didn't navigate away)
      const currentPath = window.location.pathname;
      if (!currentPath.includes(roomId)) {
        console.log('[TextRoom] Socket reconnected but user navigated away - not rejoining');
        return;
      }
      
      console.log('[TextRoom] ✅ Socket reconnected - rejoining room');
      setShowReconnecting(false);
      setIsOnline(true);
      
      // CRITICAL FIX: Clear disconnect countdown when reconnected
      if (disconnectCountdownRef.current) {
        clearInterval(disconnectCountdownRef.current);
        disconnectCountdownRef.current = null;
      }
      
      // Re-auth first
      const session = getSession();
      if (session) {
        socket.emit('auth', { sessionToken: session.sessionToken });
      }
      
      // Then rejoin room
      socket.emit('room:join', { roomId });
      
      // FLUSH MESSAGE QUEUE on reconnect (using ref to avoid stale closure)
      if (messageQueueRef.current.length > 0) {
        console.log(`[TextRoom] Flushing ${messageQueueRef.current.length} queued messages after reconnect`);
        
        // CRITICAL: Deduplicate queue before sending
        const uniqueMessages = new Map<string, any>();
        messageQueueRef.current.forEach(msg => {
          const key = `${msg.timestamp}-${msg.content || msg.gifUrl || msg.fileUrl}`;
          uniqueMessages.set(key, msg);
        });
        
        Array.from(uniqueMessages.values()).forEach(msg => {
          socket.emit('textchat:send', msg);
        });
        
        messageQueueRef.current = [];
        setQueuedMessageCount(0);
      }
      
      // RELOAD MESSAGE HISTORY (state sync)
      socket.emit('textchat:get-history', { roomId }, (response: any) => {
        if (response.success && response.messages) {
          console.log(`[TextRoom] Reloaded ${response.messages.length} messages after reconnect`);
          setMessages(response.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.sent_at),
            readAt: m.read_at ? new Date(m.read_at) : undefined,
          })));
        }
      });
    };
    
    // Register handler
    socket.on('reconnect', handleSocketReconnect);
    
    // Store handler reference for cleanup
    (socket as any)._textRoomReconnectHandler = handleSocketReconnect;
    
    socket.on('room:invalid', () => {
      sessionStorage.removeItem('text_room_active');
      sessionStorage.removeItem('text_room_join_time');
      sessionStorage.removeItem('current_text_room_id');
      alert('This room does not exist');
      router.push('/main');
    });
    
    socket.on('room:unauthorized', () => {
      alert('You are not authorized to join this room');
      router.push('/main');
    });
    
    socket.on('room:ended', () => {
      alert('This session has ended');
      router.push('/history');
    });
    
    socket.on('room:partner-disconnected', ({ gracePeriodSeconds }: any) => {
      console.log('[TextRoom] Partner disconnected, grace period:', gracePeriodSeconds);
      
      // CRITICAL FIX: Clear existing countdown to prevent duplicates
      if (partnerDisconnectCountdownRef.current) {
        clearInterval(partnerDisconnectCountdownRef.current);
        partnerDisconnectCountdownRef.current = null;
      }
      
      // Set countdown and show popup
      setReconnectCountdown(gracePeriodSeconds || 10);
      setShowReconnecting(true);
      
      const interval = setInterval(() => {
        setReconnectCountdown((prev: number) => {
          if (prev <= 1) {
            clearInterval(interval);
            partnerDisconnectCountdownRef.current = null;
            setShowReconnecting(false); // CRITICAL: Auto-hide when countdown ends
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Store interval ref for cleanup
      partnerDisconnectCountdownRef.current = interval;
    });
    
    socket.on('room:partner-reconnected', ({ userId }: any) => {
      console.log('[TextRoom] Partner reconnected');
      
      // CRITICAL FIX: Clear countdown interval FIRST
      if (partnerDisconnectCountdownRef.current) {
        clearInterval(partnerDisconnectCountdownRef.current);
        partnerDisconnectCountdownRef.current = null;
      }
      
      // Reset countdown to default
      setReconnectCountdown(10);
      
      // CRITICAL: Hide popup immediately (prevent flash)
      setShowReconnecting(false);
    });
    
    socket.on('room:ended-by-disconnect', () => {
      router.push('/history');
    });
    
    // TORCH RULE: Inactivity system listeners
    socket.on('textroom:inactivity-warning', ({ secondsRemaining }: any) => {
      setInactivityWarning(true);
      setInactivityCountdown(secondsRemaining);
    });
    
    socket.on('textroom:inactivity-countdown', ({ secondsRemaining }: any) => {
      setInactivityCountdown(secondsRemaining);
    });
    
    socket.on('textroom:inactivity-cleared', () => {
      setInactivityWarning(false);
    });
    
    socket.on('textroom:ended-inactivity', () => {
      alert('Session ended due to inactivity');
      router.push('/history');
    });
    
    socket.on('textchat:typing', () => {
      setPartnerTyping(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      const timeout = setTimeout(() => {
        setPartnerTyping(false);
      }, 3000);
      
      typingTimeoutRef.current = timeout;
    });
    
    // BEST-IN-CLASS: Offline detection with countdown
    socket.on('disconnect', (reason) => {
      console.log('[TextRoom] Socket disconnected:', reason);
      setShowReconnecting(true);
      setReconnectCountdown(10);
      setIsOnline(false); // Mark as offline
      
      // CRITICAL FIX: Clear existing countdown to prevent duplicates
      if (disconnectCountdownRef.current) {
        clearInterval(disconnectCountdownRef.current);
      }
      
      // Start countdown
      const interval = setInterval(() => {
        setReconnectCountdown((prev: number) => {
          if (prev <= 1) {
            clearInterval(interval);
            disconnectCountdownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Store interval ref for cleanup
      disconnectCountdownRef.current = interval;
    });

    // Load message history
    socket.emit('textchat:get-history', { roomId }, (response: any) => {
      if (response.success && response.messages) {
        setMessages(response.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.sent_at),
          readAt: m.read_at ? new Date(m.read_at) : undefined,
        })));
      }
    });

    socket.on('textchat:message', (msg: any) => {
      const newMessage: Message = {
        messageId: msg.messageId,
        from: msg.from,
        fromName: msg.fromName,
        fromSelfie: msg.fromSelfie,
        messageType: msg.messageType,
        content: msg.content,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        gifUrl: msg.gifUrl,
        timestamp: new Date(msg.timestamp),
      };
      
      // CRITICAL: Prevent duplicates (reconnection may resend messages)
      setMessages(prev => {
        const exists = prev.some(m => m.messageId === newMessage.messageId);
        if (exists) {
          console.log('[TextRoom] Duplicate message ignored:', newMessage.messageId);
          return prev;
        }
        return [...prev, newMessage];
      });
      
      // Show notification if page not in focus
      if (notificationsEnabled && document.hidden && msg.from !== session.userId) {
        const notifContent = msg.messageType === 'text' ? msg.content : 
                            msg.messageType === 'gif' ? '📷 Sent a GIF' :
                            msg.messageType === 'image' ? '🖼️ Sent an image' : '📎 Sent a file';
        
        new Notification(msg.fromName || peerName, {
          body: notifContent,
          icon: msg.fromSelfie || '/logo.svg',
          badge: '/logo.svg',
          tag: 'text-chat-' + msg.messageId,
          requireInteraction: false,
          silent: false,
        });
      }
    });

    // Listen for rate limiting
    socket.on('textchat:rate-limited', ({ retryAfter }: { retryAfter: number }) => {
      setRateLimited(true);
      setCooldownRemaining(retryAfter);
      
      // Clear existing cooldown timer
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      
      // Start cooldown timer
      cooldownTimerRef.current = setInterval(() => {
        setCooldownRemaining(prev => {
          const next = prev - 1;
          if (next <= 0) {
            setRateLimited(false);
            if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
            return 0;
          }
          return next;
        });
      }, 1000);
    });

    // Listen for errors
    socket.on('textchat:error', ({ error }: { error: string }) => {
      console.error('[TextChat] Error:', error);
      alert(error); // Simple error display for now
    });

    // Listen for video upgrade request
    socket.on('textchat:video-requested', ({ fromUserId }: { fromUserId: string }) => {
      console.log('[TextChat] Video upgrade requested by partner');
      setIncomingVideoRequest(true);
    });

    // Listen for video upgrade accepted
    socket.on('textchat:upgrade-to-video', ({ roomId: upgradeRoomId, isInitiator }: { roomId: string; isInitiator?: boolean }) => {
      console.log('[TextChat] Both users accepted video - upgrading...');
      // Redirect to video room with default duration since text mode has no fixed timer
      // Use 300s (5 minutes) as default video duration after upgrade
      router.push(`/room/${upgradeRoomId}?duration=300&peerId=${peerUserId}&peerName=${encodeURIComponent(peerName)}&initiator=${isInitiator || false}`);
    });

    // Listen for video decline
    socket.on('textchat:video-declined', () => {
      console.log('[TextChat] Video request declined');
      setVideoRequested(false);
      alert(`${peerName} declined the video request. Continuing text chat.`);
    });

    // Listen for session end
    socket.on('session:finalized', ({ sessionId: sid }: any) => {
      console.log('[TextChat] 🎬 SESSION FINALIZED:', sid);
      setSessionId(sid);
      setViewState('ended');
    });

    return () => {
      // CRITICAL FIX: Cleanup ALL timers to prevent memory leaks
      if (timerRef.current) clearInterval(timerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      if (disconnectCountdownRef.current) clearInterval(disconnectCountdownRef.current);
      if (partnerDisconnectCountdownRef.current) clearInterval(partnerDisconnectCountdownRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      // CRITICAL FIX: Remove ALL socket listeners
      socket.off('textchat:message');
      socket.off('textchat:rate-limited');
      socket.off('textchat:error');
      socket.off('textchat:video-requested');
      socket.off('textchat:upgrade-to-video');
      socket.off('textchat:video-declined');
      socket.off('session:finalized');
      socket.off('textchat:typing');
      socket.off('textroom:inactivity-warning');
      socket.off('textroom:inactivity-countdown');
      socket.off('textroom:inactivity-cleared');
      socket.off('textroom:ended-inactivity');
      socket.off('room:partner-disconnected');
      socket.off('room:partner-reconnected');
      socket.off('room:ended-by-disconnect');
      socket.off('room:invalid');
      socket.off('room:joined');
      socket.off('room:unauthorized');
      socket.off('room:ended');
      socket.off('disconnect');
      
      // Remove reconnect handler using stored reference
      if ((socket as any)._textRoomReconnectHandler) {
        socket.off('reconnect', (socket as any)._textRoomReconnectHandler);
        delete (socket as any)._textRoomReconnectHandler;
      }
      
      console.log('[TextRoom] ✅ All 21 text room listeners and timers cleaned up');
    };
  }, [roomId, agreedSeconds, peerUserId, peerName, router]);

  // CRITICAL FIX: Send heartbeat from text room to prevent being marked offline
  useEffect(() => {
    if (!socketRef.current) return;
    
    // Send heartbeat every 20s while in room
    const heartbeatInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('heartbeat', { timestamp: Date.now() });
        console.log('[TextRoom] 💓 Heartbeat sent (keep online during chat)');
      }
    }, 20000);
    
    return () => clearInterval(heartbeatInterval);
  }, []);

  useEffect(() => {
    let elapsed = 0;
    
    const interval = setInterval(() => {
      elapsed++;
        
      if (elapsed >= 60) {
        setShowVideoRequest(true);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Track session duration
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // CRITICAL: End session client-side when countdown reaches 0
  // Don't wait for server (which checks every 30s) - more responsive UX
  useEffect(() => {
    if (inactivityWarning && inactivityCountdown <= 0) {
      alert('Session ended due to inactivity');
      setViewState('ended');
    }
  }, [inactivityCountdown, inactivityWarning]);

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // BEST-IN-CLASS: Send text message with offline queueing
  const handleSendMessage = (content: string) => {
    if (!socketRef.current) return;
    
    const message = {
      roomId,
      messageType: 'text',
      content,
      timestamp: Date.now(),
    };
    
    if (!isOnline || !socketRef.current.connected) {
      // QUEUE message for later (using ref to avoid stale closure)
      console.log('[TextRoom] Offline - queueing message');
      messageQueueRef.current.push(message);
      setQueuedMessageCount(messageQueueRef.current.length);
      
      // Show optimistically in UI with pending state
      const optimisticMessage: Message = {
        messageId: `pending-${Date.now()}`,
        from: currentUserId,
        fromName: 'You',
        messageType: 'text',
        content,
        timestamp: new Date(message.timestamp),
      };
      setMessages(prev => [...prev, optimisticMessage]);
    } else {
      // Send immediately
      socketRef.current.emit('textchat:send', message);
    }
  };

  // BEST-IN-CLASS: Send GIF with offline queueing
  const handleSendGIF = (gifUrl: string, gifId: string) => {
    if (!socketRef.current) return;
    
    const message = {
      roomId,
      messageType: 'gif',
      gifUrl,
      gifId,
      timestamp: Date.now(),
    };
    
    if (!isOnline || !socketRef.current.connected) {
      // QUEUE GIF for later (using ref to avoid stale closure)
      console.log('[TextRoom] Offline - queueing GIF');
      messageQueueRef.current.push(message);
      setQueuedMessageCount(messageQueueRef.current.length);
      
      // Show optimistically
      const optimisticMessage: Message = {
        messageId: `pending-${Date.now()}`,
        from: currentUserId,
        fromName: 'You',
        messageType: 'gif',
        gifUrl,
        timestamp: new Date(message.timestamp),
      };
      setMessages(prev => [...prev, optimisticMessage]);
    } else {
      // Send immediately
      socketRef.current.emit('textchat:send', message);
    }
  };

  // Request video upgrade
  const handleRequestVideo = () => {
    if (!socketRef.current) return;
    
    socketRef.current.emit('textchat:request-video', { roomId });
    setVideoRequested(true);
  };

  // Accept incoming video request
  const handleAcceptVideo = () => {
    if (!socketRef.current) return;
    
    socketRef.current.emit('textchat:accept-video', { roomId });
    setIncomingVideoRequest(false);
  };

  // Decline incoming video request
  const handleDeclineVideo = () => {
    if (!socketRef.current) return;
    
    socketRef.current.emit('textchat:decline-video', { roomId });
    setIncomingVideoRequest(false);
  };

  const handleMessageRead = (messageId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('textchat:mark-read', { messageId });
  };

  // Report user handler
  const handleReportUser = async () => {
    console.log('[TextRoom] Reporting user:', peerUserId);
    
    const session = getSession();
    if (!session) {
      setReportError('Session expired. Please refresh the page.');
      return;
    }

    if (!peerUserId) {
      setReportError('Unable to identify user to report');
      return;
    }

    try {
      await reportUser(
        session.sessionToken,
        peerUserId,
        reportReason || 'No reason provided',
        roomId
      );
      
      setReportSubmitted(true);
      setShowReportConfirm(false);
      console.log('[TextRoom] ✅ User reported successfully');
    } catch (error: any) {
      console.error('[TextRoom] ❌ Failed to report user:', error);
      setReportError(error.message || 'Failed to submit report');
    }
  };

  useEffect(() => {
    const messagesDiv = document.querySelector('.messages-area');
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }, [messages.length, notificationsEnabled]);

  // Hide global layout elements (header, footer)
  useEffect(() => {
    const wrapper = document.querySelector('.chat-room-wrapper');
    if (wrapper) {
      (wrapper as HTMLElement).style.display = 'none';
    }
    
    return () => {
      const wrapper = document.querySelector('.chat-room-wrapper');
      if (wrapper) {
        (wrapper as HTMLElement).style.display = '';
      }
    };
  }, []);

  // Ending Dashboard (like video mode)
  if (viewState === 'ended') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-6 rounded-2xl bg-white/5 p-8 text-center shadow-2xl"
        >
          <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0]">
            Chat ended
          </h1>
          
          <div className="space-y-2">
            <p className="text-lg text-[#eaeaf0]/70">
              Conversation with <span className="font-bold text-[#eaeaf0]">{peerName}</span>
            </p>
            <p className="text-sm text-[#eaeaf0]/50">
              Duration: {formatTime(sessionDuration)}
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
                onClick={() => setShowReportConfirm(true)}
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

        {/* Report Confirm Modal */}
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
    <main className="fixed inset-0 flex flex-col bg-[#0a0a0c] overflow-hidden z-50" style={{ 
      height: '100dvh', // Dynamic viewport height (accounts for mobile keyboard)
      maxHeight: '-webkit-fill-available',
    }}
    // Prevent viewport zoom on input focus (iOS Safari)
    onTouchStart={(e) => {
      // Prevent page from jumping when keyboard appears
      if ((e.target as HTMLElement).tagName === 'INPUT') {
        (e.target as HTMLInputElement).style.fontSize = '16px';
      }
    }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          {peerSelfie && (
            <Image
              src={peerSelfie}
              alt={peerName}
              width={40}
              height={40}
              className="rounded-full"
            />
          )}
          <div>
            <p className="font-medium text-[#eaeaf0]">{peerName}</p>
            <p className="text-xs text-[#eaeaf0]/60">
              {isOnline ? 'Active now' : 'Reconnecting...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* End Call Button - Always visible */}
          <button
            onClick={() => setShowEndConfirm(true)}
            className="rounded-full bg-red-500/20 p-2 hover:bg-red-500/30 transition-all"
            aria-label="End chat"
          >
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* TORCH RULE: Activity indicator instead of timer */}
          <div className="flex items-center gap-2">
            {inactivityWarning ? (
              <div className="flex items-center gap-2 text-yellow-300">
                <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium">Inactive: {inactivityCountdown}s</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-300">
                <span className="h-2 w-2 rounded-full bg-green-300 animate-pulse" />
                <span className="text-sm font-medium">● Active</span>
              </div>
            )}
          </div>

          {/* Video Upgrade Button - Desktop only (mobile version below messages) */}
          <AnimatePresence>
            {showVideoRequest && !videoRequested && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={handleRequestVideo}
                className="hidden sm:flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ffc46a] to-[#ffc46a] px-4 py-2 text-sm font-bold text-[#0a0a0c] hover:shadow-lg hover:shadow-[#ffc46a]/50 transition-all shadow-md"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Video
              </motion.button>
            )}

            {videoRequested && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="hidden sm:block rounded-full bg-yellow-500/20 px-3 py-1.5 border border-yellow-500/30"
              >
                <p className="text-xs font-medium text-yellow-300">Waiting...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Offline Banner - Shows when messages are queued */}
      <AnimatePresence>
        {!isOnline && queuedMessageCount > 0 && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="mx-4 mt-2 rounded-xl bg-yellow-500/20 border border-yellow-500/30 p-3"
          >
            <div className="flex items-center gap-2 text-sm text-yellow-300">
              <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <span>Offline - {queuedMessageCount} message{queuedMessageCount > 1 ? 's' : ''} queued</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Video Upgrade Button - Floating above messages */}
      <AnimatePresence>
        {showVideoRequest && !videoRequested && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="sm:hidden mx-4 mt-2"
          >
            <button
              onClick={handleRequestVideo}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffc46a] to-[#ffc46a] px-4 py-3 text-sm font-bold text-[#0a0a0c] shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Upgrade to Video Call
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area - Scrollable with bottom padding for input */}
      <div className="messages-area flex-1 overflow-y-auto overflow-x-hidden" style={{
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}>
        <div className="p-4 pb-40 space-y-1" style={{ minHeight: '100%' }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-lg font-medium text-[#eaeaf0] mb-2">Start the conversation</h3>
              <p className="text-sm text-[#eaeaf0]/60">Send a message to {peerName}</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble
                  key={message.messageId}
                  message={message}
                  isOwn={message.from === currentUserId}
                  showSender={true}
                />
              ))}
              
              {partnerTyping && (
                <div className="flex items-start gap-2 px-0 py-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 overflow-hidden">
                    {peerSelfie && (
                      <Image src={peerSelfie} alt={peerName} width={32} height={32} className="object-cover" />
                    )}
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <div className="flex gap-1">
                      <motion.div
                        className="w-2 h-2 rounded-full bg-[#eaeaf0]/60"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                      />
                      <motion.div
                        className="w-2 h-2 rounded-full bg-[#eaeaf0]/60"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                      />
                      <motion.div
                        className="w-2 h-2 rounded-full bg-[#eaeaf0]/60"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Input Area - Fixed at bottom, keyboard-aware, prevents page jump */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/95 backdrop-blur-md z-30" style={{
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', // iOS safe area
      }}>
        {/* Action Buttons Row - Social, File, GIF */}
        <div className="flex items-center gap-2 px-4 pt-2 pb-1 border-b border-white/5">
          {/* Share Social Button */}
          <button
            onClick={async () => {
              const session = getSession();
              if (!session || !socketRef.current) return;
              
              // Get user's preset socials from localStorage
              const userSocials = localStorage.getItem('bumpin_user_socials');
              if (userSocials) {
                try {
                  const socials = JSON.parse(userSocials);
                  socketRef.current.emit('room:giveSocial', {
                    roomId,
                    socials,
                  });
                  alert('Socials shared with ' + peerName);
                } catch (e) {
                  alert('No socials set. Update them in Settings.');
                }
              } else {
                alert('No socials set. Add them in Settings first.');
              }
            }}
            className="flex-shrink-0 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all"
            aria-label="Share socials"
          >
            <svg className="w-5 h-5 text-[#ffc46a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          <span className="text-xs text-[#eaeaf0]/40">Share socials</span>
        </div>

        {/* Message Input */}
        <div className="px-4 py-2">
          <ChatInput
            onSendMessage={handleSendMessage}
            onTyping={() => {
              // Emit typing event (throttled by ChatInput component)
              if (socketRef.current) {
                socketRef.current.emit('textchat:typing', { roomId, userId: currentUserId });
              }
            }}
            onSendFile={async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.pdf,.doc,.docx,.txt';
            input.onchange = async (e: any) => {
              const file = e.target?.files?.[0];
              if (!file) return;
              
              // Check size (5MB)
              if (file.size > 5 * 1024 * 1024) {
                alert('File too large (max 5MB)');
                return;
              }
              
              try {
                const session = getSession();
                if (!session) return;
                
                const { uploadChatFile } = await import('@/lib/chatFileUpload');
                const result = await uploadChatFile(file, session.sessionToken);
                
                // Send as message
                if (socketRef.current) {
                  socketRef.current.emit('textchat:send', {
                    roomId,
                    messageType: file.type.startsWith('image/') ? 'image' : 'file',
                    fileUrl: result.fileUrl,
                    fileName: result.fileName,
                    fileSizeBytes: result.fileSizeBytes,
                  });
                }
              } catch (error: any) {
                alert(error.message || 'Upload failed');
              }
            };
            input.click();
          }}
            onSendGIF={() => setShowGIFPicker(true)}
            rateLimited={rateLimited}
            cooldownRemaining={cooldownRemaining}
          />
        </div>
      </div>

      {/* GIF Picker Modal */}
      <AnimatePresence>
        {showGIFPicker && (
          <GIFPicker
            onSelectGIF={handleSendGIF}
            onClose={() => setShowGIFPicker(false)}
          />
        )}
      </AnimatePresence>

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

      {/* Incoming Video Request Modal */}
      <AnimatePresence>
        {incomingVideoRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-[#ffc46a]/50 text-center"
            >
              <div className="text-6xl mb-4">📹</div>
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
                Upgrade to Video?
              </h3>
              <p className="text-[#eaeaf0]/80 mb-6">
                {peerName} wants to switch to video chat. You&apos;ll start a 5-minute video call.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeclineVideo}
                  className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={handleAcceptVideo}
                  className="flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity"
                >
                  Accept Video
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End Chat Confirmation Modal */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-red-500/50 text-center"
            >
              <div className="text-6xl mb-4">👋</div>
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
                End Chat?
              </h3>
              <p className="text-[#eaeaf0]/80 mb-6">
                Are you sure you want to end this conversation with {peerName}?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    console.log('[TextRoom] Ending chat via button');
                    if (socketRef.current) {
                      socketRef.current.emit('call:end', { roomId });
                    }
                    setShowEndConfirm(false);
                    // Don't push to history immediately - wait for session:finalized
                  }}
                  className="flex-1 rounded-xl bg-red-500 px-6 py-3 font-medium text-white hover:opacity-90 transition-opacity"
                >
                  End Chat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Browser for External Links */}
      <FloatingBrowser
        isOpen={browserOpen}
        url={browserUrl}
        onClose={() => setBrowserOpen(false)}
      />
    </main>
  );
}

