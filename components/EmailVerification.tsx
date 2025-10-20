'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { API_BASE } from '@/lib/config';

interface EmailVerificationProps {
  sessionToken: string;
  email: string;
  onVerified: () => void;
  onSkip?: () => void;
}

export function EmailVerification({ sessionToken, email, onVerified, onSkip }: EmailVerificationProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (!codeSent) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [codeSent]);

  const handleSendCode = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/verification/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send code');
      }

      setCodeSent(true);
      setTimeLeft(600);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Code must be 6 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/verification/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Invalid code');
      }

      onVerified();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="font-playfair text-3xl font-bold text-[#eaeaf0] mb-2">
          Verify Your Email
        </h2>
        <p className="text-[#eaeaf0]/70">
          We'll send a verification code to: <strong>{email}</strong>
        </p>
      </div>

      {!codeSent ? (
        <button
          onClick={handleSendCode}
          disabled={loading}
          className="w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Verification Code'}
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#eaeaf0] mb-2">
              Enter 6-digit code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              placeholder="000000"
              autoFocus
              className="w-full rounded-xl bg-white/10 px-6 py-4 text-center text-3xl font-mono tracking-widest text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
            />
          </div>

          {timeLeft > 0 && (
            <p className="text-center text-sm text-[#eaeaf0]/50">
              Code expires in {formatTime(timeLeft)}
            </p>
          )}

          <button
            onClick={handleVerify}
            disabled={loading || code.length !== 6}
            className="w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>

          {timeLeft > 0 && (
            <button
              onClick={handleSendCode}
              disabled={loading}
              className="w-full text-sm text-[#eaeaf0]/70 hover:text-[#eaeaf0]"
            >
              Resend code
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400 text-center">
          {error}
        </div>
      )}

      {onSkip && (
        <button
          onClick={onSkip}
          className="w-full text-sm text-[#eaeaf0]/50 hover:text-[#eaeaf0]"
        >
          Skip for now
        </button>
      )}
    </motion.div>
  );
}

