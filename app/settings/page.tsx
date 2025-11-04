'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Container } from '@/components/Container';
import { getSession, clearSession } from '@/lib/session';
import { API_BASE } from '@/lib/config';
import { clearLocation, checkLocationStatus } from '@/lib/locationAPI';
import { PasswordInput } from '@/components/PasswordInput';
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
  const [passwordValid, setPasswordValid] = useState(false);
  const [makingPermanent, setMakingPermanent] = useState(false);
  const [showEmailVerify, setShowEmailVerify] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
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
        console.log('[Settings] Account type:', data.accountType);
        console.log('[Settings] Expires at:', data.accountExpiresAt);
        console.log('[Settings] Has invite code?', !!data.myInviteCode);
        console.log('[Settings] Paid status:', data.paidStatus);
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

  const handleDeleteAccount = async () => {
    if (!confirm('⚠️ DELETE ACCOUNT?\n\nThis will permanently delete:\n• Your profile (name, photo, video)\n• All chat history\n• Social media handles\n• USC card registration (if any)\n\nThis CANNOT be undone!\n\nAre you absolutely sure?')) {
      return;
    }
    
    try {
      const session = getSession();
      if (!session) {
        router.push('/');
        return;
      }
      
      // Call server to delete account
      const response = await fetch(`${API_BASE}/user/me`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`,
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert('Failed to delete account: ' + error.error);
        return;
      }
      
      // Clear all local data
      clearSession();
      localStorage.clear();
      sessionStorage.clear();
      
      alert('✅ Account deleted successfully');
      router.push('/');
      
    } catch (error) {
      console.error('[Settings] Delete account error:', error);
      alert('Failed to delete account. Please try again.');
    }
  };

  const handleMakePermanent = async () => {
    if (!email.trim() || !password.trim()) {
      alert('Please enter both email and password');
      return;
    }

    if (!session) return;

    // CRITICAL: USC users (card OR email) MUST use @usc.edu
    const hasUSCCard = paymentStatus?.uscId || session.uscId;
    const hasUSCEmail = paymentStatus?.email?.endsWith('@usc.edu');
    const isUSCUser = hasUSCCard || hasUSCEmail;
    
    if (isUSCUser && !email.trim().toLowerCase().endsWith('@usc.edu')) {
      alert('USC users must use @usc.edu email address for permanent account');
      return;
    }

    // CRITICAL: Validate password strength
    if (!passwordValid) {
      alert('Password does not meet security requirements. Please check the requirements below.');
      return;
    }

    setMakingPermanent(true);
    try {
      // Step 1: Send email verification code
      const sendRes = await fetch(`${API_BASE}/verification/send`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.sessionToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!sendRes.ok) {
        const error = await sendRes.json();
        throw new Error(error.error || 'Failed to send verification code');
      }

      // Step 2: Show email verification modal
      setPendingEmail(email.trim());
      setShowMakePermanent(false); // Hide upgrade modal
      setShowEmailVerify(true); // Show verification modal
      alert(`Verification code sent to ${email.trim()}. Check your email!`);
    } catch (err: any) {
      alert(err.message || 'Failed to send verification code');
    } finally {
      setMakingPermanent(false);
    }
  };

  const handleVerifyAndUpgrade = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      alert('Please enter the 6-digit verification code');
      return;
    }

    if (!session) return;

    setVerifyingCode(true);
    try {
      // Step 1: Verify email code
      const verifyRes = await fetch(`${API_BASE}/verification/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: verificationCode }),
      });

      if (!verifyRes.ok) {
        const error = await verifyRes.json();
        throw new Error(error.error || 'Invalid verification code');
      }

      // Step 2: Link password (email already verified and saved by verification/verify)
      const linkRes = await fetch(`${API_BASE}/auth/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: session.sessionToken,
          email: pendingEmail,
          password: password.trim(),
        }),
      });

      if (!linkRes.ok) {
        const error = await linkRes.json();
        throw new Error(error.error || 'Failed to link password');
      }

      // Success! Update local session
      const updatedSession = { ...session, accountType: 'permanent' };
      localStorage.setItem('bumpin_session', JSON.stringify(updatedSession));
      setSession(updatedSession);
      setShowEmailVerify(false);
      setEmail('');
      setPassword('');
      setVerificationCode('');
      setPendingEmail('');
      alert('🎉 Account upgraded to permanent! Your data will never expire.');
      
      // Reload payment status to update UI
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Verification failed');
    } finally {
      setVerifyingCode(false);
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

          {/* Guest Account Upgrade Section - Only show for GUEST accounts */}
          {!loadingPayment && 
           paymentStatus?.accountType === 'guest' && 
           paymentStatus?.accountExpiresAt && 
           !paymentStatus?.email_verified && (
            <div className="rounded-xl border-2 border-yellow-500/30 bg-yellow-500/10 p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-yellow-300">⏰ Guest Account</h2>
                  <span className="text-sm font-medium text-yellow-200">
                    {(() => {
                      const now = new Date();
                      const expiry = new Date(paymentStatus.accountExpiresAt);
                      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                      return daysLeft > 0 ? `${daysLeft} days left` : 'Expired';
                    })()}
                  </span>
                </div>
                
                <p className="text-sm text-yellow-200/80">
                  Your guest account expires in {(() => {
                    const now = new Date();
                    const expiry = new Date(paymentStatus.accountExpiresAt);
                    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    return daysLeft;
                  })()} days. Upgrade to a permanent account to keep your data forever.
                </p>
                
                <button
                  onClick={() => setShowMakePermanent(true)}
                  className="w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-bold text-[#0a0a0c] hover:opacity-90 transition-opacity"
                >
                  🎓 Upgrade to Permanent Account
                </button>
              </div>
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

          {/* My Invite Code - Clean & Minimal */}
          {/* USC card users get 4-use code immediately (qr_verified), regular users need to unlock first */}
          {!loadingPayment && paymentStatus && (paymentStatus.paidStatus === 'paid' || paymentStatus.paidStatus === 'qr_verified' || (paymentStatus.paidStatus === 'qr_grace_period' && paymentStatus.qrUnlocked)) && paymentStatus.myInviteCode && (
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

          {/* Duplicate removed - using better version above with expiry countdown */}

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
                  className="w-full rounded-xl bg-[#ffc46a] px-4 py-2.5 text-sm font-medium text-[#0a0a0c] hover:opacity-90"
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
                  <a href="mailto:support@bumpin.app" className="text-[#ffc46a] hover:underline">
                    support@bumpin.app
                  </a>{' '}
                  to report a concern.
                </p>
                <button
                  onClick={() => setShowReportStub(false)}
                  className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
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
                  className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
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
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                      Email {((paymentStatus?.uscId || session?.uscId) || paymentStatus?.email?.endsWith('@usc.edu')) && (
                        <span className="ml-2 text-yellow-300 text-xs font-bold">(MUST be @usc.edu)</span>
                      )}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder={((paymentStatus?.uscId || session?.uscId) || paymentStatus?.email?.endsWith('@usc.edu')) ? "your@usc.edu" : "your@email.com"}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">Password</label>
                    <PasswordInput
                      value={password}
                      onChange={setPassword}
                      onValidationChange={(isValid) => setPasswordValid(isValid)}
                      showRequirements={true}
                      placeholder="Choose a strong password"
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
                      className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {makingPermanent ? 'Sending Code...' : 'Continue'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Email Verification Modal */}
          {showEmailVerify && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
              >
                <h3 className="mb-4 font-playfair text-2xl font-bold text-[#eaeaf0]">
                  Verify Your Email
                </h3>
                <p className="mb-6 text-[#eaeaf0]/70">
                  We sent a 6-digit code to <strong>{pendingEmail}</strong>. Enter it below to complete your upgrade.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">Verification Code</label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-2xl font-mono text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-green-500 tracking-widest"
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                    />
                    <p className="mt-2 text-xs text-[#eaeaf0]/50">
                      Code expires in 15 minutes. Check your spam folder if you don&apos;t see it.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowEmailVerify(false);
                        setShowMakePermanent(true);
                        setVerificationCode('');
                      }}
                      className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleVerifyAndUpgrade}
                      disabled={verifyingCode || verificationCode.length !== 6}
                      className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {verifyingCode ? 'Verifying...' : 'Verify & Upgrade'}
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
