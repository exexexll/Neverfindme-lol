'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { getReferralNotifications, markNotificationRead, getMyIntroductions } from '@/lib/api';
import { getSession } from '@/lib/session';
import { connectSocket } from '@/lib/socket';

interface Notification {
  id: string;
  forUserId: string;
  referredUserId: string;
  referredName: string;
  introducedBy: string;
  introducedByName: string;
  timestamp: number;
  read: boolean;
}

interface Introduction {
  userId: string;
  name: string;
  introducedBy: string;
  isOnline: boolean;
  isAvailable: boolean;
  selfieUrl?: string;
  videoUrl?: string;
  gender: string;
}

export function ReferralNotifications() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [callingUser, setCallingUser] = useState<string | null>(null);

  // Fetch notifications on mount
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    Promise.all([
      getReferralNotifications(session.sessionToken),
      getMyIntroductions(session.sessionToken)
    ])
      .then(([notifData, introData]) => {
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unreadCount || 0);
        setIntroductions(introData.introductions || []);
        
        // Show popup for the latest unread notification
        const unreadNotifications = (notifData.notifications || []).filter((n: Notification) => !n.read);
        if (unreadNotifications.length > 0) {
          const latest = unreadNotifications[unreadNotifications.length - 1];
          setLatestNotification(latest);
          setShowPopup(true);
          
          // Auto-hide after 8 seconds (more time for Call Now button)
          setTimeout(() => setShowPopup(false), 8000);
          
          // Auto-mark as read after showing (prevents repeated popups)
          setTimeout(() => {
            markNotificationRead(session.sessionToken, latest.id)
              .then(() => {
                console.log('[Referral] Auto-marked notification as read:', latest.id);
              })
              .catch(err => console.error('[Referral] Failed to auto-mark read:', err));
          }, 1000); // Mark read after 1 second
          
          console.log('[Referral] Showing popup for unread notification:', latest.referredName);
        }
      })
      .catch(err => console.error('[Referral] Failed to fetch notifications:', err));

    // Listen for real-time notifications
    const socket = connectSocket(session.sessionToken);
    
    socket.on('referral:notification', ({ message, notification: notif }: any) => {
      console.log('[Referral] Real-time notification:', message);
      
      // Show popup
      setLatestNotification(notif || {
        id: Date.now().toString(),
        forUserId: session.userId,
        referredUserId: '',
        referredName: message.split(' ')[0], // Extract name from message
        timestamp: Date.now(),
        read: false,
      });
      setShowPopup(true);

      // Auto-hide after 5 seconds
      setTimeout(() => setShowPopup(false), 5000);

      // Refresh full notification list
      getReferralNotifications(session.sessionToken)
        .then(data => {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        })
        .catch(err => console.error('[Referral] Failed to refresh notifications:', err));
    });

    return () => {
      socket.off('referral:notification');
    };
  }, []);

  const handleMarkRead = async (notificationId: string) => {
    const session = getSession();
    if (!session) return;

    try {
      await markNotificationRead(session.sessionToken, notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[Referral] Failed to mark as read:', err);
    }
  };

  const handleCallNow = async (referredUserId: string) => {
    // Find the introduction details
    const intro = introductions.find(i => i.userId === referredUserId);
    
    if (!intro) {
      console.error('[Referral] Introduction not found for user:', referredUserId);
      return;
    }

    if (!intro.isOnline || !intro.isAvailable) {
      // Show offline message
      alert(`${intro.name} is not online right now. Try again later!`);
      return;
    }

    setCallingUser(referredUserId);
    
    // Mark notification as read before navigating
    if (latestNotification) {
      await handleMarkRead(latestNotification.id);
    }
    
    // Close popup and navigate to matchmaking with this user
    setShowPopup(false);
    
    // Store the target user ID and auto-invite flag
    localStorage.setItem('bumpin_direct_match_target', referredUserId);
    localStorage.setItem('bumpin_auto_invite', 'true');
    
    // Small delay to ensure state is set
    setTimeout(() => {
      // Navigate to main and open matchmaking
      router.push('/main?openMatchmaking=true&targetUser=' + referredUserId);
    }, 100);
  };

  return (
    <>
      {/* Real-time Popup Notification */}
      <AnimatePresence>
        {showPopup && latestNotification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20 }}
            className="fixed top-24 right-6 z-[100] max-w-sm"
          >
            <div className="rounded-2xl border-2 border-green-500/50 bg-[#0a0a0c]/95 p-6 shadow-2xl backdrop-blur-md">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                      <span className="text-2xl">🎉</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-1 font-playfair text-lg font-bold text-green-300">
                      Someone Wants to Meet You!
                    </h4>
                    <p className="text-sm text-[#eaeaf0]/80">
                      {latestNotification.referredName} was introduced to you by {latestNotification.introducedByName}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPopup(false)}
                    className="text-white/50 hover:text-white transition-colors"
                    aria-label="Close notification"
                  >
                    ✕
                  </button>
                </div>
                
                {/* Call Now Button */}
                <button
                  onClick={() => handleCallNow(latestNotification.referredUserId)}
                  disabled={callingUser === latestNotification.referredUserId}
                  className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {callingUser === latestNotification.referredUserId ? 'Opening...' : '📞 Call Now'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Badge (optional - could add to header) */}
      {unreadCount > 0 && (
        <div className="fixed top-20 right-6 z-50">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white shadow-lg"
          >
            {unreadCount}
          </motion.div>
        </div>
      )}
    </>
  );
}

