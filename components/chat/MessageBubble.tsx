'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface MessageBubbleProps {
  message: {
    messageId: string;
    from: string;
    fromName: string;
    fromSelfie?: string;
    messageType: 'text' | 'image' | 'file' | 'gif' | 'system';
    content?: string;
    fileUrl?: string;
    fileName?: string;
    gifUrl?: string;
    timestamp: Date;
    readAt?: Date;
  };
  isOwn: boolean; // Is this message from current user?
  showSender?: boolean; // Show sender info (for group chats, always true for 1-on-1)
}

export function MessageBubble({ message, isOwn, showSender = true }: MessageBubbleProps) {
  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // System message (center-aligned, no bubble)
  if (message.messageType === 'system') {
    return (
      <div className="flex justify-center my-4">
        <div className="rounded-full bg-white/10 px-4 py-1.5">
          <p className="text-xs text-[#eaeaf0]/70">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 mb-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      {/* Sender Avatar (left side, only for received messages) */}
      {!isOwn && showSender && message.fromSelfie && (
        <div className="flex-shrink-0">
          <Image
            src={message.fromSelfie}
            alt={message.fromName}
            width={32}
            height={32}
            className="rounded-full"
          />
        </div>
      )}

      {/* Message Content */}
      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[70%]`}>
        {/* Sender Name (only for received messages) */}
        {!isOwn && showSender && (
          <p className="text-xs text-[#eaeaf0]/50 mb-1 ml-1">{message.fromName}</p>
        )}

        {/* Message Bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isOwn
              ? 'bg-[#fcf290] text-[#0a0a0c]'
              : 'bg-white/10 text-[#eaeaf0]'
          } ${isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        >
          {/* Text Message */}
          {message.messageType === 'text' && (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          )}

          {/* Image Message */}
          {message.messageType === 'image' && message.fileUrl && (
            <div className="space-y-2">
              {message.content && (
                <p className="text-sm whitespace-pre-wrap break-words mb-2">{message.content}</p>
              )}
              <div className="relative w-full max-w-sm rounded-lg overflow-hidden">
                <Image
                  src={message.fileUrl}
                  alt="Shared image"
                  width={300}
                  height={300}
                  className="object-cover"
                />
              </div>
            </div>
          )}

          {/* File Message */}
          {message.messageType === 'file' && message.fileUrl && (
            <a
              href={message.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <div className="text-sm">
                <p className="font-medium">{message.fileName || 'File'}</p>
                <p className="text-xs opacity-70">Click to download</p>
              </div>
            </a>
          )}

          {/* GIF Message */}
          {message.messageType === 'gif' && message.gifUrl && (
            <div className="space-y-2">
              {message.content && (
                <p className="text-sm whitespace-pre-wrap break-words mb-2">{message.content}</p>
              )}
              <div className="rounded-lg overflow-hidden max-w-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.gifUrl}
                  alt="GIF"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )}
        </div>

        {/* Timestamp + Read Receipt */}
        <div className="flex items-center gap-1.5 mt-1 ml-1">
          <p className="text-xs text-[#eaeaf0]/40">
            {formatTime(message.timestamp)}
          </p>
          {isOwn && message.readAt && (
            <svg className="w-3 h-3 text-[#fcf290]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>

      {/* Spacer for sent messages (right alignment) */}
      {isOwn && showSender && <div className="w-8" />}
    </motion.div>
  );
}

