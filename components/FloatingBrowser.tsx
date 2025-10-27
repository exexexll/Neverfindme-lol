'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FloatingBrowserProps {
  isOpen: boolean;
  url: string;
  onClose: () => void;
}

/**
 * Instagram-style Floating In-App Browser
 * Opens external links in overlay without leaving the app
 * Full functionality: navigation, refresh, URL bar, mobile gestures
 */
export function FloatingBrowser({ isOpen, url, onClose }: FloatingBrowserProps) {
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startYRef = useRef(0);

  // Update URL when prop changes
  useEffect(() => {
    if (url !== currentUrl) {
      setCurrentUrl(url);
      setLoading(true);
      setError(null);
    }
  }, [url, currentUrl]);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
    
    // Try to get iframe URL (may fail due to CORS)
    try {
      if (iframeRef.current?.contentWindow?.location.href) {
        setCurrentUrl(iframeRef.current.contentWindow.location.href);
      }
    } catch (e) {
      // CORS blocks this - that's OK
    }
  };

  const handleError = () => {
    setError('This site cannot be displayed in the browser. Some sites block embedding for security.');
    setLoading(false);
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      setLoading(true);
      setError(null);
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleBack = () => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch (e) {
      console.warn('Cannot go back (CORS)');
    }
  };

  const handleForward = () => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch (e) {
      console.warn('Cannot go forward (CORS)');
    }
  };

  const handleOpenExternal = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  // Mobile swipe-to-close
  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - startYRef.current;
    // Swipe down > 100px to close
    if (deltaY > 100) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute inset-x-0 bottom-0 top-16 md:inset-x-20 md:top-20 md:bottom-20 bg-white rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Swipe Handle (Mobile) */}
          <div className="md:hidden flex justify-center py-2 bg-gray-100">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
          </div>

          {/* Browser Header */}
          <div className="bg-gray-100 border-b border-gray-300 p-3 flex items-center gap-2 flex-shrink-0">
            {/* Navigation Buttons */}
            <div className="flex gap-1">
              <button
                onClick={handleBack}
                disabled={!canGoBack}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30"
                aria-label="Go back"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                onClick={handleForward}
                disabled={!canGoForward}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30"
                aria-label="Go forward"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                aria-label="Refresh"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* URL Bar */}
            <div className="flex-1 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 truncate border border-gray-300 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="truncate">{currentUrl}</span>
            </div>

            {/* Open External */}
            <button
              onClick={handleOpenExternal}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors hidden md:block"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              aria-label="Close browser"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Browser Content */}
          <div className="relative flex-1 bg-white">
            {loading && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-[#ffc46a] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-600 font-medium">Loading...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <div className="text-center max-w-md px-6">
                  <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-red-600 mb-4 font-medium">{error}</p>
                  <div className="flex gap-3 justify-center">
                    <button 
                      onClick={handleRefresh} 
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Try again
                    </button>
                    <button 
                      onClick={handleOpenExternal} 
                      className="px-4 py-2 bg-[#ffc46a] hover:opacity-90 rounded-lg text-sm font-medium text-[#0a0a0c] transition-opacity"
                    >
                      Open in new tab
                    </button>
                  </div>
                </div>
              </div>
            )}

            <iframe
              ref={iframeRef}
              src={currentUrl}
              className="w-full h-full border-none"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
              onLoad={handleLoad}
              onError={handleError}
              title="In-app browser"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

