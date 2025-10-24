'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { getBlacklist } from '@/lib/api';

interface BlacklistEntry {
  userName: string;
  userSelfie?: string;
  userVideo?: string;
  bannedAt: number;
  bannedReason: string;
  reportCount: number;
}

interface BlacklistData {
  blacklist: BlacklistEntry[];
  count: number;
  lastUpdated: number;
}

export default function BlacklistPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BlacklistData | null>(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBlacklist();
  }, []);

  const loadBlacklist = async () => {
    try {
      setLoading(true);
      const result = await getBlacklist();
      setData(result);
    } catch (err: any) {
      console.error('[Blacklist] Failed to load:', err);
      setError(err.message || 'Failed to load blacklist');
    } finally {
      setLoading(false);
    }
  };

  const filteredBlacklist = data?.blacklist.filter((entry) =>
    entry.userName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading blacklist...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c] p-4">
        <div className="max-w-md rounded-xl bg-red-500/10 p-8 text-center border border-red-500/30">
          <p className="text-lg text-red-300">{error}</p>
          <button
            onClick={loadBlacklist}
            className="mt-4 rounded-xl bg-red-500/20 px-6 py-2 text-sm font-medium text-red-300 transition-all hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0c]">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo.svg" alt="BUMPIn" width={120} height={24} priority />
              <span className="text-[#eaeaf0]/50">|</span>
              <h1 className="font-playfair text-2xl font-bold text-[#eaeaf0]">
                Blacklist
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-white/10 bg-gradient-to-b from-red-500/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 border border-red-500/30">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium text-red-300">Public Safety Notice</span>
            </div>

            <h2 className="mb-4 font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
              Permanently Banned Users
            </h2>
            
            <p className="mx-auto max-w-2xl text-lg text-[#eaeaf0]/70">
              This is a public record of users who have been permanently banned from BUMPIn due to
              multiple reports of inappropriate behavior. This blacklist exists to maintain community safety
              and enforce real-world consequences for malicious actors.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <div className="rounded-xl bg-white/5 px-6 py-3">
                <p className="text-sm text-[#eaeaf0]/50">Total Banned</p>
                <p className="text-2xl font-bold text-red-400">{data?.count || 0}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-6 py-3">
                <p className="text-sm text-[#eaeaf0]/50">Last Updated</p>
                <p className="text-sm font-medium text-[#eaeaf0]">
                  {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="mb-8">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="w-full rounded-xl bg-white/10 px-6 py-4 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
          />
        </div>

        {/* List */}
        {filteredBlacklist.length === 0 ? (
          <div className="rounded-xl bg-white/5 p-12 text-center">
            <p className="text-lg text-[#eaeaf0]/70">
              {searchQuery ? 'No results found' : 'No banned users yet'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBlacklist.map((entry, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="overflow-hidden rounded-xl bg-white/5 transition-all hover:bg-white/10"
              >
                {/* Media */}
                <div className="relative aspect-square bg-black">
                  {entry.userSelfie ? (
                    <Image
                      src={entry.userSelfie}
                      alt={entry.userName}
                      fill
                      className="object-cover opacity-75"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-6xl opacity-30">👤</div>
                    </div>
                  )}
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  
                  {/* Ban Badge */}
                  <div className="absolute top-4 right-4 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
                    BANNED
                  </div>
                </div>

                {/* Info */}
                <div className="p-6">
                  <h3 className="mb-2 text-xl font-bold text-[#eaeaf0]">
                    {entry.userName}
                  </h3>
                  
                  <div className="mb-4 space-y-1 text-sm text-[#eaeaf0]/50">
                    <p>{entry.reportCount} reports received</p>
                    <p>Banned on {new Date(entry.bannedAt).toLocaleDateString()}</p>
                  </div>

                  <div className="rounded-lg bg-red-500/10 p-3 border border-red-500/30">
                    <p className="text-xs font-medium text-red-300">Reason:</p>
                    <p className="mt-1 text-sm text-[#eaeaf0]/90">{entry.bannedReason}</p>
                  </div>

                  {entry.userVideo && (
                    <div className="mt-4">
                      <video
                        src={entry.userVideo}
                        controls
                        className="w-full rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/40 py-12">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-[#eaeaf0]/50">
            This blacklist is maintained by BUMPIn to ensure community safety.
            All bans are reviewed by administrators before being made permanent.
          </p>
          <p className="mt-2 text-xs text-[#eaeaf0]/30">
            If you believe you were banned in error, please contact support.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="text-sm font-medium text-[#fcf290] hover:text-[#fcf290]/80"
            >
              Return to BUMPIn
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

