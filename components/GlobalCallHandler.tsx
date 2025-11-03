'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectSocket, getSocket } from '@/lib/socket';
import { getSession } from '@/lib/session';
import { backgroundQueue } from '@/lib/backgroundQueue';
import { CalleeNotification } from '@/components/matchmake/CalleeNotification';

/**
 * GlobalCallHandler - Handles incoming call notifications across ALL pages
 * Must be mounted in root layout to persist across navigation
 */
export function GlobalCallHandler() {
  const router = useRouter();
  const [incomingInvite, setIncomingInvite] = useState<any>(null);

  // CRITICAL: Setup global socket listeners that persist across all pages
  useEffect(() => {
    // CRITICAL: Connect socket if not already connected
    const session = getSession();
    if (!session) {
      console.log('[GlobalCallHandler] No session, skipping socket setup');
      return;
    }

    // Get or create socket connection
    let socket = getSocket();
    if (!socket || !socket.connected) {
      console.log('[GlobalCallHandler] Socket not connected, connecting now...');
      socket = connectSocket(session.sessionToken);
      
      // CRITICAL: Initialize background queue with the new socket
      if (socket) {
        backgroundQueue.init(socket);
        console.log('[GlobalCallHandler] Initialized background queue with socket');
      }
    }

    if (!socket) {
      console.error('[GlobalCallHandler] Failed to get/create socket');
      return;
    }

    console.log('[GlobalCallHandler] Setting up persistent call listeners');

    // Listener 1: Incoming call notification
    const handleCallNotify = (data: any) => {
      console.log('[GlobalCallHandler] ✅ INCOMING CALL:', data);
      console.log('[GlobalCallHandler] From:', data.fromUser?.name);
      console.log('[GlobalCallHandler] Current page:', window.location.pathname);
      setIncomingInvite(data);
    };

    // Listener 2: Call starting (both users accepted)
    const handleCallStart = ({ roomId, agreedSeconds, isInitiator, chatMode, peerUser }: any) => {
      console.log('[GlobalCallHandler] ✅ CALL STARTING:', { roomId, agreedSeconds, chatMode });
      console.log('[GlobalCallHandler] Navigating to room from:', window.location.pathname);

      const mode = chatMode || 'video';

      // Navigate to appropriate room
      if (mode === 'text') {
        router.push(
          `/text-room/${roomId}?duration=${agreedSeconds}&peerId=${peerUser.userId}&peerName=${encodeURIComponent(peerUser.name)}&peerSelfie=${encodeURIComponent(peerUser.selfieUrl || '')}`
        );
      } else {
        router.push(
          `/room/${roomId}?duration=${agreedSeconds}&peerId=${peerUser.userId}&peerName=${encodeURIComponent(peerUser.name)}&initiator=${isInitiator}`
        );
      }
    };

    // Listen for background queue events (custom events from backgroundQueue.ts)
    const handleBackgroundCall = (e: Event) => {
      const data = (e as CustomEvent).detail;
      console.log('[GlobalCallHandler] Background queue call event:', data);
      handleCallNotify(data);
    };

    const handleBackgroundCallStart = (e: Event) => {
      const data = (e as CustomEvent).detail;
      console.log('[GlobalCallHandler] Background queue call start event:', data);
      handleCallStart(data);
    };

    // Remove existing listeners first
    socket.off('call:notify');
    socket.off('call:start');

    // Add socket listeners
    socket.on('call:notify', handleCallNotify);
    socket.on('call:start', handleCallStart);

    // Add window event listeners for background queue
    window.addEventListener('backgroundqueue:call', handleBackgroundCall);
    window.addEventListener('backgroundqueue:callstart', handleBackgroundCallStart);

    console.log('[GlobalCallHandler] ✅ Persistent listeners active (works on ALL pages)');

    return () => {
      // Keep listeners active - don't remove
      // They need to persist across page navigation for background queue
      console.log('[GlobalCallHandler] Component unmounting but keeping listeners active');
    };
  }, []); // Empty deps - set up once, never tear down

  return (
    <>
      {/* Global Incoming Call Notification - Shows on ALL pages */}
      {incomingInvite && (
        <CalleeNotification
          invite={incomingInvite}
          onAccept={(inviteId, requestedSeconds) => {
            console.log('[GlobalCallHandler] ✅ Call ACCEPTED');

            // Emit accept immediately
            const socket = getSocket();
            if (socket) {
              socket.emit('call:accept', {
                inviteId,
                requestedSeconds,
              });
            }

            // Clear notification
            setIncomingInvite(null);

            // Server will emit call:start to navigate
            console.log('[GlobalCallHandler] Waiting for call:start...');
          }}
          onDecline={(inviteId) => {
            console.log('[GlobalCallHandler] ❌ Call DECLINED');

            // Emit decline
            const socket = getSocket();
            if (socket) {
              socket.emit('call:decline', { inviteId });
            }

            // Clear notification
            setIncomingInvite(null);
          }}
        />
      )}
    </>
  );
}

