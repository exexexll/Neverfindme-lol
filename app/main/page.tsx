'use client';

import { useEffect, useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/Container';
import { getSession } from '@/lib/session';
import { MatchmakeOverlay } from '@/components/matchmake/MatchmakeOverlay';
import { ReferralNotifications } from '@/components/ReferralNotifications';
import DirectMatchInput from '@/components/DirectMatchInput';
import { API_BASE } from '@/lib/config';
import { prefetchTurnCredentials } from '@/lib/webrtc-config';
import Link from 'next/link';
import Image from 'next/image';

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
    
    // CRITICAL SECURITY FIX: Verify user has paid before allowing access
    // Backend routes are protected with requirePayment middleware, but frontend needs check too
    const paymentPromise = fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    }).then(res => res.json());
    
    // CRITICAL FIX: Check event mode status (prevents back button bypass)
    const eventPromise = fetch(`${API_BASE}/event/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    }).then(res => res.json());
    
    Promise.all([paymentPromise, eventPromise])
      .then(([paymentData, eventData]) => {
        const hasPaid = paymentData.paidStatus === 'paid' || 
                        paymentData.paidStatus === 'qr_verified' || 
                        paymentData.paidStatus === 'qr_grace_period';
        
        if (!hasPaid) {
          console.warn('[Main] Unpaid user attempted access - redirecting to paywall');
          router.push('/paywall');
          return;
        }
        
        // CRITICAL: Check if event mode is active and user doesn't have access
        if (eventData.eventModeEnabled && !eventData.canAccess) {
          console.log('[Main] Event mode active, user blocked - redirecting to event-wait');
          console.log('[Main] User is VIP:', eventData.isVIP);
          console.log('[Main] Event is active:', eventData.isEventActive);
          router.push('/event-wait');
          return;
        }
        
        // User has paid AND (event mode off OR has access), continue with page load
        console.log('[Main] Access granted - event mode:', eventData.eventModeEnabled, 'can access:', eventData.canAccess);
        
        // EFFICIENCY: Prefetch TURN credentials (reduces call connection time by 0.5-1s)
        prefetchTurnCredentials(session.sessionToken).catch(() => {
          // Non-critical, will fetch on-demand if prefetch fails
        });
        
        setLoading(false);
        
        // Check if coming from direct match (intro or notification)
        const openMatchmaking = searchParams.get('openMatchmaking');
        const targetUser = searchParams.get('targetUser');
        const refCode = searchParams.get('ref');
        
        // Handle referral code (registered user clicking referral link)
        if (refCode) {
          console.log('[Main] Referral code detected for registered user:', refCode);
          // Fetch target user from referral code
          fetch(`${API_BASE}/referral/info/${refCode}`)
            .then(res => res.json())
            .then(data => {
              console.log('[Main] Referral target:', data.targetUserName);
              // Get target userId from referral system
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
                .catch(err => console.error('[Main] Failed to fetch target:', err));
            })
            .catch(err => console.error('[Main] Failed to fetch referral info:', err));
        } else if (openMatchmaking === 'true' && targetUser) {
          console.log('[Main] Opening matchmaking for direct match with:', targetUser);
          setDirectMatchTarget(targetUser);
          setShowMatchmake(true);
        }
      })
      .catch(err => {
        console.error('[Main] Payment/event status check failed:', err);
        // On error, redirect to onboarding to be safe
        router.push('/onboarding');
      });
  }, [router, searchParams]);

  const handleDirectMatch = (targetUserId: string, targetName: string) => {
    console.log('[Main] Direct match requested for:', targetName);
    setDirectMatchTarget(targetUserId);
    setShowMatchmake(true);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-[#eaeaf0]">Loading...</div>
      </main>
    );
  }

  // Sky blue gradient style for text (500 Days of Summer aesthetic)
  const skyBlueButtonClass = "bg-gradient-to-br from-[#4FC3F7] via-[#29B6F6] to-[#03A9F4] animate-gradient";
  
  // Silver-grey title bar (Windows 95/2000 style)
  const silverTitleBarClass = "bg-gradient-to-b from-gray-300 to-gray-400";

  return (
    <main id="main" className="relative min-h-screen py-20">
      {/* Background Image */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/mainpage.png"
          alt=""
          fill
          priority
          className="object-cover"
          quality={90}
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Smooth vignette effect - gradient fade on edges */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/50" />
      </div>

      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-4xl space-y-12 motion-reduce:opacity-100 motion-reduce:translate-y-0"
        >
          {/* Header - Hidden when matchmaking */}
          <div className={`text-center transition-opacity duration-300 ${showMatchmake ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <h1 className="font-playfair text-6xl font-bold text-white sm:text-7xl lg:text-8xl drop-shadow-lg">
              BUMPIn
            </h1>
          </div>

          {/* Irregular Photo Collage Grid - Hidden when matchmaking */}
          <div className={`relative mx-auto flex max-w-3xl flex-col items-center transition-opacity duration-300 ${showMatchmake ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {/* Row 1: Large tile (Matchmake Now) with gridimage1.png */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0 }}
              className="mb-4 w-full max-w-md"
            >
              <button
                onClick={() => setShowMatchmake(true)}
                className="focus-ring group relative w-full overflow-hidden rounded-md border-4 border-gray-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
              >
                {/* Retro Window Title Bar */}
                <div className={`${silverTitleBarClass} px-4 py-2 flex items-center justify-between border-b-2 border-gray-500`}>
                  <span className="text-xs font-bold text-gray-800">Matchmake.exe</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-gray-500 rounded-sm" />
                    <div className="w-3 h-3 bg-gray-500 rounded-sm" />
                    <div className="w-3 h-3 bg-gray-500 rounded-sm" />
                  </div>
                </div>
                {/* Window Content */}
                <div className="bg-white p-1 flex items-center justify-center">
                  <h2 className="font-playfair text-7xl font-bold tracking-tight text-gray-600 leading-none">
                    Matchmake Now
                  </h2>
                </div>
              </button>
            </motion.div>

            {/* Row 2: Two tiles (Past Chats, Settings) - offset left */}
            <div className="mb-4 flex w-full gap-4 pl-0 sm:pl-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex-1"
              >
                <Link
                  href="/history"
                  className="focus-ring group block h-full overflow-hidden rounded-md border-4 border-gray-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
                >
                  {/* Retro Window Title Bar */}
                  <div className={`${silverTitleBarClass} px-3 py-1.5 flex items-center justify-between border-b-2 border-gray-500`}>
                    <span className="text-xs font-bold text-gray-800">History.exe</span>
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                    </div>
                  </div>
                  {/* Window Content */}
                  <div className="bg-white p-1 h-full flex items-center justify-center">
                    <h3 className="font-playfair text-5xl font-bold tracking-tight text-gray-600 leading-none">
                      Past Chats
                    </h3>
                  </div>
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="flex-1"
              >
                <Link
                  href="/settings"
                  className="focus-ring group block h-full overflow-hidden rounded-md border-4 border-gray-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
                >
                  {/* Retro Window Title Bar */}
                  <div className={`${silverTitleBarClass} px-3 py-1.5 flex items-center justify-between border-b-2 border-gray-500`}>
                    <span className="text-xs font-bold text-gray-800">Settings.exe</span>
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                    </div>
                  </div>
                  {/* Window Content */}
                  <div className="bg-white p-1 h-full flex items-center justify-center">
                    <h3 className="font-playfair text-5xl font-bold tracking-tight text-gray-600 leading-none">
                      Settings
                    </h3>
                  </div>
                </Link>
              </motion.div>
            </div>

            {/* Row 3: Two tiles (Socials, Intro Code Input) - offset right */}
            <div className="mb-4 flex w-full gap-4 pr-0 sm:pr-12">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex-1"
              >
                <Link
                  href="/socials"
                  className="focus-ring group block h-full overflow-hidden rounded-md border-4 border-gray-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
                >
                  {/* Retro Window Title Bar */}
                  <div className={`${silverTitleBarClass} px-3 py-1.5 flex items-center justify-between border-b-2 border-gray-500`}>
                    <span className="text-xs font-bold text-gray-800">Socials.exe</span>
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-sm" />
                    </div>
                  </div>
                  {/* Window Content */}
                  <div className="bg-white p-1 h-full flex items-center justify-center">
                    <h3 className="font-playfair text-4xl font-bold tracking-tight text-gray-600 leading-none">
                      Socials
                    </h3>
                  </div>
                </Link>
              </motion.div>

              {/* Direct Match Input - Integrated into Grid */}
              {!showMatchmake && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                  className="flex-1"
                >
                  <DirectMatchInput onMatch={handleDirectMatch} />
                </motion.div>
              )}
            </div>

            {/* Row 4: Large tile (Refilm) with girdimage6.png - centered */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.35 }}
              className="w-full max-w-lg"
            >
              <Link
                href="/refilm"
                className="focus-ring group block overflow-hidden rounded-md border-4 border-gray-400 shadow-2xl transition-all hover:scale-105 active:scale-95"
              >
                {/* Retro Window Title Bar */}
                <div className={`${silverTitleBarClass} px-4 py-2 flex items-center justify-between border-b-2 border-gray-500`}>
                  <span className="text-xs font-bold text-gray-800">Refilm.exe</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-gray-500 rounded-sm" />
                    <div className="w-3 h-3 bg-gray-500 rounded-sm" />
                    <div className="w-3 h-3 bg-gray-500 rounded-sm" />
                  </div>
                </div>
                {/* Window Content */}
                <div className="bg-white p-1 flex items-center justify-center">
                  <h2 className="font-playfair text-7xl font-bold tracking-tight text-gray-600 leading-none">
                    Profile
                  </h2>
                </div>
              </Link>
            </motion.div>

            {/* Bottom accent tiles - displaced */}
            <div className="mt-4 flex w-full justify-end gap-3 pr-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="h-16 w-24 rounded-lg bg-blue-500/10 shadow-inner"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                className="h-16 w-16 rounded-lg bg-purple-500/10 shadow-inner"
              />
            </div>
          </div>

          {/* Matchmaking Overlay - Only mount when actually opening */}
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
        </motion.div>
      </Container>

      {/* Referral Notifications */}
      <ReferralNotifications />
    </main>
  );
}

export default function MainPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading...</p>
        </div>
      </div>
    }>
      <MainPageContent />
    </Suspense>
  );
}
