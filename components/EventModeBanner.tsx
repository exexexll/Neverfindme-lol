'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getEventStatus } from '@/lib/api';
import { getSession } from '@/lib/session';
import { connectSocket } from '@/lib/socket';

/**
 * Event Mode Banner
 * Displays when event mode is ON but event hasn't started yet
 * Shows countdown and event window info
 */
export function EventModeBanner() {
  const [eventStatus, setEventStatus] = useState<any>(null);
  const [timeUntilStart, setTimeUntilStart] = useState<string>('');
  const [show, setShow] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setShow(false);
      return;
    }
    
    let mounted = true;
    
    const checkEventStatus = async () => {
      if (!mounted) return;
      
      try {
        const status = await getEventStatus(session.sessionToken);
        if (mounted) {
          setEventStatus(status);
          setShow(status.eventModeEnabled && !status.eventActive && !status.canAccess);
        }
      } catch (error) {
        if (mounted) {
          console.error('[EventBanner] Failed to check status:', error);
          setShow(false);
        }
      }
    };

    checkEventStatus();
    const interval = setInterval(checkEventStatus, 60000); // Check every 60 seconds (reduced from 30)

    // Socket listener for real-time updates
    const socket = connectSocket(session.sessionToken);
    const handleSettingsChanged = (data: any) => {
      console.log('[EventBanner] Event settings changed:', data);
      checkEventStatus();
    };
    
    socket.on('event:settings-changed', handleSettingsChanged);

    return () => {
      mounted = false;
      clearInterval(interval);
      socket.off('event:settings-changed', handleSettingsChanged);
    };
  }, []); // Run once on mount

  // Calculate time until event starts
  useEffect(() => {
    if (!eventStatus || !show) return;

    const calculateTimeUntil = () => {
      const now = new Date();
      
      // Parse event start time (HH:MM:SS)
      const [hours, minutes] = eventStatus.eventStartTime.split(':').map(Number);
      
      // Create date object for today's event start time in the event timezone
      const eventStart = new Date();
      eventStart.setHours(hours, minutes, 0, 0);
      
      // If event start time has passed today, show time until tomorrow's event
      if (now >= eventStart) {
        eventStart.setDate(eventStart.getDate() + 1);
      }
      
      const diff = eventStart.getTime() - now.getTime();
      
      if (diff <= 0) {
        return 'Event starting soon...';
      }
      
      const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
      const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hoursLeft > 0) {
        return `${hoursLeft}h ${minutesLeft}m until event`;
      } else {
        return `${minutesLeft}m until event`;
      }
    };

    setTimeUntilStart(calculateTimeUntil());
    const interval = setInterval(() => {
      setTimeUntilStart(calculateTimeUntil());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [eventStatus, show]);

  if (!show || !eventStatus) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          className={`fixed right-4 top-20 z-40 rounded-xl overflow-hidden shadow-2xl ${
            minimized ? 'w-12' : 'w-80'
          }`}
        >
          <div className="bg-gradient-to-br from-[#ff9b6b] to-[#ff7a45] text-white">
            {/* Minimized State - Just Icon */}
            {minimized ? (
              <button
                onClick={() => setMinimized(false)}
                className="w-12 h-12 flex items-center justify-center hover:bg-white/10 transition-colors"
                title="Expand event info"
              >
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              </button>
            ) : (
              <div className="p-4">
                {/* Header with minimize button */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="font-bold text-sm">Event Mode</span>
                  </div>
                  <button
                    onClick={() => setMinimized(true)}
                    className="text-white/80 hover:text-white text-xl leading-none"
                    title="Minimize"
                  >
                    ×
                  </button>
                </div>
                
                {/* Event Window */}
                <div className="mb-3">
                  <p className="text-xs text-white/70 mb-1">Event Window</p>
                  <p className="text-sm font-semibold">
                    {eventStatus.eventStartTime.substring(0, 5)} - {eventStatus.eventEndTime.substring(0, 5)}
                  </p>
                  <p className="text-xs text-white/80">
                    {eventStatus.timezone?.replace('America/', '')}
                  </p>
                </div>
                
                {/* Countdown */}
                {timeUntilStart && (
                  <div className="rounded-lg bg-white/10 backdrop-blur-sm px-3 py-2 text-center">
                    <p className="text-xs text-white/70">Starts in</p>
                    <p className="font-bold">{timeUntilStart}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

