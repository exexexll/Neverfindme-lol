'use client';

import { motion } from 'framer-motion';

interface RecordingConsentModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function RecordingConsentModal({ onAccept, onDecline }: RecordingConsentModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-[#1a1a1c] to-[#0a0a0c] rounded-2xl p-8 max-w-lg w-full border border-red-500/30 shadow-2xl"
      >
        {/* Recording Icon */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75" />
            <div className="relative w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="3" />
              </svg>
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-playfair text-2xl font-bold text-white text-center mb-4">
          Call Recording Notice
        </h2>

        {/* Notice */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-[#eaeaf0] text-center font-medium">
            This call will be recorded for safety and moderation purposes
          </p>
        </div>

        {/* Details */}
        <ul className="space-y-3 mb-6 text-sm text-[#eaeaf0]/80">
          <li className="flex items-start gap-2">
            <span className="text-[#ffc46a] mt-0.5">•</span>
            <span>Recordings are <strong>only saved if a user is reported</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#ffc46a] mt-0.5">•</span>
            <span>If the call ends normally, the recording is <strong>deleted immediately</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#ffc46a] mt-0.5">•</span>
            <span>Stored securely for up to <strong>90 days</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#ffc46a] mt-0.5">•</span>
            <span>Viewable <strong>only by moderators</strong> during report review</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#ffc46a] mt-0.5">•</span>
            <span>Helps protect all users from harassment and abuse</span>
          </li>
        </ul>

        {/* Legal Notice */}
        <p className="text-xs text-[#eaeaf0]/50 text-center mb-6">
          By continuing, you consent to this call being recorded. California law requires all parties to consent to recording.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-colors"
          >
            Decline (Return)
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity"
          >
            I Consent
          </button>
        </div>

        {/* Info Link */}
        <div className="mt-4 text-center">
          <a 
            href="/privacy-policy#recording" 
            target="_blank"
            className="text-xs text-[#ffc46a] hover:underline"
          >
            Learn more about our recording policy
          </a>
        </div>
      </motion.div>
    </div>
  );
}

