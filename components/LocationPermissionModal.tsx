'use client';

import { motion } from 'framer-motion';

interface LocationPermissionModalProps {
  onAllow: () => void;
  onDeny: () => void;
}

export function LocationPermissionModal({ onAllow, onDeny }: LocationPermissionModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md rounded-2xl bg-[#0a0a0c] p-8 shadow-2xl border border-white/10"
      >
        <div className="text-center mb-4">
          <div className="text-6xl mb-4">📍</div>
          <h2 className="font-playfair text-3xl font-bold text-[#eaeaf0] mb-3">
            Show People Near You?
          </h2>
        </div>
        
        <p className="text-[#eaeaf0]/80 mb-6 text-center">
          We&apos;ll show people closest to you first. Your exact location is never shared—only approximate distance.
        </p>
        
        <div className="space-y-2.5 mb-6 text-sm text-[#eaeaf0]/60">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Location updated only when you matchmake</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Automatically deleted after 24 hours</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Never shared with other users (only distance)</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Can disable anytime in Settings</span>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onDeny}
            className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
          >
            No Thanks
          </button>
          <button
            onClick={onAllow}
            className="flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] transition-opacity hover:opacity-90"
          >
            Show Nearby
          </button>
        </div>
        
        <p className="mt-4 text-xs text-center text-[#eaeaf0]/40">
          By allowing, you consent to temporary location storage per our Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}

