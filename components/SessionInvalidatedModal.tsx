'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket } from '@/lib/socket';

export function SessionInvalidatedModal() {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Listen for BOTH socket events AND custom window events (from API 401 responses)
    
    // Method 1: Socket events (real-time, if connected)
    const sessionData = localStorage.getItem('bumpin_session');
    let socket: any = null;
    
    if (sessionData) {
      try {
        const { sessionToken } = JSON.parse(sessionData);
        if (sessionToken) {
          const { connectSocket } = require('@/lib/socket');
          socket = connectSocket(sessionToken);
          
          if (socket) {
            const handleSessionInvalidated = ({ message, reason }: { message: string; reason: string }) => {
              console.log('[SessionInvalidated] Socket event received:', reason);
              setMessage(message);
              setShow(true);
              localStorage.removeItem('bumpin_session');
              setTimeout(() => router.push('/login'), 5000);
            };
            
            socket.on('session:invalidated', handleSessionInvalidated);
          }
        }
      } catch (error) {
        console.error('[SessionInvalidated] Socket setup failed:', error);
      }
    }
    
    // Method 2: Window events (from API 401 responses, if socket not connected)
    const handleWindowEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      console.log('[SessionInvalidated] Window event received:', customEvent.detail);
      setMessage(customEvent.detail.message);
      setShow(true);
      localStorage.removeItem('bumpin_session');
      setTimeout(() => router.push('/login'), 5000);
    };
    
    window.addEventListener('session-invalidated', handleWindowEvent);

    return () => {
      if (socket) {
        socket.off('session:invalidated');
      }
      window.removeEventListener('session-invalidated', handleWindowEvent);
    };
  }, [router]);

  const handleOk = () => {
    setShow(false);
    localStorage.removeItem('bumpin_session');
    router.push('/login');
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-md w-full bg-[#0a0a0c] rounded-2xl border-2 border-[#fcf290]/30 p-8 text-center space-y-6"
          >
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h3 className="font-playfair text-2xl font-bold text-[#eaeaf0]">
                Logged Out
              </h3>
              <p className="text-[#eaeaf0]/80">
                {message || 'You have been logged out because you logged in from another device.'}
              </p>
            </div>

            {/* Info */}
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
              <p className="text-sm text-blue-200">
                For security, only one active session is allowed per account.
              </p>
            </div>

            {/* Button */}
            <button
              onClick={handleOk}
              className="w-full rounded-xl bg-[#fcf290] px-6 py-3 font-medium text-[#0a0a0c] 
                       shadow-lg transition-all hover:opacity-90"
            >
              OK, Go to Login
            </button>

            {/* Auto-redirect notice */}
            <p className="text-xs text-[#eaeaf0]/40">
              Auto-redirecting in 5 seconds...
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

