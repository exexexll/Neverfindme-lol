'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface USCCardScannerProps {
  onSuccess: (uscId: string, rawValue: string) => void;
  onSkipToEmail: () => void;
}

type ScanState = 'initializing' | 'scanning' | 'processing' | 'success' | 'error';

/**
 * USC Campus Card Barcode Scanner
 * Uses Quagga2 with Codabar support (similar to Inlite TBR Code 103)
 * Scans Codabar barcode on back of USC card
 * Format: 14 digits (10-digit USC ID + 4-digit card number)
 * 
 * Reference: https://how-to.inliteresearch.com/barcode-reading-howto/tbr/
 * Using similar algorithm to Inlite's Online Barcode Reader (TBR 103)
 */
export function USCCardScanner({ onSuccess, onSkipToEmail }: USCCardScannerProps) {
  const [scanState, setScanState] = useState<ScanState>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [consecutiveReads, setConsecutiveReads] = useState<string[]>([]);
  const [detectedUSCId, setDetectedUSCId] = useState<string | null>(null); // Show confirmation
  const processingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // SECURITY: Prevent bypassing scanner with back button
    const preventBack = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      alert('Please complete USC card verification before going back.');
    };
    
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', preventBack);
    
    const initScanner = async () => {
      try {
        setScanState('initializing');
        
        // CRITICAL: Dynamic import for Next.js compatibility
        const Quagga = (await import('@ericblade/quagga2')).default;
        
        console.log('[Quagga] Loaded dynamically');
        
        // Initialize Quagga2 with Codabar support
        await Quagga.init({
          inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: document.querySelector('#usc-scanner-reader') as HTMLElement,
            constraints: {
              width: { min: 640, ideal: 1920 },
              height: { min: 480, ideal: 1080 },
              facingMode: 'environment', // Back camera
              aspectRatio: { ideal: 16/9 },
            },
            area: { // Scan area (90% x 70% - large area for easy scanning)
              top: '15%',
              right: '5%',
              left: '5%',
              bottom: '15%',
            },
          },
          decoder: {
            readers: [
              'codabar_reader',    // PRIMARY: USC cards use Codabar
              'code_128_reader',   // Fallback
              'code_39_reader',    // Fallback
            ],
            multiple: false, // Only one barcode needed
            debug: {
              drawBoundingBox: true, // Visual feedback
              showFrequency: false,
              drawScanline: true, // Show scan line for user feedback
              showPattern: false,
            },
          },
          locate: true, // Auto-locate barcodes
          locator: {
            patchSize: 'large', // Better detection for various sizes
            halfSample: false, // Better quality (slower but more accurate)
          },
          frequency: 5, // 5 scans per second (better accuracy than 10)
        }, (err) => {
          if (err) {
            console.error('[Quagga] Init error:', err);
            setError(err.message || 'Failed to initialize scanner');
            setScanState('error');
            return;
          }

          if (!mountedRef.current) return;

          console.log('[Quagga] ✅ Initialized successfully');
          
          // Start scanning
          Quagga.start();
          setScanState('scanning');
          console.log('[Quagga] 📷 Scanner started - Codabar mode active');
        });

        // Set up detection handler
        Quagga.onDetected(handleDetected);

        // Timeout after 2 minutes
        timeoutRef.current = setTimeout(async () => {
          if (mountedRef.current && scanState !== 'success') {
            setError('Scan timeout. Please try again or use email verification.');
            setScanState('error');
            const Quagga = (await import('@ericblade/quagga2')).default;
            Quagga.stop();
          }
        }, 120000);

      } catch (err: any) {
        console.error('[Quagga] Setup error:', err);
        setError(err.message || 'Failed to start camera');
        setScanState('error');
      }
    };

    initScanner();

    return () => {
      mountedRef.current = false;
      
      // Cleanup with dynamic import
      import('@ericblade/quagga2').then(({ default: Quagga }) => {
        Quagga.stop();
        Quagga.offDetected(handleDetected);
      }).catch(() => {});
      
      window.removeEventListener('popstate', preventBack);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDetected = async (result: any) => {
    if (processingRef.current || !mountedRef.current) {
      return;
    }

    const code = result.codeResult.code;
    const format = result.codeResult.format;
    
    console.log('[Quagga] Detected:', format, 'Code:', code);

    // Multi-read validation
    setConsecutiveReads((prev) => {
      const newReads = [...prev, code].slice(-3);
      
      if (newReads.length === 3 && newReads.every(r => r === newReads[0])) {
        console.log('[Quagga] ✅ Confirmed after 3 identical reads');
        processingRef.current = true;
        processConfirmedScan(code);
        return [];
      }
      
      return newReads;
    });
  };

  const processConfirmedScan = async (rawValue: string) => {
    setScanState('processing');
    
    // Stop scanner immediately
    const Quagga = (await import('@ericblade/quagga2')).default;
    Quagga.stop();
    
    // Extract USC ID
    const uscId = extractUSCId(rawValue);
    
    if (!uscId) {
      setError('Invalid barcode. Please scan the barcode on the back of your USC card.');
      setScanState('error');
      setConsecutiveReads([]);
      processingRef.current = false;
      
      // Restart after 2 seconds
      setTimeout(async () => {
        if (mountedRef.current) {
          const Quagga = (await import('@ericblade/quagga2')).default;
          setScanState('initializing');
          setError(null);
          Quagga.start();
          setScanState('scanning');
        }
      }, 2000);
      return;
    }

    // Validate format
    if (!/^[0-9]{10}$/.test(uscId)) {
      setError('Invalid USC ID format. Please try again.');
      setScanState('error');
      setConsecutiveReads([]);
      processingRef.current = false;
      
      setTimeout(async () => {
        if (mountedRef.current) {
          const Quagga = (await import('@ericblade/quagga2')).default;
          setScanState('initializing');
          setError(null);
          Quagga.start();
          setScanState('scanning');
        }
      }, 2000);
      return;
    }

    // Success!
    setScanState('success');
    setDetectedUSCId(uscId); // Show confirmation
    console.log('[Quagga] ✅ Valid USC ID: ******' + uscId.slice(-4));
    
    setTimeout(() => {
      if (mountedRef.current) {
        onSuccess(uscId, rawValue);
      }
    }, 1500);
  };

  // Extract USC ID from Codabar barcode
  // USC format: 12683060215156 (14 digits) = 1268306021 (USC ID) + 5156 (card#)
  // Verified using Inlite Online Barcode Reader
  const extractUSCId = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, '');
    
    // 14 digits: USC card (ID + card number)
    if (digits.length === 14) {
      return digits.substring(0, 10);
    }
    
    // 10 digits: Pure USC ID
    if (digits.length === 10) {
      return digits;
    }
    
    // Find first 10-digit sequence
    const match = digits.match(/(\d{10})/);
    return match ? match[1] : null;
  };

  return (
    <main id="main" className="min-h-screen bg-[#0a0a0c] flex flex-col">
      {/* Header */}
      <div className="p-6 text-center">
        <h1 className="font-playfair text-3xl sm:text-4xl font-bold text-[#eaeaf0] mb-2">
          Scan Your USC Campus Card
        </h1>
        <p className="text-[#eaeaf0]/70 text-base sm:text-lg">
          Hold the back of your card in view - scanner detects automatically
        </p>
      </div>

      {/* Scanner - Responsive on mobile and desktop */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div 
            id="usc-scanner-reader" 
            className="rounded-2xl overflow-hidden shadow-2xl bg-black relative"
            style={{ 
              width: '100%',
              aspectRatio: '16/9', // Maintain ratio on all devices
              maxHeight: '70vh', // Don't exceed viewport height
            }}
          >
            {/* Quagga2 will inject video and canvas here */}
          </div>
        </div>
      </div>

      {/* Status & Tips */}
      <div className="p-6 bg-white/5 border-t border-white/10">
        {/* Status */}
        <div className="mb-4 text-center">
          <AnimatePresence mode="wait">
            {scanState === 'initializing' && (
              <motion.div
                key="init"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[#eaeaf0]/70"
              >
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#ffc46a] border-t-transparent mr-2" />
                Initializing camera...
              </motion.div>
            )}

            {scanState === 'scanning' && (
              <motion.div
                key="scan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-white"
              >
                <span className="text-2xl mr-2">📷</span>
                Scanning Codabar... {consecutiveReads.length > 0 && `(${consecutiveReads.length}/3 reads)`}
              </motion.div>
            )}

            {scanState === 'processing' && (
              <motion.div
                key="proc"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-yellow-300"
              >
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent mr-2" />
                Verifying USC ID...
              </motion.div>
            )}

            {scanState === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-green-400"
              >
                <div className="text-3xl mb-2">✅</div>
                <div className="text-xl font-bold">USC Card Verified!</div>
                {detectedUSCId && (
                  <div className="text-sm mt-2 font-mono">
                    USC ID: ******{detectedUSCId.slice(-4)}
                  </div>
                )}
                <div className="text-xs mt-2 opacity-70">Proceeding to registration...</div>
              </motion.div>
            )}

            {scanState === 'error' && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-red-400"
              >
                <span className="text-2xl mr-2">⚠️</span>
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tips */}
        <div className="rounded-xl bg-white/5 p-4 border border-white/10">
          <p className="text-[#eaeaf0]/60 text-sm text-center mb-3">
            💡 <strong>Scanning Tips:</strong>
          </p>
          <ul className="text-[#eaeaf0]/50 text-xs space-y-1">
            <li>• <strong>Bright lighting</strong> - Use desk lamp or natural light</li>
            <li>• <strong>Hold steady</strong> - 8-10 inches from camera</li>
            <li>• <strong>Barcode on back</strong> - Flip card to back side</li>
            <li>• <strong>Horizontal alignment</strong> - Black lines should be horizontal</li>
            <li>• <strong>Wait 2-3 seconds</strong> - Scanner reads automatically</li>
          </ul>
        </div>

        {/* Fallback Option */}
        <button
          onClick={onSkipToEmail}
          className="mt-4 w-full py-3 rounded-xl bg-white/10 text-[#eaeaf0] hover:bg-white/20 transition-all text-sm"
        >
          Skip - Use Email Verification Instead
        </button>
      </div>
    </main>
  );
}
