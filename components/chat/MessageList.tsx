'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';

interface Message {
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
}

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  partnerName: string;
  onMessageRead?: (messageId: string) => void;
}

export function MessageList({ messages, currentUserId, partnerName, onMessageRead }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  
  // Mark messages as read when they come into view
  useEffect(() => {
    if (!onMessageRead) return;
    
    // Mark unread messages as read
    const unreadMessages = messages.filter(
      m => !m.readAt && m.from !== currentUserId
    );
    
    if (unreadMessages.length > 0) {
      unreadMessages.forEach(m => onMessageRead(m.messageId));
    }
  }, [messages, currentUserId, onMessageRead]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-6xl mb-4">💬</div>
        <h3 className="text-lg font-medium text-[#eaeaf0] mb-2">
          Start the conversation
        </h3>
        <p className="text-sm text-[#eaeaf0]/60">
          Send a message to {partnerName}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-1"
      style={{
        scrollBehavior: 'smooth',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Messages */}
      {messages.map((message, index) => {
        const isOwn = message.from === currentUserId;
        const showSender = true; // Always show in 1-on-1 (would be conditional in group chat)
        
        return (
          <MessageBubble
            key={message.messageId}
            message={message}
            isOwn={isOwn}
            showSender={showSender}
          />
        );
      })}
      
      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}

