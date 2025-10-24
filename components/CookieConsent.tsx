'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const consent = localStorage.getItem('bumpin_cookie_consent');
    if (!consent) {
      // Show banner after a short delay
      setTimeout(() => setShowBanner(true), 1000);
    }
  }, []);

  const acceptAll = () => {
    localStorage.setItem('bumpin_cookie_consent', 'all');
    setShowBanner(false);
    console.log('[Cookies] User accepted all cookies');
  };

  const acceptEssential = () => {
    localStorage.setItem('bumpin_cookie_consent', 'essential');
    setShowBanner(false);
    console.log('[Cookies] User accepted essential cookies only');
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
        >
          <div className="max-w-6xl mx-auto">
            <div className="bg-[#0a0a0c]/95 backdrop-blur-lg border border-[#fcf290]/30 rounded-2xl shadow-2xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Cookie Icon */}
                <div className="text-4xl">🍪</div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[#eaeaf0] mb-2">
                    Cookie Consent
                  </h3>
                  <p className="text-sm text-[#eaeaf0]/80 mb-2">
                    We use cookies to provide essential functionality (keeping you logged in) 
                    and to analyze usage to improve our platform.
                  </p>
                  <Link 
                    href="/cookie-policy" 
                    className="text-sm text-[#fcf290] hover:underline"
                    target="_blank"
                  >
                    Learn more about our cookie policy →
                  </Link>
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <button
                    onClick={acceptEssential}
                    className="px-6 py-2 rounded-xl bg-white/10 text-[#eaeaf0] 
                             hover:bg-white/20 transition-all text-sm font-medium
                             border border-white/20"
                  >
                    Essential Only
                  </button>
                  <button
                    onClick={acceptAll}
                    className="px-6 py-2 rounded-xl bg-[#fcf290] text-[#0a0a0c] 
                             hover:opacity-90 transition-all text-sm font-medium
                             shadow-lg shadow-[#fcf290]/20"
                  >
                    Accept All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

