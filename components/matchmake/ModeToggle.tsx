'use client';

import { motion } from 'framer-motion';

interface ModeToggleProps {
  mode: 'video' | 'text';
  onChange: (mode: 'video' | 'text') => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/5 p-1 border border-white/10">
      {/* Video Mode */}
      <button
        onClick={() => onChange('video')}
        className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all ${
          mode === 'video'
            ? 'text-[#0a0a0c]'
            : 'text-[#eaeaf0] hover:text-white'
        }`}
      >
        {mode === 'video' && (
          <motion.div
            layoutId="mode-indicator"
            className="absolute inset-0 bg-[#ff9b6b] rounded-full"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Video
        </span>
      </button>

      {/* Text Mode */}
      <button
        onClick={() => onChange('text')}
        className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all ${
          mode === 'text'
            ? 'text-[#0a0a0c]'
            : 'text-[#eaeaf0] hover:text-white'
        }`}
      >
        {mode === 'text' && (
          <motion.div
            layoutId="mode-indicator"
            className="absolute inset-0 bg-[#ff9b6b] rounded-full"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Text
        </span>
      </button>
    </div>
  );
}

