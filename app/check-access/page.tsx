'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/lib/session';
import { API_BASE } from '@/lib/config';

function CheckAccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    async function checkAccess() {
      // Check if user has invite code in URL
      const inviteCode = searchParams.get('inviteCode');
      
      if (inviteCode) {
        // Validate invite code format
        if (/^[A-Z0-9]{16}$/.test(inviteCode)) {
          // Has valid format invite code → Go to onboarding
          console.log('[CheckAccess] Valid invite code detected, proceeding to onboarding');
          router.push(`/onboarding?inviteCode=${inviteCode}`);
          return;
        } else {
          console.warn('[CheckAccess] Invalid invite code format');
        }
      }
      
      // Check if user has existing session
      const session = getSession();
      if (session) {
        try {
          // Verify session is still valid and has access
          const res = await fetch(`${API_BASE}/payment/status`, {
            headers: { 'Authorization': `Bearer ${session.sessionToken}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            
            // CRITICAL: Check if email verification is pending
            if (data.pendingEmail && !data.emailVerified) {
              console.log('[CheckAccess] Email verification pending - redirecting to complete verification');
              router.push('/onboarding');
              return;
            }
            
            const hasAccess = data.paidStatus === 'paid' || 
                             data.paidStatus === 'qr_verified' || 
                             data.paidStatus === 'qr_grace_period';
            
            if (hasAccess) {
              // Has valid session with access → Go to main
              console.log('[CheckAccess] Valid session detected, proceeding to main');
              router.push('/main');
              return;
            }
          }
        } catch (err) {
          console.error('[CheckAccess] Session check failed:', err);
        }
      }
      
      // No invite code and no valid session → Go to waitlist
      console.log('[CheckAccess] No access method found, redirecting to waitlist');
      router.push('/waitlist');
    }
    
    checkAccess();
  }, [router, searchParams]);
  
  return (
    <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#ffc46a] border-t-transparent"></div>
        <p className="text-[#eaeaf0]/70">Checking access...</p>
      </div>
    </main>
  );
}

export default function CheckAccessPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#ffc46a] border-t-transparent"></div>
          <p className="text-[#eaeaf0]/70">Loading...</p>
        </div>
      </main>
    }>
      <CheckAccessContent />
    </Suspense>
  );
}

