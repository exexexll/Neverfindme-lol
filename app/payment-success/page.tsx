'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/Container';
import { getSession } from '@/lib/session';
import Image from 'next/image';

function PaymentSuccessPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [myInviteCode, setMyInviteCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const hasCheckedRef = useRef(false); // Prevent multiple checks

  useEffect(() => {
    // CRITICAL FIX: Prevent infinite loop by checking only once
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      router.push('/onboarding');
      return;
    }

    // Recursive retry function (fixes infinite loop)
    const checkPaymentStatus = (attempt: number = 0) => {
      if (attempt >= 5) {
        console.warn('[Payment] Max retries reached - webhook may not be working');
        setLoading(false);
        return;
      }

      fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/payment/status`, {
        headers: { 'Authorization': `Bearer ${session.sessionToken}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.paidStatus === 'paid' || data.paidStatus === 'qr_verified' || data.paidStatus === 'qr_grace_period') {
            setMyInviteCode(data.myInviteCode || '');
            const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://bumpin-production.up.railway.app';
            setQrCodeUrl(`${apiBase}/payment/qr/${data.myInviteCode}`);
            console.log('[Payment] ✅ Payment verified, code:', data.myInviteCode);
            setLoading(false);
          } else {
            // Not processed yet, retry after delay
            console.log(`[Payment] Retry ${attempt + 1}/5 - payment not processed yet`);
            setRetryCount(attempt + 1);
            setTimeout(() => checkPaymentStatus(attempt + 1), 2000);
          }
        })
        .catch(err => {
          console.error('[Payment] Status check failed:', err);
          setLoading(false);
        });
    };

    // Start checking after 2 second delay
    setTimeout(() => checkPaymentStatus(0), 2000);
  }, [router, searchParams]); // FIXED: Removed retryCount from dependencies!

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-[#fcf290] border-t-transparent" />
          <p className="text-[#eaeaf0]">Processing your payment...</p>
          {retryCount > 2 && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-[#eaeaf0]/60">This is taking longer than expected...</p>
              <button
                onClick={() => {
                  setLoading(false);
                  // Redirect to onboarding, NOT main (unpaid users shouldn't bypass)
                  router.push('/onboarding');
                }}
                className="rounded-xl bg-[#fcf290]/20 px-6 py-2 text-sm text-[#fcf290] hover:bg-[#fcf290]/30"
              >
                Continue to Onboarding
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main id="payment-success" className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <div className="mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 text-center"
          >
            <div>
              <div className="mb-4 text-5xl">✓</div>
              <h1 className="font-playfair text-3xl font-bold text-green-400 mb-2">
                Payment Successful
              </h1>
              <p className="text-sm text-[#eaeaf0]/60">
                Welcome to BUMPIn
              </p>
            </div>

            {/* Invite Code Display - Minimal */}
            {myInviteCode && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-5">
                <h3 className="text-sm font-medium text-purple-300 mb-3">
                  Your Friend Invites (4 total)
                </h3>
                
                <div className="rounded-lg bg-black/30 px-4 py-3 mb-3">
                  <p className="font-mono text-xl font-bold text-purple-300 tracking-wider">
                    {myInviteCode}
                  </p>
                </div>

                {/* QR Code - Smaller */}
                {qrCodeUrl && (
                  <div className="flex justify-center mb-3">
                    <div className="rounded-lg bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={qrCodeUrl} 
                        alt="QR Code" 
                        className="w-32 h-32"
                        onError={(e) => {
                          console.error('[Payment] QR Code failed to load:', qrCodeUrl);
                          e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><text x="10" y="64" fill="red" font-size="12">QR Load Error</text></svg>';
                        }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={() => navigator.clipboard.writeText(myInviteCode)}
                  className="focus-ring w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                >
                  Copy Code
                </button>

                <p className="mt-2 text-xs text-center text-[#eaeaf0]/40">
                  Find in Settings anytime
                </p>
              </div>
            )}

            {/* Continue Button - Minimal */}
            <button
              onClick={() => {
                // CRITICAL: Check if user came from onboarding (needs to complete profile)
                const returnToOnboarding = sessionStorage.getItem('return_to_onboarding');
                
                if (returnToOnboarding) {
                  console.log('[Payment Success] Returning to onboarding to complete profile');
                  sessionStorage.removeItem('return_to_onboarding');
                  router.push('/onboarding');
                } else {
                  console.log('[Payment Success] Profile already complete - going to main');
                  router.push('/main');
                }
              }}
              className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
            >
              Continue to Profile Setup →
            </button>
          </motion.div>
        </div>
      </Container>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading...</p>
        </div>
      </div>
    }>
      <PaymentSuccessPageContent />
    </Suspense>
  );
}

