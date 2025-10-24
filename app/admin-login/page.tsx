'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Container } from '@/components/Container';
import { API_BASE } from '@/lib/config';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      const data = await res.json();
      
      // Store admin session
      localStorage.setItem('bumpin_admin_token', data.adminToken);
      
      // Redirect to admin panel
      router.push('/admin');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-md"
        >
          <div className="rounded-2xl bg-white/5 p-8 shadow-xl backdrop-blur">
            <h1 className="mb-6 text-center font-playfair text-3xl font-bold text-[#eaeaf0]">
              Admin Access
            </h1>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="username" className="mb-2 block text-sm text-[#eaeaf0]/70">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/30 focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
                  placeholder="Enter username"
                  required
                  autoComplete="username"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm text-[#eaeaf0]/70">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/30 focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
                  placeholder="Enter password"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#fcf290] px-6 py-3 font-semibold text-[#0a0a0c] transition-all hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Login'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-[#eaeaf0]/40">
              Authorized personnel only
            </p>
          </div>
        </motion.div>
      </Container>
    </main>
  );
}

