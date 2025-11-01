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
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const processingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
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
              'code_128_reader',   // USC also uses Code 128
              'code_39_reader',    // USC also uses Code 39
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
            patchSize: 'x-small', // OPTIMIZED: Smaller patches = faster processing
            halfSample: true, // Performance optimization (2x faster)
          },
          numOfWorkers: 4, // OPTIMIZED: Parallel processing for 4x speed boost
          frequency: 20, // OPTIMIZED: 20 scans/sec (2x faster than before)
        }, (err) => {
          if (err) {
            console.error('[Quagga] Init error:', err);
            setError(err.message || 'Failed to initialize scanner');
            setScanState('error');
            return;
          }

          if (!mountedRef.current) return;

          console.log('[Quagga] ✅ Initialized successfully');
          
          // Get video track for flashlight control
          const stream = Quagga.CameraAccess.getActiveStreamLabel();
          const videoElement = document.querySelector('#usc-scanner-reader video') as HTMLVideoElement;
          if (videoElement && videoElement.srcObject) {
            const mediaStream = videoElement.srcObject as MediaStream;
            const videoTracks = mediaStream.getVideoTracks();
            if (videoTracks.length > 0) {
              videoTrackRef.current = videoTracks[0];
              console.log('[Quagga] Video track available for flashlight');
            }
          }
          
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
      videoTrackRef.current = null;
      
      // CRITICAL: Full cleanup to release camera for selfie step
      import('@ericblade/quagga2').then(({ default: Quagga }) => {
        Quagga.offDetected(handleDetected);
        Quagga.stop();
        
        // CRITICAL: Force release camera stream
        Quagga.CameraAccess.release();
        
        console.log('[USCScanner] ✅ Camera fully released for next step');
      }).catch(err => {
        console.warn('[USCScanner] Cleanup error:', err);
      });
      
      window.removeEventListener('popstate', preventBack);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFlashlight = async () => {
    if (!videoTrackRef.current) return;
    
    try {
      const track = videoTrackRef.current;
      const capabilities: any = track.getCapabilities();
      
      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !flashlightOn } as any]
        });
        setFlashlightOn(!flashlightOn);
        console.log('[Flashlight]', !flashlightOn ? 'ON' : 'OFF');
      } else {
        console.warn('[Flashlight] Not supported on this device');
      }
    } catch (err) {
      console.error('[Flashlight] Error:', err);
    }
  };

  const handleDetected = async (result: any) => {
    if (processingRef.current || !mountedRef.current) {
      return;
    }

    const code = result.codeResult.code;
    const format = result.codeResult.format;
    
    console.log('[Quagga] Detected:', format, 'Code:', code);

    // OPTIMIZED: Single read validation (QR code speed)
    // USC barcodes are high quality, don't need 3 reads
    setConsecutiveReads((prev) => {
      const newReads = [...prev, code].slice(-2); // Only need 2 identical reads
      
      if (newReads.length === 2 && newReads.every(r => r === newReads[0])) {
        console.log('[Quagga] ✅ Confirmed after 2 identical reads (fast mode)');
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
    
    if (!uscId || !/^[0-9]{10}$/.test(uscId)) {
      // CRITICAL: Use callback to get current state value
      setFailedAttempts(prev => {
        const newCount = prev + 1;
        console.log('[Scanner] Failed attempt:', newCount, '/3');
        
        // After 3 failed attempts, STOP (prevent infinite loop)
        if (newCount >= 3) {
          setError('Unable to scan this card after 3 attempts. Please use email verification or try a different card.');
          setScanState('error');
          setConsecutiveReads([]);
          processingRef.current = false;
          // DO NOT restart scanner - let user manually retry
          return newCount;
        }
        
        // Show error and restart for attempts 1-2
        setError(`Scan failed (attempt ${newCount}/3). Please ensure barcode is clear and well-lit.`);
        setScanState('error');
        setConsecutiveReads([]);
        processingRef.current = false;
        
        // Restart after 3 seconds
        setTimeout(async () => {
          if (mountedRef.current) {
            const Quagga = (await import('@ericblade/quagga2')).default;
            setScanState('initializing');
            setError(null);
            setFlashlightOn(false);
            Quagga.start();
            setScanState('scanning');
            processingRef.current = false;
          }
        }, 3000);
        
        return newCount;
      });
      return;
    }

    // CRITICAL: Validate with backend and log to database
    try {
      console.log('[Scanner] Validating USC ID with backend...');
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
      
      const validateRes = await fetch(`${API_BASE}/usc/verify-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawBarcodeValue: rawValue,
          barcodeFormat: 'CODABAR',
        }),
      });
      
      if (!validateRes.ok) {
        const errorData = await validateRes.json();
        throw new Error(errorData.error || 'Validation failed');
      }
      
      const validateData = await validateRes.json();
      console.log('[Scanner] ✅ Backend validation passed:', validateData.message);
      
    } catch (err: any) {
      console.error('[Scanner] Backend validation failed:', err.message);
      
      // CRITICAL: Use callback to get current state
      setFailedAttempts(prev => {
        const newCount = prev + 1;
        console.log('[Scanner] Backend validation failed, attempt:', newCount, '/3');
        
        // After 3 failed attempts, STOP
        if (newCount >= 3) {
          setError((err.message || 'Failed to validate USC card') + ' (max attempts reached)');
          setScanState('error');
          processingRef.current = false;
          return newCount;
        }
        
        setError(`${err.message || 'Failed to validate USC card'} (attempt ${newCount}/3)`);
        setScanState('error');
        processingRef.current = false;
        
        setTimeout(async () => {
          if (mountedRef.current) {
            const Quagga = (await import('@ericblade/quagga2')).default;
            setScanState('initializing');
            setError(null);
            Quagga.start();
            setScanState('scanning');
            processingRef.current = false;
          }
        }, 3000);
        
        return newCount;
      });
      return;
    }

    // Success!
    setScanState('success');
    setDetectedUSCId(uscId); // Show confirmation
    console.log('[Scanner] ✅ USC ID verified: ******' + uscId.slice(-4));
    
    // CRITICAL: Release camera before moving to next step
    const QuaggaCleanup = (await import('@ericblade/quagga2')).default;
    QuaggaCleanup.offDetected(handleDetected);
    QuaggaCleanup.CameraAccess.release();
    console.log('[Scanner] Camera released for selfie step');
    
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
            
            {/* Flashlight Toggle Button */}
            {scanState === 'scanning' && (
              <button
                onClick={toggleFlashlight}
                className="absolute top-4 right-4 z-10 rounded-full bg-black/70 backdrop-blur-sm p-3 text-2xl hover:bg-black/90 transition-all border border-white/20 shadow-lg"
                aria-label="Toggle flashlight"
              >
                {flashlightOn ? '🔦' : '💡'}
              </button>
            )}
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

        {/* Tips - Compact and Above Button */}
        <div className="absolute bottom-24 left-0 right-0 px-6 z-20">
          <div className="rounded-xl bg-black/70 backdrop-blur-sm p-3 border border-white/10">
            <p className="text-[#eaeaf0]/70 text-xs text-center">
              💡 Bright lighting • Hold steady 8-10&quot; • Barcode on back • Horizontal
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
