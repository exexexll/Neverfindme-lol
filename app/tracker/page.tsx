'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/Container';
import { getSession } from '@/lib/session';
import Link from 'next/link';

export default function TrackerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    // CRITICAL SECURITY: Check payment status before loading data
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
    
    fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    })
      .then(res => res.json())
      .then(paymentData => {
        // CRITICAL: Check if email verification is pending
        if (paymentData.pendingEmail && !paymentData.emailVerified) {
          console.log('[Tracker] Email verification pending - redirecting to onboarding');
          router.push('/onboarding');
          return;
        }
        
        const hasPaid = paymentData.paidStatus === 'paid' || paymentData.paidStatus === 'qr_verified' || paymentData.paidStatus === 'qr_grace_period';
        
        if (!hasPaid) {
          console.warn('[Tracker] Unpaid user attempted access - redirecting to waitlist');
          router.push('/waitlist');
          return;
        }
        
        // User has paid, fetch timer total from server
        fetch(`${API_BASE}/user/me`, {
          headers: { 'Authorization': `Bearer ${session.sessionToken}` },
        })
          .then(res => res.json())
          .then(data => {
            console.log('[Tracker] Timer total from server:', data.timerTotalSeconds);
            setTotalSeconds(data.timerTotalSeconds || 0);
          })
          .catch(err => {
            console.error('[Tracker] Failed to load from server:', err);
            // Fallback to localStorage for backward compatibility
            const saved = localStorage.getItem('bumpin_timer_total');
            setTotalSeconds(saved ? parseInt(saved, 10) : 0);
          })
          .finally(() => setLoading(false));
      })
      .catch(err => {
        console.error('[Tracker] Payment check failed:', err);
        router.push('/onboarding');
      });
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-[#eaeaf0]">Loading...</div>
      </main>
    );
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <main id="main" className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-2xl space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
        >
          <div className="flex items-center justify-between">
            <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
              Timer Tracker
            </h1>
            <Link
              href="/main"
              className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              ← Back
            </Link>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-yellow-500/10 to-amber-500/10 p-12 text-center shadow-inner">
            <div className="mb-4 text-6xl">⏱️</div>
            <h2 className="mb-6 font-playfair text-2xl font-bold text-[#eaeaf0]">
              Total Time Spent
            </h2>
            
            <div className="mb-8 font-mono text-5xl font-bold text-[#eaeaf0] sm:text-6xl">
              {hours.toString().padStart(2, '0')}:
              {minutes.toString().padStart(2, '0')}:
              {seconds.toString().padStart(2, '0')}
            </div>

            <p className="text-lg text-[#eaeaf0]/70">
              Cumulative video call time
            </p>
            <p className="mt-2 text-sm text-[#eaeaf0]/50">
              Updates after each session ends
            </p>
          </div>

          <div className="rounded-xl bg-white/5 p-6">
            <h3 className="mb-4 font-bold text-[#eaeaf0]">How it works</h3>
            <ul className="space-y-2 text-sm text-[#eaeaf0]/70">
              <li>• Timer starts when you connect with someone</li>
              <li>• Tracks the duration of each video call</li>
              <li>• Adds to your cumulative total after each session</li>
              <li>• Read-only display (syncs automatically)</li>
            </ul>
          </div>
        </motion.div>
      </Container>
    </main>
  );
}

