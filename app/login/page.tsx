'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/Container';
import { login } from '@/lib/api';
import { saveSession } from '@/lib/session';
import { USCCardLogin } from '@/components/usc-verification/USCCardLogin';
import Link from 'next/link';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginMethod, setLoginMethod] = useState<'email' | 'card'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'email' | 'code' | 'password'>('email');

  // Extract referral code from URL if present
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref);
      console.log('[Login] Referral code detected:', ref);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await login(email, password);
      saveSession({
        sessionToken: response.sessionToken,
        userId: response.userId,
        accountType: response.accountType,
      });
      
      // CRITICAL: If login came from referral link, preserve ref code and open matchmaking
      if (referralCode) {
        console.log('[Login] Redirecting to matchmaking with referral code:', referralCode);
        router.push(`/main?openMatchmaking=true&ref=${referralCode}`);
      } else {
        router.push('/main');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSendResetCode = async () => {
    if (!resetEmail.trim()) {
      setError('Email is required');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send reset code');
      }
      
      setResetStep('code');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleResetPassword = async () => {
    if (!resetCode.trim() || !newPassword.trim()) {
      setError('Code and new password are required');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim(),
          code: resetCode.trim(),
          newPassword: newPassword.trim(),
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset password');
      }
      
      // Success - close modal and show success message
      setShowForgotPassword(false);
      setResetEmail('');
      setResetCode('');
      setNewPassword('');
      setResetStep('email');
      alert('Password reset successful! You can now login with your new password.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main" className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-md space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
        >
          <div className="text-center">
            <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
              Welcome back
            </h1>
            <p className="mt-4 text-lg text-[#eaeaf0]/70">
              Login to your account
            </p>
          </div>

          {/* Login Method Tabs */}
          <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
            <button
              type="button"
              onClick={() => setLoginMethod('email')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                loginMethod === 'email'
                  ? 'bg-[#ffc46a] text-[#0a0a0c]'
                  : 'text-[#eaeaf0]/70 hover:text-[#eaeaf0]'
              }`}
            >
              📧 Email
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('card')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                loginMethod === 'card'
                  ? 'bg-[#ffc46a] text-[#0a0a0c]'
                  : 'text-[#eaeaf0]/70 hover:text-[#eaeaf0]'
              }`}
            >
              🎓 USC Card
            </button>
          </div>

          {loginMethod === 'email' ? (
          <form onSubmit={handleSubmit} className="space-y-6" name="login-form">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                placeholder="your@email.com"
                autoComplete="email username"
                required
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                <p className="font-medium mb-2">{error}</p>
                {error.includes('Invalid credentials') && (
                  <p className="text-xs text-red-300/80 mt-2">
                    Note: Login is only for permanent accounts. If you signed up as a guest, you don&apos;t have a password yet. 
                    Sign up or link your account in Settings after signing in.
                  </p>
                )}
                {error.includes('Too many') && (
                  <p className="text-xs text-red-300/80 mt-2">
                    Your IP has been temporarily blocked due to too many failed login attempts. Please wait 10 minutes or try signing up as a new guest instead.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
            
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-[#ffc46a] hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </form>
          ) : (
          <div className="space-y-6">
            <USCCardLogin
              onSuccess={async (uscId, rawValue) => {
                setLoading(true);
                setError('');
                
                try {
                  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
                  const res = await fetch(`${API_BASE}/usc/login-card`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rawBarcodeValue: rawValue }),
                  });
                  
                  if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || 'Login failed');
                  }
                  
                  const data = await res.json();
                  
                  saveSession({
                    sessionToken: data.sessionToken,
                    userId: data.userId,
                    accountType: data.accountType,
                  });
                  
                  console.log('[Login] USC card login successful');
                  
                  if (referralCode) {
                    router.push(`/main?openMatchmaking=true&ref=${referralCode}`);
                  } else {
                    router.push('/main');
                  }
                } catch (err: any) {
                  setError(err.message);
                  setLoading(false);
                }
              }}
              onSkipToEmail={() => setLoginMethod('email')}
            />
            
            {error && (
              <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
          )}

          <div className="text-center space-y-3">
            <p className="text-sm text-[#eaeaf0]/70">
              Don&apos;t have an account?{' '}
              <Link 
                href="/waitlist"
                className="font-medium text-[#ffc46a] hover:underline"
              >
                Sign up here
              </Link>
            </p>
            <Link href="/" className="block text-sm text-[#eaeaf0]/50 hover:text-[#eaeaf0]">
              ← Back to home
            </Link>
          </div>
        </motion.div>

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md w-full rounded-2xl bg-[#0a0a0c] p-8 border border-white/10"
            >
              <h2 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-6">
                Reset Password
              </h2>
              
              {resetStep === 'email' && (
                <div className="space-y-4">
                  <p className="text-sm text-[#eaeaf0]/70 mb-4">
                    Enter your email address and we&apos;ll send you a verification code to reset your password.
                  </p>
                  
                  <div>
                    <label className="text-sm font-medium text-[#eaeaf0] mb-2 block">
                      Email
                    </label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                    />
                  </div>
                  
                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowForgotPassword(false);
                        setResetEmail('');
                        setError('');
                      }}
                      className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendResetCode}
                      disabled={loading || !resetEmail.trim()}
                      className="flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-bold text-[#0a0a0c] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {loading ? 'Sending...' : 'Send Code'}
                    </button>
                  </div>
                </div>
              )}
              
              {resetStep === 'code' && (
                <div className="space-y-4">
                  <p className="text-sm text-[#eaeaf0]/70 mb-4">
                    We sent a 6-digit code to <strong>{resetEmail}</strong>
                  </p>
                  
                  <div>
                    <label className="text-sm font-medium text-[#eaeaf0] mb-2 block">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] text-center text-2xl font-mono tracking-widest placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-[#eaeaf0] mb-2 block">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                    />
                    <p className="text-xs text-[#eaeaf0]/50 mt-2">
                      8+ characters, uppercase, lowercase, number, special character
                    </p>
                  </div>
                  
                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setResetStep('email')}
                      className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleResetPassword}
                      disabled={loading || resetCode.length !== 6 || !newPassword.trim()}
                      className="flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-bold text-[#0a0a0c] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {loading ? 'Resetting...' : 'Reset Password'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </Container>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-[#eaeaf0]">Loading...</div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
