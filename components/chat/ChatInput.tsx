'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onSendFile?: () => void;
  onSendGIF?: () => void;
  onTyping?: () => void; // Typing indicator callback
  disabled?: boolean;
  rateLimited?: boolean;
  cooldownRemaining?: number; // Seconds until can send next message
}

export function ChatInput({ 
  onSendMessage, 
  onSendFile, 
  onSendGIF,
  onTyping,
  disabled = false,
  rateLimited = false,
  cooldownRemaining = 0 
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  const handleSend = () => {
    if (!message.trim() || disabled || rateLimited) return;
    
    onSendMessage(message.trim());
    setMessage('');
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-2">
      {/* Rate Limit Warning */}
      <AnimatePresence>
        {rateLimited && cooldownRemaining > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-2 rounded-lg bg-orange-500/10 border border-orange-500/30 px-3 py-2"
          >
            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-orange-300">
              Please wait {cooldownRemaining}s to send next message
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Bar */}
      <div className="flex items-center gap-2">
        {/* File Upload Button */}
        {onSendFile && (
          <button
            onClick={onSendFile}
            disabled={disabled || rateLimited}
            className="flex-shrink-0 p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send file"
          >
            <svg className="w-5 h-5 text-[#eaeaf0]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
        )}

        {/* GIF Button */}
        {onSendGIF && (
          <button
            onClick={onSendGIF}
            disabled={disabled || rateLimited}
            className="flex-shrink-0 p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send GIF"
          >
            <span className="text-sm font-bold text-[#eaeaf0]">GIF</span>
          </button>
        )}

        {/* Text Input */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              
              // Emit typing event (throttled to once per 2 seconds)
              if (onTyping && e.target.value.length > 0) {
                const now = Date.now();
                if (now - lastTypingEmitRef.current > 2000) {
                  onTyping();
                  lastTypingEmitRef.current = now;
                }
              }
            }}
            onKeyPress={handleKeyPress}
            disabled={disabled || rateLimited}
            placeholder="Message..."
            maxLength={500}
            className="w-full rounded-full bg-white/10 px-4 py-2.5 text-sm text-[#eaeaf0] placeholder-[#eaeaf0]/40 focus:outline-none focus:ring-2 focus:ring-[#fcf290] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          
          {/* Character Count (when approaching limit) */}
          {message.length > 400 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#eaeaf0]/40">
              {message.length}/500
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled || rateLimited}
          className="flex-shrink-0 p-2.5 rounded-full bg-[#fcf290] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <svg className="w-5 h-5 text-[#0a0a0c]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      {/* Hint text */}
      <p className="text-xs text-center text-[#eaeaf0]/30">
        {message.length > 0 ? `${message.length}/500 characters` : 'Press Enter to send'}
      </p>
    </div>
  );
}

