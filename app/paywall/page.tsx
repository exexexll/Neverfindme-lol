'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/Container';
import { getSession } from '@/lib/session';
import { API_BASE } from '@/lib/config';
import Image from 'next/image';

function PaywallPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [paymentComplete, setPaymentComplete] = useState(false);

  // Prevent back button during payment (un-bypassable)
  useEffect(() => {
    if (paymentComplete) return; // Allow leaving after payment
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const message = 'Payment required to continue. Are you sure you want to leave?';
      e.returnValue = message;
      return message;
    };
    
    // Prevent back button
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      alert('Please complete payment or scan a QR code to continue.');
    };
    
    // Add initial history entry
    window.history.pushState(null, '', window.location.href);
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [paymentComplete]);

  // Check if already paid - redirect verified users to main
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    // CRITICAL FIX: Always check payment status, don't rely on redirect flags
    // This handles verified users landing here from any source
    fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.paidStatus === 'paid' || data.paidStatus === 'qr_verified' || data.paidStatus === 'qr_grace_period') {
          // Already paid/verified/grace period - redirect to main immediately
          console.log('[Paywall] User already verified - redirecting to main');
          setPaymentComplete(true); // Mark complete to allow navigation
          router.replace('/main'); // Use replace to prevent back button issues
        } else {
          // Check if we were just redirected here to prevent loop
          const isRedirecting = sessionStorage.getItem('redirecting_to_paywall');
          if (isRedirecting) {
            sessionStorage.removeItem('redirecting_to_paywall');
            console.log('[Paywall] Arrived from redirect - staying on paywall');
          }
        }
      })
      .catch(err => {
        console.error('[Paywall] Failed to check payment status:', err);
        // On error, stay on paywall (safer than redirecting)
      });
  }, [router]);

  const handlePayment = async () => {
    const session = getSession();
    if (!session) return;

    setLoading(true);
    setError('');

    try {
      // CRITICAL: Mark that we're going to Stripe from paywall
      // So payment-success knows whether to return to onboarding
      const needsProfile = sessionStorage.getItem('return_to_onboarding');
      if (needsProfile) {
        console.log('[Paywall] User needs to complete profile after payment');
      }
      
      const res = await fetch(`${API_BASE}/payment/create-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create checkout');
      }

      const data = await res.json();
      
      // Redirect to Stripe checkout
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleValidateCode = async () => {
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    setValidating(true);
    setError('');

    try {
      // Validate code first
      const validateRes = await fetch(`${API_BASE}/payment/validate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim().toUpperCase() }),
      });

      if (!validateRes.ok) {
        const data = await validateRes.json();
        setAttemptsRemaining(data.attemptsRemaining || 0);
        
        if (validateRes.status === 429) {
          throw new Error(data.message || 'Too many attempts. Please wait before trying again.');
        }
        
        throw new Error(data.error || 'Invalid invite code');
      }

      // Code is valid! Mark user as verified on server
      const updateRes = await fetch(`${API_BASE}/payment/apply-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          inviteCode: inviteCode.trim().toUpperCase(),
        }),
      });

      if (!updateRes.ok) {
        const data = await updateRes.json();
        throw new Error(data.error || 'Failed to apply code');
      }

      // Success! Navigate to onboarding to complete profile
      console.log('[Paywall] Code applied successfully - redirecting to onboarding');
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  return (
    <main id="paywall" className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <div className="mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 text-center"
          >
            <div>
              <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] mb-2">
                Welcome to BUMPIn
              </h1>
              <p className="text-[#eaeaf0]/60">
                One-time $0.50 payment • Keeps bots out
              </p>
            </div>

            {/* Benefits - Minimal */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-left">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <p className="text-sm text-[#eaeaf0]">Full platform access</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <p className="text-sm text-[#eaeaf0]">4 friend invite codes</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <p className="text-sm text-[#eaeaf0]">One-time payment • No subscriptions</p>
                </div>
              </div>
            </div>

            {/* Payment Button */}
            <button
              onClick={handlePayment}
              disabled={loading}
              className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-4 font-semibold text-[#0a0a0c] transition-all hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Pay $0.50 & Continue'}
            </button>

            {error && (
              <div className="rounded-xl bg-red-500/10 px-4 py-3 border border-red-500/30">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* QR Code Only Message */}
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
              <p className="text-sm text-center text-purple-300">
                📱 <strong>Have a friend&apos;s QR code?</strong><br/>
                <span className="text-xs text-[#eaeaf0]/60">Scan it with your camera to get free access</span>
              </p>
            </div>

            {/* Minimal Footer */}
            <p className="text-xs text-center text-[#eaeaf0]/30">
              Payment prevents spam • Secure via Stripe
            </p>
          </motion.div>
        </div>
      </Container>
    </main>
  );
}

export default function PaywallPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading...</p>
        </div>
      </div>
    }>
      <PaywallPageContent />
    </Suspense>
  );
}

