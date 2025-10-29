'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface USCCardScannerProps {
  onSuccess: (uscId: string, rawValue: string) => void;
  onSkipToEmail: () => void;
}

type ScanState = 'initializing' | 'scanning' | 'processing' | 'success' | 'error';

/**
 * USC Campus Card Barcode Scanner
 * Scans Codabar barcode on back of USC card
 * Format: 14 digits (10-digit USC ID + 4-digit card number)
 */
export function USCCardScanner({ onSuccess, onSkipToEmail }: USCCardScannerProps) {
  const [scanState, setScanState] = useState<ScanState>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [consecutiveReads, setConsecutiveReads] = useState<string[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false); // Prevent duplicate processing
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const initScanner = async () => {
      if (!mounted) return;
      await startScanner();
      
      // OPTIMIZATION: Timeout after 2 minutes of no success
      if (mounted) {
        timeoutRef.current = setTimeout(() => {
          if (scanState !== 'success' && scanState !== 'processing') {
            setError('Scan timeout. Please try again or use email verification.');
            setScanState('error');
            stopScanner();
          }
        }, 120000); // 2 minutes
      }
    };
    
    initScanner();
    
    return () => {
      mounted = false;
      stopScanner();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const startScanner = async () => {
    try {
      setScanState('initializing');
      
      const scanner = new Html5Qrcode('usc-scanner-reader');
      scannerRef.current = scanner;

      const config = {
        fps: 10, // Scan 10 times per second for faster detection
        qrbox: function(viewfinderWidth: number, viewfinderHeight: number) {
          // Use 90% of viewfinder for scanning (much larger area)
          // This allows card to be anywhere in frame, not just a small box
          const boxWidth = Math.floor(viewfinderWidth * 0.9);
          const boxHeight = Math.floor(viewfinderHeight * 0.7);
          return { width: boxWidth, height: boxHeight };
        },
        aspectRatio: 1.777778, // 16:9
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODABAR,      // USC CARD FORMAT
          Html5QrcodeSupportedFormats.CODE_128,     // Fallback
          Html5QrcodeSupportedFormats.CODE_39,      // Fallback
          Html5QrcodeSupportedFormats.ITF,          // Fallback
        ],
      };

      await scanner.start(
        { facingMode: 'environment' }, // Back camera
        config,
        handleScanSuccess,
        handleScanError
      );

      setScanState('scanning');
      console.log('[USCScanner] ✅ Scanner started');
    } catch (err: any) {
      console.error('[USCScanner] Failed to start:', err);
      setError(err.message || 'Failed to start camera');
      setScanState('error');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        console.log('[USCScanner] Stopped');
      } catch (err) {
        console.error('[USCScanner] Error stopping:', err);
      }
    }
  };

  const handleScanSuccess = (decodedText: string, decodedResult: any) => {
    // CRITICAL: Prevent processing if already processing
    if (processingRef.current) {
      console.log('[USCScanner] Already processing, ignoring scan');
      return;
    }
    
    console.log('[USCScanner] Detected barcode');

    // Multi-read validation (require 3 consecutive identical reads)
    setConsecutiveReads((prev) => {
      const newReads = [...prev, decodedText].slice(-3);
      
      // Check if all 3 match
      if (newReads.length === 3 && newReads.every(r => r === newReads[0])) {
        console.log('[USCScanner] ✅ Confirmed after 3 reads');
        processingRef.current = true; // Lock processing
        processConfirmedScan(decodedText);
        return [];
      }
      
      return newReads;
    });
  };

  const handleScanError = (errorMessage: string) => {
    // Ignore NotFoundException (normal when no barcode in view)
    if (!errorMessage.includes('NotFoundException')) {
      console.warn('[USCScanner] Error:', errorMessage);
    }
  };

  const processConfirmedScan = async (rawValue: string) => {
    setScanState('processing');
    
    // CRITICAL: Stop scanner immediately to prevent duplicate processing
    await stopScanner();
    
    // Extract USC ID from 14-digit barcode
    const uscId = extractUSCId(rawValue);
    
    if (!uscId) {
      setError('Invalid barcode. Please try again.');
      setScanState('error');
      setConsecutiveReads([]);
      processingRef.current = false; // CRITICAL: Reset lock
      // Restart scanner after 2 seconds
      setTimeout(() => {
        setScanState('initializing');
        setError(null);
        startScanner();
      }, 2000);
      return;
    }
    
    // Validate USC ID format
    if (!/^[0-9]{10}$/.test(uscId)) {
      setError('Invalid USC ID format. Please scan the barcode on the back of your card.');
      setScanState('error');
      setConsecutiveReads([]);
      processingRef.current = false; // CRITICAL: Reset lock
      // Restart scanner after 2 seconds
      setTimeout(() => {
        setScanState('initializing');
        setError(null);
        startScanner();
      }, 2000);
      return;
    }
    
    // Success!
    setScanState('success');
    console.log('[USCScanner] ✅ Valid USC ID: ******' + uscId.slice(-4)); // Redacted for privacy
    
    // Small delay for success animation, then callback
    setTimeout(() => {
      onSuccess(uscId, rawValue);
    }, 1500);
  };

  // Extract USC ID from barcode
  // USC format: 12683060215156 (14 digits) = 1268306021 (USC ID) + 5156 (card#)
  const extractUSCId = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, '');
    
    // 14 digits: USC ID + card number
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

      {/* Scanner */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-2xl">
          <div id="usc-scanner-reader" className="rounded-2xl overflow-hidden shadow-2xl"></div>
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
                Scanning... {consecutiveReads.length > 0 && `(${consecutiveReads.length}/3 reads)`}
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
                className="text-green-400 text-xl font-bold"
              >
                <span className="text-3xl mr-2">✅</span>
                USC Card Verified!
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
            💡 <strong>Tips for best results:</strong>
          </p>
          <ul className="text-[#eaeaf0]/50 text-xs space-y-1">
            <li>• Use bright, even lighting (avoid shadows)</li>
            <li>• Hold card 6-12 inches from camera</li>
            <li>• Keep card steady - scanner auto-detects anywhere in frame</li>
            <li>• Barcode is on the back of your USC card (horizontal black lines)</li>
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

