'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/Container';
import { getSession } from '@/lib/session';
import Link from 'next/link';

interface ChatLog {
  roomId: string;
  partnerId: string;
  partnerName: string;
  startedAt: number;
  duration: number;
  messages: Array<{
    from: string;
    text: string;
    timestamp: number;
  }>;
}

export default function HistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ChatLog[]>([]);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    // CRITICAL SECURITY: Check payment status before loading history
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
    
    fetch(`${API_BASE}/payment/status`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    })
      .then(res => res.json())
      .then(paymentData => {
        // CRITICAL: Check if email verification is pending
        if (paymentData.pendingEmail && !paymentData.emailVerified) {
          console.log('[History] Email verification pending - redirecting to onboarding');
          router.push('/onboarding');
          return;
        }
        
        // Allow BOTH paid users AND qr_verified users (invite code, referral, QR scan)
        const hasPaid = paymentData.paidStatus === 'paid' || paymentData.paidStatus === 'qr_verified' || paymentData.paidStatus === 'qr_grace_period';
        
        if (!hasPaid) {
          console.warn('[History] Unpaid user attempted access - redirecting to waitlist');
          router.push('/waitlist');
          return;
        }
        
        // User has paid OR used valid invite code, fetch history from server
        fetch(`${API_BASE}/room/history`, {
          headers: { 'Authorization': `Bearer ${session.sessionToken}` },
        })
          .then(res => res.json())
          .then(data => {
            console.log('[History] Loaded from server:', data.history?.length || 0, 'chats');
            setHistory(data.history || []);
          })
          .catch(err => {
            console.error('[History] Failed to load from server:', err);
            // Fallback to localStorage for backward compatibility
            const saved = localStorage.getItem('bumpin_history');
            if (saved) {
              try {
                setHistory(JSON.parse(saved));
              } catch (e) {
                console.error('Failed to parse history');
              }
            }
          })
          .finally(() => setLoading(false));
      })
      .catch(err => {
        console.error('[History] Payment check failed:', err);
        router.push('/onboarding');
      });
  }, [router]);

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
          className="space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
        >
          <div className="flex items-center justify-between">
            <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
              Past Chats
            </h1>
            <Link
              href="/main"
              className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              ← Back
            </Link>
          </div>

          {history.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-12 text-center shadow-inner">
              <div className="mb-4 text-6xl">💬</div>
              <p className="mb-4 text-lg text-[#eaeaf0]/70">
                No chat history yet
              </p>
              <p className="text-sm text-[#eaeaf0]/50">
                Your conversation logs will appear here after you complete your first call
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((chat, idx) => (
                <motion.div
                  key={chat.roomId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className="rounded-2xl bg-white/5 p-6 shadow-inner"
                >
                  <div className="mb-4 flex items-start justify-between border-b border-white/10 pb-4">
                    <div>
                      <h3 className="font-playfair text-xl font-bold text-[#eaeaf0]">
                        Chat with {chat.partnerName}
                      </h3>
                      <p className="mt-1 text-sm text-[#eaeaf0]/50">
                        {new Date(chat.startedAt).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })} • {chat.duration}s
                      </p>
                    </div>
                    <div className="rounded-lg bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300">
                      Read-only
                    </div>
                  </div>

                  {chat.messages.length > 0 ? (
                    <div className="space-y-2">
                      {chat.messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`rounded-lg p-3 text-sm ${
                            msg.from === getSession()?.userId
                              ? 'bg-[#ffc46a]/20 text-[#eaeaf0]'
                              : 'bg-white/10 text-[#eaeaf0]/90'
                          }`}
                        >
                          {msg.text}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm italic text-[#eaeaf0]/50">
                      No text messages in this session
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </Container>
    </main>
  );
}
