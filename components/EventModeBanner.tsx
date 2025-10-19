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

  useEffect(() => {
    const session = getSession();
    
    const checkEventStatus = async () => {
      try {
        const status = await getEventStatus(session?.sessionToken);
        setEventStatus(status);
        
        // Show banner if event mode is ON but event is NOT active and user has no VIP access
        setShow(status.eventModeEnabled && !status.eventActive && !status.canAccess);
      } catch (error) {
        console.error('[EventBanner] Failed to check status:', error);
      }
    };

    checkEventStatus();
    const interval = setInterval(checkEventStatus, 30000); // Check every 30 seconds

    // REAL-TIME: Listen for event settings changes via socket
    if (session) {
      const socket = connectSocket(session.sessionToken);
      
      socket.on('event:settings-changed', (data: any) => {
        console.log('[EventBanner] Event settings changed:', data);
        // Immediately refresh event status
        checkEventStatus();
      });

      return () => {
        clearInterval(interval);
        socket.off('event:settings-changed');
      };
    }

    return () => clearInterval(interval);
  }, []);

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
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#ff9b6b] to-[#ff7a45] text-white shadow-lg"
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <span className="text-lg">🎉</span>
              </div>
              <div>
                <p className="font-medium">
                  Event Mode Active
                </p>
                <p className="text-sm text-white/90">
                  Matchmaking available {eventStatus.eventStartTime.substring(0, 5)} - {eventStatus.eventEndTime.substring(0, 5)} {eventStatus.timezone?.replace('America/', '')}
                </p>
              </div>
            </div>
            
            <div className="hidden sm:flex items-center gap-2">
              <div className="rounded-lg bg-white/10 backdrop-blur-sm px-4 py-2 text-center">
                <p className="text-xs text-white/80">Next Event</p>
                <p className="font-bold text-lg">{timeUntilStart}</p>
              </div>
            </div>
          </div>
          
          {/* Mobile countdown */}
          <div className="mt-2 sm:hidden text-center">
            <div className="inline-block rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5">
              <p className="text-xs text-white/80">Next Event: <span className="font-bold">{timeUntilStart}</span></p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

