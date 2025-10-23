'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { getSession } from '@/lib/session';
import { connectSocket } from '@/lib/socket';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { GIFPicker } from '@/components/chat/GIFPicker';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(agreedSeconds);
  const [rateLimited, setRateLimited] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [showGIFPicker, setShowGIFPicker] = useState(false);
  const [showVideoRequest, setShowVideoRequest] = useState(false);
  const [videoRequested, setVideoRequested] = useState(false);
  const [incomingVideoRequest, setIncomingVideoRequest] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(10);

  const socketRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    setCurrentUserId(session.userId); // Store userId once

    const socket = connectSocket(session.sessionToken);
    socketRef.current = socket;

    // Join room
    socket.emit('room:join', { roomId });
    
    // Listen for room security events
    socket.on('room:invalid', () => {
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
      setShowReconnecting(true);
      setReconnectCountdown(gracePeriodSeconds);
      
      const interval = setInterval(() => {
        setReconnectCountdown((prev: number) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });
    
    socket.on('room:partner-reconnected', () => {
      setShowReconnecting(false);
    });
    
    socket.on('room:ended-by-disconnect', () => {
      alert('Partner did not reconnect. Session ended.');
      router.push('/history');
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

    // Listen for new messages
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
      
      setMessages(prev => [...prev, newMessage]);
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
      // Redirect to video room with same params and correct initiator status
      router.push(`/room/${upgradeRoomId}?duration=${timeRemaining}&peerId=${peerUserId}&peerName=${encodeURIComponent(peerName)}&initiator=${isInitiator || false}`);
    });

    // Listen for video decline
    socket.on('textchat:video-declined', () => {
      console.log('[TextChat] Video request declined');
      setVideoRequested(false);
      alert(`${peerName} declined the video request. Continuing text chat.`);
    });

    // Listen for session end
    socket.on('session:finalized', () => {
      console.log('[TextChat] Session ended');
      router.push('/history');
    });

    return () => {
      // Cleanup timers
      if (timerRef.current) clearInterval(timerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      
      // Remove all socket listeners
      socket.off('textchat:message');
      socket.off('textchat:rate-limited');
      socket.off('textchat:error');
      socket.off('textchat:video-requested');
      socket.off('textchat:upgrade-to-video');
      socket.off('textchat:video-declined');
      socket.off('session:finalized');
    };
  }, [roomId, agreedSeconds, peerUserId, peerName, router]);

  // Start timer
  useEffect(() => {
    if (timerRef.current) return; // Already started
    
    let elapsed = 0;
    
    timerRef.current = setInterval(() => {
      elapsed++;
      setTimeRemaining(prev => {
        const next = prev - 1;
        
        // Show video request button after 60 seconds elapsed
        if (elapsed >= 60 && !showVideoRequest) {
          setShowVideoRequest(true);
        }
        
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Timer expired - end session
          if (socketRef.current) {
            socketRef.current.emit('call:end', { roomId });
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // Empty deps - only run once

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Send text message
  const handleSendMessage = (content: string) => {
    if (!socketRef.current) return;
    
    socketRef.current.emit('textchat:send', {
      roomId,
      messageType: 'text',
      content,
    });
  };

  // Send GIF
  const handleSendGIF = (gifUrl: string, gifId: string) => {
    if (!socketRef.current) return;
    
    socketRef.current.emit('textchat:send', {
      roomId,
      messageType: 'gif',
      gifUrl,
      gifId,
    });
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

  // Mark message as read
  const handleMessageRead = (messageId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('textchat:mark-read', { messageId });
  };

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

  return (
    <main className="fixed inset-0 flex flex-col bg-[#0a0a0c] overflow-hidden z-50" style={{ 
      height: '100dvh', // Dynamic viewport height (accounts for mobile keyboard)
      maxHeight: '-webkit-fill-available',
    }}>
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
            <p className="text-xs text-[#eaeaf0]/60">Active now</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* End Call Button */}
          <button
            onClick={() => {
              if (confirm('End this chat?')) {
                if (socketRef.current) {
                  socketRef.current.emit('call:end', { roomId });
                }
                router.push('/history');
              }
            }}
            className="rounded-full bg-red-500/20 p-2 hover:bg-red-500/30 transition-all"
            aria-label="End chat"
          >
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* Timer */}
          <div className="font-playfair text-xl sm:text-2xl font-bold text-[#ff9b6b]">
            {formatTime(timeRemaining)}
          </div>

          {/* Video Request Button (appears after 60s) */}
          {showVideoRequest && !videoRequested && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={handleRequestVideo}
              className="flex items-center gap-2 rounded-full bg-[#ff9b6b] px-4 py-2 text-sm font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Request Video
            </motion.button>
          )}

          {videoRequested && (
            <div className="rounded-full bg-yellow-500/20 px-4 py-2">
              <p className="text-xs text-yellow-300">Video requested...</p>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area - Padded at bottom for fixed input */}
      <div className="flex-1 overflow-hidden pb-24">
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          partnerName={peerName}
          onMessageRead={handleMessageRead}
        />
      </div>

      {/* Input Area - Fixed at bottom, keyboard-aware */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 p-4 bg-black/95 backdrop-blur-md z-30" style={{
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', // iOS safe area
      }}>
        <ChatInput
          onSendMessage={handleSendMessage}
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
              className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border-2 border-[#ff9b6b]/50 text-center"
            >
              <div className="text-6xl mb-4">📹</div>
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
                Upgrade to Video?
              </h3>
              <p className="text-[#eaeaf0]/80 mb-6">
                {peerName} wants to switch to video chat. Your timer will continue from {formatTime(timeRemaining)}.
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
                  className="flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity"
                >
                  Accept Video
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

