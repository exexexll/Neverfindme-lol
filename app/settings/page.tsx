'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Container } from '@/components/Container';
import { getSession, clearSession } from '@/lib/session';
import { API_BASE } from '@/lib/config';
import { clearLocation, checkLocationStatus } from '@/lib/locationAPI';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [showReportStub, setShowReportStub] = useState(false);
  const [showBlockStub, setShowBlockStub] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState(true);
  const [showMakePermanent, setShowMakePermanent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [makingPermanent, setMakingPermanent] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    const sessionData = getSession();
    if (!sessionData) {
      router.push('/onboarding');
      return;
    }
    setSession(sessionData);
    setLoading(false);

    // Fetch payment status and invite code
    fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${sessionData.sessionToken}` },
    })
      .then(res => res.json())
      .then(data => {
        console.log('[Settings] Payment status received:', data);
        console.log('[Settings] Has invite code?', !!data.myInviteCode);
        console.log('[Settings] Paid status:', data.paidStatus);
        console.log('[Settings] Uses remaining:', data.inviteCodeUsesRemaining);
        setPaymentStatus(data);
      })
      .catch(err => console.error('Failed to fetch payment status:', err))
      .finally(() => setLoadingPayment(false));

    // Check location status
    checkLocationStatus(sessionData.sessionToken).then(status => {
      setLocationEnabled(status.active);
      console.log('[Settings] Location active:', status.active);
    });
  }, [router]);

  const handleLogout = () => {
    clearSession();
    router.push('/');
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      // Clear local data
      clearSession();
      localStorage.removeItem('bumpin_history');
      localStorage.removeItem('bumpin_socials');
      localStorage.removeItem('bumpin_timer_total');
      
      // In production: call DELETE /user/me to clear server data
      router.push('/');
    }
  };

  const handleMakePermanent = async () => {
    if (!email.trim() || !password.trim()) {
      alert('Please enter both email and password');
      return;
    }

    if (!session) return;

    setMakingPermanent(true);
    try {
      const res = await fetch(`${API_BASE}/auth/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: session.sessionToken,
          email: email.trim(),
          password: password.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to upgrade account');
      }

      // Update local session
      const updatedSession = { ...session, accountType: 'permanent' };
      localStorage.setItem('bumpin_session', JSON.stringify(updatedSession));
      setSession(updatedSession);
      setShowMakePermanent(false);
      setEmail('');
      setPassword('');
      alert('Account upgraded to permanent!');
    } catch (err: any) {
      alert(err.message || 'Failed to upgrade account');
    } finally {
      setMakingPermanent(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-[#eaeaf0]">Loading...</div>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-2xl space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
        >
          <div className="flex items-center justify-between">
            <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
              Settings
            </h1>
            <Link
              href="/main"
              className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              ← Back
            </Link>
          </div>

          {/* Account Summary */}
          <div className="rounded-2xl bg-white/5 p-6 shadow-inner">
            <h2 className="mb-4 text-xl font-bold text-[#eaeaf0]">Account Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-[#eaeaf0]/50">User ID</span>
                <span className="font-mono text-sm text-[#eaeaf0]">
                  {session?.userId.slice(0, 8)}...
                </span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-3">
                <span className="text-sm text-[#eaeaf0]/50">Account Type</span>
                <span className={`rounded-lg px-2 py-1 text-xs font-medium ${
                  session?.accountType === 'permanent'
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-yellow-500/20 text-yellow-300'
                }`}>
                  {session?.accountType === 'permanent' ? 'Permanent' : 'Guest'}
                </span>
              </div>
            </div>
          </div>

          {/* Debug: Show payment status */}
          {!loadingPayment && paymentStatus && (
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3">
              <p className="text-xs text-blue-300 font-mono">
                🔍 Debug:<br/>
                • Status: {paymentStatus.paidStatus}<br/>
                • My Code: {paymentStatus.myInviteCode || 'none'}<br/>
                • Uses Left: {paymentStatus.inviteCodeUsesRemaining} / {paymentStatus.myCodeInfo?.maxUses || 4}<br/>
                • Total Used: {paymentStatus.myCodeInfo?.totalUsed || 0}<br/>
                {paymentStatus.inviteCodeUsed && `• Joined Via: ${paymentStatus.inviteCodeUsed}`}
              </p>
            </div>
          )}

          {/* QR Grace Period Progress (if in grace period and not unlocked) */}
          {!loadingPayment && paymentStatus && paymentStatus.paidStatus === 'qr_grace_period' && !paymentStatus.qrUnlocked && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-orange-300">🔒 QR Code Locked</h2>
                  <span className="text-sm text-orange-300/70">
                    {paymentStatus.successfulSessions || 0} / 4 sessions
                  </span>
                </div>
                <p className="text-sm text-orange-200/80">
                  Complete {4 - (paymentStatus.successfulSessions || 0)} more video calls (30s+) to unlock your QR code and invite friends!
                </p>
                {/* Progress bar */}
                <div className="w-full h-2 bg-black/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-500"
                    style={{ width: `${((paymentStatus.successfulSessions || 0) / 4) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* My Invite Code (if QR unlocked) - Clean & Minimal */}
          {!loadingPayment && paymentStatus && (paymentStatus.paidStatus === 'paid' || (paymentStatus.paidStatus === 'qr_verified' && paymentStatus.qrUnlocked) || (paymentStatus.paidStatus === 'qr_grace_period' && paymentStatus.qrUnlocked)) && paymentStatus.myInviteCode && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-purple-300">Friend Invites</h2>
                <span className="text-sm text-purple-300/70">
                  {paymentStatus.inviteCodeUsesRemaining} / 4 left
                </span>
              </div>
              
              <div className="space-y-3">
                {/* Code */}
                <div className="rounded-lg bg-black/30 px-4 py-2.5">
                  <p className="font-mono text-lg font-bold text-purple-300 tracking-wider text-center">
                    {paymentStatus.myInviteCode}
                  </p>
                </div>

                {/* QR Code - Compact */}
                <div className="flex justify-center">
                  <div className="rounded-lg bg-white p-2">
                    {/* Use img tag for QR codes - more reliable than Next.js Image */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={`${API_BASE}/payment/qr/${paymentStatus.myInviteCode}`}
                      alt="QR Code"
                      className="w-32 h-32"
                      onError={(e) => {
                        console.error('[Settings] QR Code failed to load');
                      }}
                    />
                  </div>
                </div>

                {/* Actions - Minimal */}
                <button
                  onClick={() => {
                    const link = `${window.location.origin}/onboarding?inviteCode=${paymentStatus.myInviteCode}`;
                    navigator.clipboard.writeText(link);
                  }}
                  className="focus-ring w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                >
                  Copy Invite Link
                </button>
              </div>
            </div>
          )}

          {/* Privacy Policy */}
          <div className="rounded-2xl bg-white/5 p-6 shadow-inner">
            <h2 className="mb-4 text-xl font-bold text-[#eaeaf0]">Privacy & Data</h2>
            <div className="space-y-3 text-sm text-[#eaeaf0]/70">
              <p>
                <strong className="text-[#eaeaf0]">Guest accounts:</strong> Your data is stored temporarily
                and will be deleted after 7 days of inactivity.
              </p>
              <p>
                <strong className="text-[#eaeaf0]">Permanent accounts:</strong> Your data persists until
                you delete your account.
              </p>
              <p>
                <strong className="text-[#eaeaf0]">Call recordings:</strong> Not stored. Only text chat
                logs are saved (read-only).
              </p>
            </div>
          </div>

          {/* Safety & Privacy */}
          <div className="rounded-2xl bg-white/5 p-6 shadow-inner">
            <h2 className="mb-4 text-xl font-bold text-[#eaeaf0]">Safety & Privacy</h2>
            <p className="mb-4 text-sm text-[#eaeaf0]/70">
              Report concerns or manage your safety preferences
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setShowReportStub(true)}
                className="focus-ring w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Report User
              </button>
              <button
                onClick={() => setShowBlockStub(true)}
                className="focus-ring w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Block User
              </button>
            </div>
          </div>

          {/* Make Permanent (Guest accounts only) */}
          {session?.accountType === 'guest' && (
            <div className="rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 p-6">
              <h2 className="mb-3 text-xl font-bold text-green-300">Upgrade to Permanent</h2>
              <p className="mb-4 text-sm text-[#eaeaf0]/70">
                Guest accounts are deleted after 7 days of inactivity. Upgrade to permanent to keep your data forever.
              </p>
              <button
                onClick={() => setShowMakePermanent(true)}
                className="focus-ring w-full rounded-xl bg-green-500 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
              >
                Make Account Permanent
              </button>
            </div>
          )}

          {/* Location Sharing Toggle */}
          <div className="rounded-2xl bg-white/5 p-6 shadow-inner border border-white/10">
            <h2 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-4">
              Location Sharing
            </h2>
            <p className="text-sm text-[#eaeaf0]/70 mb-4">
              Show people nearby in matchmaking. Your exact location is never shared—only approximate distance.
            </p>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[#eaeaf0]">
                  {locationEnabled ? 'Location Enabled' : 'Location Disabled'}
                </p>
                <p className="text-xs text-[#eaeaf0]/50">
                  {locationEnabled ? 'Auto-deletes after 24 hours' : 'Grant permission in matchmaking to enable'}
                </p>
              </div>
              
              {locationEnabled && (
                <button
                  onClick={async () => {
                    setLocationLoading(true);
                    const success = await clearLocation(session.sessionToken);
                    if (success) {
                      setLocationEnabled(false);
                      localStorage.setItem('bumpin_location_consent', 'false');
                      alert('Location sharing disabled');
                    }
                    setLocationLoading(false);
                  }}
                  disabled={locationLoading}
                  className="rounded-xl bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                >
                  {locationLoading ? 'Clearing...' : 'Disable'}
                </button>
              )}
            </div>
            
            {!locationEnabled && (
              <div className="mt-4">
                <button
                  onClick={() => {
                    // Clear localStorage to allow modal to show again
                    localStorage.removeItem('bumpin_location_consent');
                    alert('Location permission reset. Open matchmaking to grant permission again.');
                  }}
                  className="w-full rounded-xl bg-[#fcf290] px-4 py-2.5 text-sm font-medium text-[#0a0a0c] hover:opacity-90"
                >
                  Enable Location Sharing
                </button>
                <p className="mt-2 text-xs text-center text-[#eaeaf0]/40">
                  You&apos;ll be asked for permission when you open matchmaking
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-4">
            <button
              onClick={handleLogout}
              className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              Logout
            </button>

            <button
              onClick={handleDeleteAccount}
              className="focus-ring w-full rounded-xl bg-red-500/20 px-6 py-3 font-medium text-red-400 transition-all hover:bg-red-500/30"
            >
              Delete Account
            </button>
          </div>

          <p className="text-center text-xs text-[#eaeaf0]/40">
            Deleting your account will remove all your data from local storage and the server
          </p>

          {/* Report Stub Modal */}
          {showReportStub && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowReportStub(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
                role="dialog"
                aria-labelledby="report-title"
                aria-modal="true"
              >
                <h3 id="report-title" className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
                  Report User
                </h3>
                <p className="mb-6 text-[#eaeaf0]/70">
                  This feature will be available in a future update. For now, please email{' '}
                  <a href="mailto:support@bumpin.app" className="text-[#fcf290] hover:underline">
                    support@bumpin.app
                  </a>{' '}
                  to report a concern.
                </p>
                <button
                  onClick={() => setShowReportStub(false)}
                  className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                >
                  Got it
                </button>
              </motion.div>
            </div>
          )}

          {/* Block Stub Modal */}
          {showBlockStub && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowBlockStub(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
                role="dialog"
                aria-labelledby="block-title"
                aria-modal="true"
              >
                <h3 id="block-title" className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
                  Block User
                </h3>
                <p className="mb-6 text-[#eaeaf0]/70">
                  This feature will be available in a future update. User blocking and filtering will help you control who can see your profile and invite you to calls.
                </p>
                <button
                  onClick={() => setShowBlockStub(false)}
                  className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
                >
                  Got it
                </button>
              </motion.div>
            </div>
          )}

          {/* Make Permanent Modal */}
          {showMakePermanent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowMakePermanent(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
              >
                <h3 className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
                  Make Account Permanent
                </h3>
                <p className="mb-6 text-[#eaeaf0]/70">
                  Link an email and password to save your account permanently.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="your@email.com"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Choose a password"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowMakePermanent(false);
                        setEmail('');
                        setPassword('');
                      }}
                      className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleMakePermanent}
                      disabled={makingPermanent}
                      className="focus-ring flex-1 rounded-xl bg-green-500 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {makingPermanent ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </Container>
    </main>
  );
}
