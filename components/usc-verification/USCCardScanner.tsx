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
  const [detectedValue, setDetectedValue] = useState<string>('');

  useEffect(() => {
    startScanner();
    
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      setScanState('initializing');
      
      const scanner = new Html5Qrcode('usc-scanner-reader');
      scannerRef.current = scanner;

      const config = {
        fps: 5, // Scans per second
        qrbox: { width: 350, height: 120 }, // Scanning area for horizontal barcode
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
    console.log('[USCScanner] Detected:', decodedText);
    setDetectedValue(decodedText);

    // Multi-read validation (require 3 consecutive identical reads)
    setConsecutiveReads((prev) => {
      const newReads = [...prev, decodedText].slice(-3);
      
      // Check if all 3 match
      if (newReads.length === 3 && newReads.every(r => r === newReads[0])) {
        console.log('[USCScanner] ✅ Confirmed after 3 reads');
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

  const processConfirmedScan = (rawValue: string) => {
    setScanState('processing');
    
    // Extract USC ID from 14-digit barcode
    const uscId = extractUSCId(rawValue);
    
    if (!uscId) {
      setError('Invalid barcode. Please try again.');
      setScanState('scanning');
      setConsecutiveReads([]);
      return;
    }
    
    // Validate USC ID format
    if (!/^[0-9]{10}$/.test(uscId)) {
      setError('Invalid USC ID format. Please scan the barcode on the back of your card.');
      setScanState('scanning');
      setConsecutiveReads([]);
      return;
    }
    
    // Success!
    setScanState('success');
    console.log('[USCScanner] ✅ Valid USC ID:', uscId);
    
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
          Flip your card to the back and align the barcode
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
            <li>• Hold card flat and steady (8-10 inches from camera)</li>
            <li>• Align barcode horizontally in the scan area</li>
            <li>• Wait for camera to focus (image should be sharp)</li>
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

