'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/Container';
import { getSession } from '@/lib/session';
import { normalizeSocialHandle, getDisplayURL, updateUserSocials } from '@/lib/socials';
import Link from 'next/link';

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: '📷', placeholder: 'username or URL' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵', placeholder: '@username or URL' },
  { key: 'twitter', label: 'X / Twitter', icon: '𝕏', placeholder: '@username or URL' },
  { key: 'snapchat', label: 'Snapchat', icon: '👻', placeholder: 'username' },
  { key: 'discord', label: 'Discord', icon: '💬', placeholder: 'username#0000' },
];

export default function SocialsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [normalizedPreviews, setNormalizedPreviews] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.push('/onboarding');
      return;
    }

    // Fetch socials from server
    fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/user/me`, {
      headers: { 'Authorization': `Bearer ${session.sessionToken}` },
    })
      .then(res => res.json())
      .then(data => {
        console.log('[Socials] Loaded from server:', data.socials);
        const serverSocials = data.socials || {};
        setSocials(serverSocials);
        updatePreviews(serverSocials);
      })
      .catch(err => {
        console.error('[Socials] Failed to load from server:', err);
        // Fallback to localStorage for backward compatibility
        const savedSocials = localStorage.getItem('bumpin_socials');
        if (savedSocials) {
          try {
            const parsed = JSON.parse(savedSocials);
            setSocials(parsed);
            updatePreviews(parsed);
          } catch (e) {
            console.error('Failed to parse socials');
          }
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const updatePreviews = (socialsObj: Record<string, string>) => {
    const previews: Record<string, string> = {};
    Object.entries(socialsObj).forEach(([platform, value]) => {
      if (value) {
        const normalized = normalizeSocialHandle(platform, value);
        previews[platform] = normalized ? getDisplayURL(platform, value) : '';
      }
    });
    setNormalizedPreviews(previews);
  };

  const handleSave = async () => {
    const session = getSession();
    if (!session) return;

    setSaving(true);
    setError('');

    try {
      // Normalize all handles before saving
      const normalized: Record<string, string> = {};
      Object.entries(socials).forEach(([platform, value]) => {
        const clean = normalizeSocialHandle(platform, value);
        if (clean) {
          normalized[platform] = clean;
        }
      });

      // Save to server
      await updateUserSocials(session.sessionToken, normalized);
      
      // Save to localStorage for quick access
      localStorage.setItem('bumpin_socials', JSON.stringify(normalized));
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save socials');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    const updated = { ...socials, [key]: value };
    setSocials(updated);
    updatePreviews(updated);
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
              Other Socials
            </h1>
            <Link
              href="/main"
              className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              ← Back
            </Link>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white/5 p-6 shadow-inner">
              <p className="mb-6 text-base text-[#eaeaf0]/70">
                Enter handles or URLs - we&apos;ll normalize them automatically
              </p>

              <div className="space-y-6">
                {SOCIAL_PLATFORMS.map((platform) => (
                  <div key={platform.key}>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[#eaeaf0]">
                      <span className="text-lg">{platform.icon}</span>
                      {platform.label}
                    </label>
                    <input
                      type="text"
                      value={socials[platform.key] || ''}
                      onChange={(e) => handleChange(platform.key, e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
                      placeholder={platform.placeholder}
                    />
                    {normalizedPreviews[platform.key] && (
                      <p className="mt-2 text-xs text-green-400">
                        → {normalizedPreviews[platform.key]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/30">
                {error}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save preset links'}
            </button>
          </div>

          <p className="text-center text-xs text-[#eaeaf0]/40">
            Normalized handles will be used when sharing during video calls
          </p>
        </motion.div>
      </Container>
    </main>
  );
}
