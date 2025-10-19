'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './Button';
import { ScrollHint } from './ScrollHint';
import { API_BASE } from '@/lib/config';
import { getSession } from '@/lib/session';

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { scrollY } = useScroll();
  const [onlineUsers, setOnlineUsers] = useState<number | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  
  // Check if user is already verified (redirect to main if so)
  useEffect(() => {
    const session = getSession();
    
    if (!session) {
      setCheckingSession(false);
      return;
    }
    
    // User has session, check if verified
    fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    })
      .then(res => res.json())
      .then(data => {
        const verified = data.paidStatus === 'paid' || data.paidStatus === 'qr_verified';
        setIsVerified(verified);
        setCheckingSession(false);
      })
      .catch(err => {
        console.error('[Hero] Payment check failed:', err);
        setCheckingSession(false);
      });
  }, []);
  
  // Fetch live active user count
  useEffect(() => {
    const fetchOnlineCount = async () => {
      try {
        const res = await fetch(`${API_BASE}/stats/live`);
        const data = await res.json();
        setOnlineUsers(data.onlineUsers);
      } catch (err) {
        console.error('Failed to fetch online users:', err);
      }
    };

    // Fetch immediately
    fetchOnlineCount();

    // Update every 10 seconds
    const interval = setInterval(fetchOnlineCount, 10000);

    return () => clearInterval(interval);
  }, []);
  
  // Handle Connect button click
  const handleConnect = () => {
    if (isVerified) {
      router.push('/main');
    } else {
      router.push('/onboarding');
    }
  };
  
  // Parallax effect (disabled with reduced motion)
  const y = useTransform(scrollY, [0, 500], [0, 150]);

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.1, 0.25, 1],
      },
    },
  };

  return (
    <section
      ref={ref}
      className="relative flex min-h-[620px] h-[100dvh] w-full items-center justify-center overflow-hidden"
    >
      {/* Background Image with Parallax */}
      <motion.div
        style={{ y }}
        className="absolute inset-0 -z-10 motion-reduce:transform-none"
      >
        <Image
          src="/image.jpg"
          alt="Cinematic dusk sky over a sketched city, plane and stars"
          fill
          priority
          sizes="100vw"
          className="object-cover"
          quality={90}
        />
      </motion.div>

      {/* Gradient Overlays for Readability */}
      <div className="absolute inset-0 -z-[5] bg-gradient-to-b from-black/20 via-black/40 to-black/60" />
      <div className="absolute inset-0 -z-[5] bg-[radial-gradient(circle_at_center,transparent_0%,black/30_100%)]" />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="motion-reduce:opacity-100 motion-reduce:translate-y-0"
        >
          {/* H1 */}
          <h1 className="mb-4 font-playfair text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Napalm Sky
          </h1>

          {/* Subtitle */}
          <p className="mb-8 font-inter text-base font-medium text-white/95 sm:text-lg lg:text-xl">
            Make Friends in SoCal— Live Matches, Zero Waiting, Infinite Possibilites.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {checkingSession ? (
              <button
                disabled
                className="rounded-xl bg-[#ff9b6b]/50 px-8 py-3 font-medium text-[#0a0a0c] cursor-wait"
              >
                Loading...
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="rounded-xl bg-[#ff9b6b] px-8 py-3 font-medium text-[#0a0a0c] shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 focus-ring"
              >
                {isVerified ? 'Continue to App' : 'Start connecting'}
              </button>
            )}
            <Button variant="ghost" href="/manifesto">
              Meet Who and Do What?
            </Button>
          </div>

          {/* Login link for existing users (hidden if already logged in) */}
          {!isVerified && (
            <p className="mt-6 text-sm text-white/70">
              Already have an account?{' '}
              <Link 
                href="/login"
                className="font-medium text-[#ff9b6b] hover:underline focus-ring rounded"
              >
                Login
              </Link>
            </p>
          )}

          {/* Live Active User Count */}
          {onlineUsers !== null && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-4 py-2 border border-white/20"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-white">
                {onlineUsers} {onlineUsers === 1 ? 'user' : 'users'} online now
              </span>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Scroll Hint */}
      <ScrollHint />
    </section>
  );
}

