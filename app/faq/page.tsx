'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Container } from '@/components/Container';
import Link from 'next/link';

interface FAQItem {
  question: string;
  answer: string;
  category: 'general' | 'account' | 'features' | 'safety' | 'technical';
}

const faqs: FAQItem[] = [
  // GENERAL
  {
    category: 'general',
    question: 'What is BUMPIN?',
    answer: 'BUMPIN is a 1-1 video social network where you meet new people through live video or text chat. No swiping, no profiles to curate - just authentic face-to-face connections with people nearby or around the world.'
  },
  {
    category: 'general',
    question: 'How does matchmaking work?',
    answer: "Open matchmaking to browse available users. When you find someone interesting, set your preferred call length (60-500 seconds) and send an invite. If they accept, you'll both be connected in a video or text room. The final duration is averaged between both users' preferences."
  },
  {
    category: 'general',
    question: 'What makes BUMPIN different from other apps?',
    answer: 'BUMPIN focuses on real-time authentic connection: (1) Live video/text calls only, (2) Timed conversations create natural endings, (3) No endless chatting before meeting, (4) Location-based matching shows nearby people, (5) 24-hour cooldown encourages diverse connections.'
  },
  
  // ACCOUNT
  {
    category: 'account',
    question: 'What are Guest vs Permanent accounts?',
    answer: 'Guest accounts are free, require no email, and last 7 days. Permanent accounts require email/password and last indefinitely. Both have full access after verification. You can upgrade guest to permanent anytime in Settings.'
  },
  {
    category: 'account',
    question: 'How do I verify my account?',
    answer: 'Three ways: (1) Pay $0.50 one-time fee via Stripe, (2) Use an invite code from a friend (4 uses), or (3) For USC students: Scan admin QR code + USC Campus Card barcode. Verification prevents bots and gives you your own invite codes to share.'
  },
  {
    category: 'account',
    question: 'How does USC Campus Card verification work?',
    answer: 'USC students can verify for free: (1) Scan an admin QR code at campus events, (2) Scan your USC Campus Card barcode using your phone camera, (3) Complete profile setup. You get a 7-day guest account. To make it permanent, add your @usc.edu email in Settings. Your USC card can only be used once.'
  },
  {
    category: 'account',
    question: 'What are invite codes and how do they work?',
    answer: 'After verification, you get your own invite code with 4 uses. Share it with friends to give them free access. Each code can be used 4 times, creating viral growth. Check Settings to see your code and QR code.'
  },
  {
    category: 'account',
    question: 'How do I delete my account?',
    answer: 'Go to Settings → Delete Account. This removes all your data from both local storage and the server. For guest accounts, data auto-deletes after 7 days of inactivity anyway.'
  },
  
  // FEATURES
  {
    category: 'features',
    question: 'What is Video Mode vs Text Mode?',
    answer: 'Video Mode: Face-to-face video calls with camera and audio (60-500 seconds, timed). Text Mode: Chat with text, images, and GIFs (unlimited duration, stays active as long as you\'re messaging). You can upgrade from text to video after 60 seconds.'
  },
  {
    category: 'features',
    question: 'What is the Torch Rule in text mode?',
    answer: "Text mode has unlimited duration but requires activity. If neither user sends a message for 2 minutes, you get a 60-second warning. Send any message to 'relight the torch' and continue. If the full 3 minutes of inactivity passes, the chat ends automatically."
  },
  {
    category: 'features',
    question: 'What is the 24-hour cooldown?',
    answer: "After completing a call with someone, you can't match with them again for 24 hours. This encourages meeting new people and prevents spam. The cooldown is automatic and applies to both video and text chats."
  },
  {
    category: 'features',
    question: 'How does location matching work?',
    answer: 'Opt-in only. If you enable location, people nearby appear first in matchmaking. Your exact location is never shared - only approximate distance (like "500 ft away" or "2 mi away"). Location data expires after 24 hours and you can disable it anytime.'
  },
  {
    category: 'features',
    question: 'What is the Intro/Wingperson feature?',
    answer: "See someone you think your friend would like? Click 'Introduce Friend' to generate a unique link. Share it with your friend. When they sign up, the person you introduced them to gets notified. It's a matchmaker feature!"
  },
  {
    category: 'features',
    question: 'Can I share my social media during a call?',
    answer: "Yes! Click the 'Share Socials' button during video or text chat. This shares the handles you've set up in your Socials page (Instagram, Snapchat, TikTok, Discord, phone number). Both users can exchange socials to continue the conversation off-platform."
  },
  
  // SAFETY
  {
    category: 'safety',
    question: 'How do you ensure safety on BUMPIN?',
    answer: 'Multiple layers: (1) Verification prevents bots, (2) Report system with auto-ban at 4+ reports, (3) Admins review all bans, (4) Permanent bans go on public blacklist, (5) 24-hour cooldown prevents harassment, (6) IP bans for serious violations.'
  },
  {
    category: 'safety',
    question: 'How do I report someone?',
    answer: 'After any call, click "Report & Block User". Provide a reason (optional). Admins see the full session data including chat messages. If a user gets 4+ reports from different people, they\'re auto-banned temporarily pending review.'
  },
  {
    category: 'safety',
    question: 'What happens if I\'m reported?',
    answer: 'One report = logged for review. 4+ reports = automatic temporary ban while admins investigate. They can either permanently ban you (goes on public blacklist) or vindicate you (ban lifted). Decisions are final.'
  },
  {
    category: 'safety',
    question: 'Can people record my video calls?',
    answer: 'We don\'t record calls, but technically anyone can screen record. It\'s illegal in many jurisdictions without consent. If someone records you without permission, report them immediately. We take this very seriously.'
  },
  {
    category: 'safety',
    question: 'Is my location data private?',
    answer: 'Yes. We only show approximate distance ("500 ft away"), never your exact coordinates. Location is rounded to ~100 meter precision and expires after 24 hours. You can disable it anytime in Settings.'
  },
  
  // TECHNICAL
  {
    category: 'technical',
    question: 'What do I need to use BUMPIN?',
    answer: 'Requirements: (1) Webcam and microphone for video mode, (2) Modern browser (Chrome, Safari, Firefox, Edge), (3) Decent internet connection (3+ Mbps for video), (4) Must be 18+ years old. Mobile browsers supported but desktop recommended for video.'
  },
  {
    category: 'technical',
    question: 'Why can\'t I connect to some video calls?',
    answer: 'Common reasons: (1) Firewall blocking WebRTC, (2) Poor internet connection, (3) One person denied camera/mic permission, (4) Mobile browser restrictions (iOS Safari needs app in foreground). Try refreshing or switching networks.'
  },
  {
    category: 'technical',
    question: 'What happens if I lose internet during a call?',
    answer: 'You have 10 seconds to reconnect automatically. The system tries 3 times to restore the connection. If you reconnect within the grace period, the call continues. After 10 seconds, the session ends and is saved to history.'
  },
  {
    category: 'technical',
    question: 'Why do I need to verify with $0.50 or an invite code?',
    answer: 'Verification prevents bots, spam, and abuse. $0.50 is a one-time payment (never recurring). Verified users get invite codes to share with 4 friends for free. This creates a trusted community while keeping costs minimal.'
  },
  {
    category: 'technical',
    question: 'Does BUMPIN work on mobile?',
    answer: 'Yes! Both iOS and Android browsers are supported. Video calls work best on desktop but are functional on mobile. Text mode works great on mobile. For best experience on mobile, add BUMPIN to your home screen.'
  },
  {
    category: 'technical',
    question: 'Where is my data stored?',
    answer: 'User data is stored in PostgreSQL (secure cloud database). Photos and videos are stored on Cloudinary CDN. Video calls are peer-to-peer (not recorded or stored). Text chat messages are saved to history. All data is encrypted in transit (HTTPS).'
  },
];

const categories = [
  { id: 'all', label: 'All Questions' },
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Account & Verification' },
  { id: 'features', label: 'Features' },
  { id: 'safety', label: 'Safety & Privacy' },
  { id: 'technical', label: 'Technical' },
];

export default function FAQPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <main className="min-h-screen bg-[#0a0a0c] py-20">
      <Container>
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-12 text-center">
            <Link 
              href="/"
              className="inline-block mb-6 text-sm text-[#ffc46a] hover:underline"
            >
              ← Back to Home
            </Link>
            <h1 className="font-playfair text-4xl sm:text-5xl font-bold text-[#eaeaf0] mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-[#eaeaf0]/70">
              Everything you need to know about BUMPIN
            </p>
          </div>

          {/* Search */}
          <div className="mb-8">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full rounded-xl bg-white/10 px-6 py-4 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
            />
          </div>

          {/* Category Filters */}
          <div className="mb-8 flex flex-wrap gap-3">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-[#ffc46a] text-[#0a0a0c]'
                    : 'bg-white/10 text-[#eaeaf0] hover:bg-white/20'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* FAQ List */}
          <div className="space-y-4">
            {filteredFAQs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#eaeaf0]/70">No questions found matching &ldquo;{searchQuery}&rdquo;</p>
              </div>
            ) : (
              filteredFAQs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-xl bg-white/5 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/10 transition-colors"
                  >
                    <span className="font-medium text-[#eaeaf0] pr-4">{faq.question}</span>
                    <svg
                      className={`w-5 h-5 text-[#ffc46a] flex-shrink-0 transition-transform ${
                        expandedIndex === index ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <AnimatePresence>
                    {expandedIndex === index && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-4 pt-2">
                          <p className="text-[#eaeaf0]/80 leading-relaxed">{faq.answer}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </div>

          {/* Still Have Questions? */}
          <div className="mt-16 rounded-2xl bg-gradient-to-br from-[#ffc46a]/10 to-[#ff7b4b]/10 border border-[#ffc46a]/30 p-8 text-center">
            <h2 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-3">
              Still have questions?
            </h2>
            <p className="text-[#eaeaf0]/70 mb-6">
              Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
            </p>
            <a
              href="mailto:everything@napalmsky.com"
              className="inline-block rounded-xl bg-[#ffc46a] px-8 py-3 font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity"
            >
              Contact Support
            </a>
          </div>

          {/* Related Links */}
          <div className="mt-12 flex flex-wrap gap-4 justify-center text-sm">
            <Link href="/terms-of-service" className="text-[#eaeaf0]/50 hover:text-[#ffc46a] transition-colors">
              Terms of Service
            </Link>
            <span className="text-[#eaeaf0]/30">•</span>
            <Link href="/privacy-policy" className="text-[#eaeaf0]/50 hover:text-[#ffc46a] transition-colors">
              Privacy Policy
            </Link>
            <span className="text-[#eaeaf0]/30">•</span>
            <Link href="/community-guidelines" className="text-[#eaeaf0]/50 hover:text-[#ffc46a] transition-colors">
              Community Guidelines
            </Link>
            <span className="text-[#eaeaf0]/30">•</span>
            <Link href="/blacklist" className="text-[#eaeaf0]/50 hover:text-red-400 transition-colors">
              Blacklist
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}

