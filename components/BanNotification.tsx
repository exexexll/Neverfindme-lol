'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getSession, clearSession } from '@/lib/session';
import { checkBanStatus } from '@/lib/api';
import Image from 'next/image';

interface BanRecord {
  userId: string;
  userName: string;
  banStatus: 'none' | 'temporary' | 'permanent' | 'vindicated';
  bannedAt: number;
  bannedReason: string;
  reportCount: number;
  reviewStatus: 'pending' | 'reviewed_ban' | 'reviewed_vindicate';
}

export default function BanNotification() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isBanned, setIsBanned] = useState(false);
  const [banRecord, setBanRecord] = useState<BanRecord | null>(null);

  useEffect(() => {
    const checkBan = async () => {
      const session = getSession();
      if (!session) {
        setChecking(false);
        return;
      }

      try {
        const result = await checkBanStatus(session.sessionToken);
        
        if (result.isBanned) {
          setIsBanned(true);
          setBanRecord(result.banRecord);
        }
      } catch (error: any) {
        // Handle different error cases
        if (error.message?.includes('Session invalidated')) {
          // Session was invalidated by new login - clear and stay silent
          console.log('[Ban] Session invalidated (logged in elsewhere) - clearing silently');
          localStorage.removeItem('napalmsky_session');
          // SessionInvalidatedModal will handle the notification
        } else if (error.message?.includes('Invalid or expired session')) {
          // Session expired - clear it and let user re-login
          console.log('[Ban] Session expired, clearing...');
          localStorage.removeItem('napalmsky_session');
        } else if (error.message?.includes('suspended') || error.message?.includes('banned')) {
          // User is actually banned
          setIsBanned(true);
        } else {
          // Other error - log but don't show to user
          console.warn('[Ban] Could not verify ban status:', error.message);
        }
      } finally {
        setChecking(false);
      }
    };

    checkBan();
  }, []);

  const handleLogout = () => {
    clearSession();
    router.push('/');
  };

  if (checking) {
    return null; // Don't show anything while checking
  }

  if (!isBanned) {
    return null; // Not banned, don't show anything
  }

  // Determine ban message based on status
  const getBanMessage = () => {
    if (banRecord?.banStatus === 'temporary') {
      return {
        title: 'Account Suspended',
        message: 'Your account has been temporarily suspended due to multiple reports from other users. Your case is currently under review by our team.',
        status: 'pending',
        color: 'orange',
      };
    } else if (banRecord?.banStatus === 'permanent') {
      return {
        title: 'Account Permanently Banned',
        message: 'Your account has been permanently banned from Napalm Sky. Your information has been added to the public blacklist.',
        status: 'permanent',
        color: 'red',
      };
    }
    
    return {
      title: 'Access Denied',
      message: 'Your account has been suspended.',
      status: 'unknown',
      color: 'red',
    };
  };

  const banInfo = getBanMessage();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0c] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full rounded-2xl bg-white/5 p-8 shadow-2xl border border-white/10"
      >
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <Image src="/logo.svg" alt="Napalm Sky" width={120} height={24} priority />
        </div>

        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className={`rounded-full ${banInfo.color === 'orange' ? 'bg-orange-500/20' : 'bg-red-500/20'} p-6`}>
            <svg 
              className={`h-12 w-12 ${banInfo.color === 'orange' ? 'text-orange-400' : 'text-red-400'}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h1 className="mb-4 font-playfair text-3xl font-bold text-[#eaeaf0]">
            {banInfo.title}
          </h1>
          
          <p className="mb-6 text-[#eaeaf0]/70">
            {banInfo.message}
          </p>

          {banRecord && (
            <div className="mb-6 space-y-2 rounded-xl bg-white/5 p-4 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-[#eaeaf0]/50">Reports:</span>
                <span className="font-medium text-[#eaeaf0]">{banRecord.reportCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#eaeaf0]/50">Status:</span>
                <span className={`font-medium ${banInfo.color === 'orange' ? 'text-orange-400' : 'text-red-400'}`}>
                  {banRecord.reviewStatus === 'pending' ? 'Pending Review' : 
                   banRecord.banStatus === 'permanent' ? 'Permanently Banned' : 
                   'Suspended'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#eaeaf0]/50">Banned:</span>
                <span className="font-medium text-[#eaeaf0]">
                  {new Date(banRecord.bannedAt).toLocaleDateString()}
                </span>
              </div>
              {banRecord.bannedReason && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-[#eaeaf0]/50">Reason:</p>
                  <p className="mt-1 text-sm text-[#eaeaf0]">{banRecord.bannedReason}</p>
                </div>
              )}
            </div>
          )}

          {banInfo.status === 'pending' && (
            <p className="mb-6 text-sm text-[#eaeaf0]/50">
              Please check back later for an update on your case. If you believe this is a mistake, please contact support.
            </p>
          )}

          {banInfo.status === 'permanent' && (
            <p className="mb-6 text-sm text-[#eaeaf0]/50">
              This decision is final. For more information, view the public blacklist on our website.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {banInfo.status === 'permanent' && (
            <button
              onClick={() => router.push('/blacklist')}
              className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
            >
              View Blacklist
            </button>
          )}
          
          <button
            onClick={handleLogout}
            className="focus-ring w-full rounded-xl bg-red-500/20 px-6 py-3 font-medium text-red-300 transition-all hover:bg-red-500/30 border border-red-500/30"
          >
            Logout
          </button>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[#eaeaf0]/30">
          Napalm Sky enforces strict community guidelines to maintain a safe environment for all users.
        </p>
      </motion.div>
    </div>
  );
}

