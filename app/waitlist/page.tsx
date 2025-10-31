'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Container } from '@/components/Container';
import { API_BASE } from '@/lib/config';
import Link from 'next/link';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
  'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  'Washington DC'
];

export default function WaitlistPage() {
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [school, setSchool] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !state || !school.trim() || !email.trim()) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/waitlist/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          state,
          school: school.trim(),
          email: email.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join waitlist');
      }

      setSubmitted(true);
      
      // Prevent back button after submit
      window.history.pushState(null, '', window.location.href);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4 pt-24">
        <Container>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6 max-w-md mx-auto"
          >
            <div className="text-6xl">✅</div>
            <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0]">
              You&apos;re on the list!
            </h1>
            <p className="text-[#eaeaf0]/70 text-lg">
              We&apos;ll notify you at <strong>{email}</strong> when we expand access.
            </p>
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-6">
              <p className="text-sm text-blue-200 mb-4">
                <strong>Want access now?</strong>
              </p>
              <div className="space-y-2 text-[#eaeaf0]/70 text-sm">
                <p>🎓 <strong>USC students:</strong> Scan your campus card</p>
                <p>🎟️ <strong>Have an invite?</strong> Use a friend&apos;s QR code</p>
              </div>
            </div>
            <Link
              href="/"
              className="inline-block rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
            >
              ← Back to Homepage
            </Link>
          </motion.div>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4 pt-24">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto space-y-8"
        >
          <div className="text-center space-y-4">
            <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0]">
              Join the Waitlist
            </h1>
            <p className="text-[#eaeaf0]/70">
              BUMPIN is currently invite-only. Join our waitlist to be notified when we expand access.
            </p>
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
              <p className="text-sm text-yellow-200">
                <strong>Have an invite code or USC card?</strong><br/>
                <Link href="/" className="underline hover:text-yellow-100">
                  Go to homepage
                </Link> and click &quot;Get Started&quot;
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                required
              >
                <option value="">Select your state</option>
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                School (Current or Previous)
              </label>
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                placeholder="University of Southern California"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-bold text-[#0a0a0c] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Join Waitlist'}
            </button>

            <p className="text-center text-sm text-[#eaeaf0]/50">
              Already have an account?{' '}
              <Link href="/login" className="text-[#ffc46a] hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </motion.div>
      </Container>
    </main>
  );
}

