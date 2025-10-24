'use client';

import { useEffect, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/lib/session';
import { MatchmakeOverlay } from '@/components/matchmake/MatchmakeOverlay';
import { ReferralNotifications } from '@/components/ReferralNotifications';
import { MainPageIcons } from '@/components/MainPageIcons';
import DirectMatchInput from '@/components/DirectMatchInput';
import { API_BASE } from '@/lib/config';
import { prefetchTurnCredentials } from '@/lib/webrtc-config';
import Link from 'next/link';

function MainPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [showMatchmake, setShowMatchmake] = useState(false);
  const [directMatchTarget, setDirectMatchTarget] = useState<string | null>(null);

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
        const hasPaid = paymentData.paidStatus === 'paid' || 
                        paymentData.paidStatus === 'qr_verified' || 
                        paymentData.paidStatus === 'qr_grace_period';
        
        if (!hasPaid) {
          router.push('/paywall');
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
    <main id="main" className="relative min-h-screen overflow-hidden" style={{ backgroundColor: 'white' }}>
      {/* Grid background */}
      <div className="fixed inset-0" style={{
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 40px, #ffc46a 40px, #ffc46a 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #ffc46a 40px, #ffc46a 41px)`,
        zIndex: 0,
      }} />

      {/* Animated Icons */}
      <MainPageIcons />

      {/* Button Layout */}
      <div className={`relative transition-opacity duration-300 ${showMatchmake ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ zIndex: 10 }}>
        {/* Desktop Layout */}
        <div className="hidden md:flex min-h-screen items-center justify-center p-8">
          <div className="relative w-full max-w-7xl">
            {/* Top Left - Intro Code */}
            <div className="absolute top-0 left-0">
              <DirectMatchInput onMatch={handleDirectMatch} />
            </div>

            {/* Top Right - Profile */}
            <Link
              href="/refilm"
              className="absolute top-0 right-0 px-8 py-4 rounded-xl font-bold text-black shadow-lg hover:scale-105 transition-all"
              style={{ backgroundColor: '#ffc46a' }}
            >
              Profile
            </Link>

            {/* Center - Matchmake Button (3D effect) */}
            <div className="flex flex-col items-center gap-6">
              <button
                onClick={() => setShowMatchmake(true)}
                className="px-20 py-10 rounded-3xl font-playfair text-6xl font-bold text-black shadow-2xl hover:scale-105 transition-all"
                style={{
                  backgroundColor: '#ffc46a',
                  boxShadow: '0 25px 70px rgba(0, 0, 0, 0.4), inset 0 -5px 15px rgba(0, 0, 0, 0.3), inset 0 5px 15px rgba(255, 255, 255, 0.5)',
                  transform: 'perspective(1000px) rotateX(3deg)',
                }}
              >
                Matchmake Now
              </button>
              
              {/* Socials - Below center (smaller) */}
              <Link
                href="/socials"
                className="px-6 py-2 rounded-lg text-sm font-semibold text-black shadow hover:scale-105 transition-all"
                style={{ backgroundColor: '#ffc46a' }}
              >
                Socials
              </Link>
            </div>

            {/* Bottom Left - Past Chats */}
            <Link
              href="/history"
              className="absolute bottom-0 left-0 px-8 py-4 rounded-xl font-bold text-black shadow-lg hover:scale-105 transition-all"
              style={{ backgroundColor: '#ffc46a' }}
            >
              Past Chats
            </Link>

            {/* Bottom Right - Settings */}
            <Link
              href="/settings"
              className="absolute bottom-0 right-0 px-8 py-4 rounded-xl font-bold text-black shadow-lg hover:scale-105 transition-all"
              style={{ backgroundColor: '#ffc46a' }}
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden flex flex-col min-h-screen justify-center items-center p-6 gap-6">
          <div className="flex justify-between w-full max-w-md gap-4">
            <DirectMatchInput onMatch={handleDirectMatch} />
            <Link
              href="/refilm"
              className="px-4 py-2 rounded-lg font-semibold text-black shadow"
              style={{ backgroundColor: '#ffc46a' }}
            >
              Profile
            </Link>
          </div>
          
          <button
            onClick={() => setShowMatchmake(true)}
            className="w-full max-w-md px-10 py-8 rounded-2xl font-playfair text-4xl font-bold text-black shadow-xl"
            style={{ backgroundColor: '#ffc46a' }}
          >
            Matchmake Now
          </button>
          
          <Link
            href="/socials"
            className="px-6 py-2 rounded-lg text-sm font-semibold text-black shadow"
            style={{ backgroundColor: '#ffc46a' }}
          >
            Socials
          </Link>
          
          <div className="flex gap-4 w-full max-w-md">
            <Link
              href="/history"
              className="flex-1 px-4 py-3 rounded-lg font-semibold text-black shadow text-center"
              style={{ backgroundColor: '#ffc46a' }}
            >
              Past Chats
            </Link>
            <Link
              href="/settings"
              className="flex-1 px-4 py-3 rounded-lg font-semibold text-black shadow text-center"
              style={{ backgroundColor: '#ffc46a' }}
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

