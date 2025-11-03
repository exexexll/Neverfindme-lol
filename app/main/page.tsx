'use client';

import { useEffect, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/lib/session';
import { MatchmakeOverlay } from '@/components/matchmake/MatchmakeOverlay';
import { ReferralNotifications } from '@/components/ReferralNotifications';
// Animation removed for cleaner main page
import { FloatingUserNames } from '@/components/FloatingUserNames';
import DirectMatchInput from '@/components/DirectMatchInput';
import { API_BASE } from '@/lib/config';
import { prefetchTurnCredentials } from '@/lib/webrtc-config';
import { backgroundQueue } from '@/lib/backgroundQueue';
import { getSocket } from '@/lib/socket';
import Link from 'next/link';

function MainPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [showMatchmake, setShowMatchmake] = useState(false);
  const [directMatchTarget, setDirectMatchTarget] = useState<string | null>(null);

  useEffect(() => {
    // Hide footer on main page
    const footer = document.querySelector('footer');
    if (footer) {
      (footer as HTMLElement).style.display = 'none';
    }
    
    return () => {
      const footer = document.querySelector('footer');
      if (footer) {
        (footer as HTMLElement).style.display = '';
      }
    };
  }, []);

  // Initialize background queue manager
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      backgroundQueue.init(socket);
      console.log('[Main] Background queue manager initialized');
    }
    
    return () => {
      backgroundQueue.cleanup();
    };
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }
    
    const paymentPromise = fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    }).then(res => res.json());
    
    const eventPromise = fetch(`${API_BASE}/event/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    }).then(res => res.json());
    
    Promise.all([paymentPromise, eventPromise])
      .then(([paymentData, eventData]) => {
        // CRITICAL: Check if email verification is pending (MUST be first check)
        if (paymentData.pendingEmail && !paymentData.emailVerified) {
          console.log('[Main] Email verification pending - redirecting to complete verification');
          router.push('/onboarding');
          return;
        }
        
        // CRITICAL: Check if guest account expired
        if (paymentData.accountType === 'guest' && paymentData.accountExpiresAt) {
          const expiryDate = new Date(paymentData.accountExpiresAt);
          if (expiryDate < new Date()) {
            console.log('[Main] Guest account expired - redirecting to landing page');
            alert('Your guest account has expired after 7 days. Please register again.');
            // Clear session
            localStorage.removeItem('bumpin_session');
            sessionStorage.clear();
            router.push('/');
            return;
          }
        }
        
        const hasPaid = paymentData.paidStatus === 'paid' || 
                        paymentData.paidStatus === 'qr_verified' || 
                        paymentData.paidStatus === 'qr_grace_period';
        
        if (!hasPaid) {
          router.push('/waitlist');
          return;
        }
        
        if (eventData.eventModeEnabled && !eventData.canAccess) {
          router.push('/event-wait');
          return;
        }
        
        prefetchTurnCredentials(session.sessionToken).catch(() => {});
        setLoading(false);
        
        const openMatchmaking = searchParams.get('openMatchmaking');
        const targetUser = searchParams.get('targetUser');
        const refCode = searchParams.get('ref');
        
        if (refCode) {
          fetch(`${API_BASE}/referral/info/${refCode}`)
            .then(res => res.json())
            .then(data => {
              fetch(`${API_BASE}/referral/direct-match`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.sessionToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ referralCode: refCode }),
              })
                .then(res => res.json())
                .then(matchData => {
                  if (matchData.targetUser) {
                    setDirectMatchTarget(matchData.targetUser.userId);
                    setShowMatchmake(true);
                  }
                })
                .catch(err => console.error(err));
            })
            .catch(err => console.error(err));
        } else if (openMatchmaking === 'true' && targetUser) {
          setDirectMatchTarget(targetUser);
          setShowMatchmake(true);
        }
      })
      .catch(err => {
        console.error(err);
        router.push('/onboarding');
      });
  }, [router, searchParams]);

  const handleDirectMatch = (targetUserId: string) => {
    setDirectMatchTarget(targetUserId);
    setShowMatchmake(true);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-black">Loading...</div>
      </main>
    );
  }

  return (
    <main id="main" className="fixed inset-0 overflow-hidden" style={{ backgroundColor: 'white' }}>
      {/* Grid background */}
      <div className="absolute inset-0" style={{
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 40px, #ffc46a 40px, #ffc46a 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #ffc46a 40px, #ffc46a 41px)`,
        zIndex: 0,
      }} />

      {/* Floating User Names (behind buttons) */}
      <FloatingUserNames />

      {/* Button Layout */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${showMatchmake ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ zIndex: 10 }}>
        {/* Desktop Layout */}
        <div className="hidden md:block h-full">
          {/* Top Left - Intro Code */}
          <div className="absolute top-8 left-8">
            <DirectMatchInput onMatch={handleDirectMatch} />
          </div>

          {/* Top Right - Profile */}
          <Link
            href="/refilm"
            className="absolute top-8 right-8 px-8 py-4 rounded-2xl font-bold text-black border-2 border-black hover:scale-105 transition-all"
            style={{ backgroundColor: '#ffc46a', boxShadow: '5px 5px 0px #000000' }}
          >
            Profile
          </Link>

          {/* Center - Matchmake Button */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6">
            <button
              onClick={() => setShowMatchmake(true)}
              className="px-20 py-10 rounded-3xl font-playfair text-6xl font-bold text-black border-4 border-black hover:scale-105 active:scale-95 transition-all"
              style={{
                backgroundColor: '#ffc46a',
                boxShadow: '10px 10px 0px #000000',
              }}
            >
              Matchmake Now
            </button>
            
            {/* Socials - Below center */}
            <Link
              href="/socials"
              className="px-6 py-2 rounded-lg text-sm font-bold text-black border-2 border-black hover:scale-105 transition-all"
              style={{ backgroundColor: '#ffc46a', boxShadow: '4px 4px 0px #000000' }}
            >
              Socials
            </Link>
          </div>

          {/* Bottom Left - Past Chats */}
          <Link
            href="/history"
            className="absolute bottom-8 left-8 px-8 py-4 rounded-2xl font-bold text-black border-2 border-black hover:scale-105 transition-all"
            style={{ backgroundColor: '#ffc46a', boxShadow: '5px 5px 0px #000000' }}
          >
            Past Chats
          </Link>

          {/* Bottom Right - Settings */}
          <Link
            href="/settings"
            className="absolute bottom-8 right-8 px-8 py-4 rounded-2xl font-bold text-black border-2 border-black hover:scale-105 transition-all"
            style={{ backgroundColor: '#ffc46a', boxShadow: '5px 5px 0px #000000' }}
          >
            Settings
          </Link>
        </div>

        {/* Mobile Layout - Fixed viewport, no scrolling */}
        <div className="md:hidden h-full flex flex-col justify-between p-6">
          {/* Top Row */}
          <div className="flex justify-between items-start gap-4">
            <DirectMatchInput onMatch={handleDirectMatch} />
            <Link
              href="/refilm"
              className="px-6 py-3 rounded-lg font-bold text-black border-2 border-black"
              style={{ backgroundColor: '#ffc46a', boxShadow: '3px 3px 0px #000000' }}
            >
              Profile
            </Link>
          </div>
          
          {/* Center - Matchmake button */}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => setShowMatchmake(true)}
              className="px-12 py-8 rounded-2xl font-playfair text-4xl font-bold text-black border-4 border-black"
              style={{ backgroundColor: '#ffc46a', boxShadow: '8px 8px 0px #000000' }}
            >
              Matchmake Now
            </button>
            
            <Link
              href="/socials"
              className="px-6 py-2 rounded-lg text-sm font-bold text-black border-2 border-black"
              style={{ backgroundColor: '#ffc46a', boxShadow: '3px 3px 0px #000000' }}
            >
              Socials
            </Link>
          </div>
          
          {/* Bottom Row */}
          <div className="flex justify-between gap-4">
            <Link
              href="/history"
              className="flex-1 px-6 py-3 rounded-lg font-bold text-black border-2 border-black text-center"
              style={{ backgroundColor: '#ffc46a', boxShadow: '4px 4px 0px #000000' }}
            >
              Past Chats
            </Link>
            <Link
              href="/settings"
              className="flex-1 px-6 py-3 rounded-lg font-bold text-black border-2 border-black text-center"
              style={{ backgroundColor: '#ffc46a', boxShadow: '4px 4px 0px #000000' }}
            >
              Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Matchmaking Overlay */}
      {showMatchmake && (
        <MatchmakeOverlay
          isOpen={showMatchmake}
          onClose={() => {
            setShowMatchmake(false);
            setDirectMatchTarget(null);
          }}
          directMatchTarget={directMatchTarget}
        />
      )}

      {/* Referral Notifications */}
      <ReferralNotifications />
    </main>
  );
}

export default function MainPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-black">Loading...</div>
      </div>
    }>
      <MainPageContent />
    </Suspense>
  );
}

