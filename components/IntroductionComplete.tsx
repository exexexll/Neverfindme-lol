'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface IntroductionCompleteProps {
  targetUser: {
    userId: string;
    name: string;
    gender: string;
    selfieUrl?: string;
    videoUrl?: string;
  };
  introducedBy: string;
  isTargetOnline: boolean;
  referralCode: string;
  onCallNow: () => void;
  onSkip: () => void;
}

export default function IntroductionComplete({
  targetUser,
  introducedBy,
  isTargetOnline,
  referralCode,
  onCallNow,
  onSkip,
}: IntroductionCompleteProps) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0c] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl space-y-6 rounded-2xl bg-white/5 p-8 shadow-2xl border border-white/10"
      >
        {/* Header */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="mb-4 inline-flex items-center justify-center rounded-full bg-green-500/20 p-6"
          >
            <span className="text-5xl">🎉</span>
          </motion.div>
          
          <h1 className="mb-3 font-playfair text-4xl font-bold text-[#eaeaf0]">
            Welcome to BUMPIn!
          </h1>
          
          <p className="text-lg text-[#eaeaf0]/80">
            You were introduced to someone special...
          </p>
        </div>

        {/* Target User Preview */}
        <div className="rounded-xl bg-white/5 p-6 border border-white/10">
          <div className="flex items-center gap-4 mb-4">
            {targetUser.selfieUrl ? (
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-4 border-[#fcf290]/30">
                <Image
                  src={targetUser.selfieUrl}
                  alt={targetUser.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-20 w-20 flex-shrink-0 rounded-full bg-white/10 flex items-center justify-center text-4xl border-4 border-white/30">
                👤
              </div>
            )}
            
            <div className="flex-1">
              <h2 className="font-playfair text-3xl font-bold text-[#eaeaf0]">
                {targetUser.name}
              </h2>
              <p className="text-[#eaeaf0]/70 capitalize">
                {targetUser.gender}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${isTargetOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                <span className={`text-sm ${isTargetOnline ? 'text-green-300' : 'text-gray-400'}`}>
                  {isTargetOnline ? 'Online now' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {targetUser.videoUrl && (
            <div className="mt-4 rounded-lg overflow-hidden">
              <video
                src={targetUser.videoUrl}
                loop
                muted
                autoPlay
                playsInline
                className="w-full rounded-lg"
              />
            </div>
          )}
          
          <div className="mt-4 rounded-lg bg-blue-500/10 px-4 py-3 border border-blue-500/30">
            <p className="text-sm text-blue-200">
              👥 Introduced by <span className="font-bold">{introducedBy}</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {isTargetOnline ? (
            <>
              <button
                onClick={onCallNow}
                className="focus-ring w-full rounded-xl bg-[#fcf290] px-6 py-4 font-medium text-[#0a0a0c] text-lg shadow-sm transition-opacity hover:opacity-90"
              >
                📞 Call {targetUser.name} Now
              </button>
              <p className="text-center text-xs text-[#eaeaf0]/50">
                {targetUser.name} is online and ready to chat!
              </p>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-orange-500/10 px-6 py-4 border border-orange-500/30 text-center">
                <p className="font-medium text-orange-300">
                  {targetUser.name} is not online right now
                </p>
                <p className="mt-2 text-sm text-[#eaeaf0]/70">
                  You can find them later in matchmaking or use your intro code: <span className="font-mono text-[#fcf290]">{referralCode}</span>
                </p>
              </div>
            </>
          )}
          
          <button
            onClick={onSkip}
            className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
          >
            {isTargetOnline ? 'Maybe Later' : 'Continue to Dashboard'}
          </button>
        </div>

        {/* Info */}
        <div className="rounded-lg bg-white/5 p-4">
          <p className="text-xs text-[#eaeaf0]/50 leading-relaxed">
            💡 <strong>Tip:</strong> You can use your intro code <span className="font-mono text-[#fcf290]">{referralCode}</span> on the main page anytime to directly match with {targetUser.name}.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

