'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Quagga from '@ericblade/quagga2';

interface USCCardLoginProps {
  onSuccess: (uscId: string, rawValue: string) => void;
  onSkipToEmail: () => void;
}

type ScanState = 'initializing' | 'scanning' | 'processing' | 'success' | 'error';

/**
 * USC Card Scanner for LOGIN (not signup)
 * Does NOT call verify-card (card should already be registered)
 * Just extracts USC ID and returns it
 */
export function USCCardLogin({ onSuccess, onSkipToEmail }: USCCardLoginProps) {
  const [scanState, setScanState] = useState<ScanState>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [consecutiveReads, setConsecutiveReads] = useState<string[]>([]);
  const [detectedUSCId, setDetectedUSCId] = useState<string | null>(null);
  const processingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // SECURITY: Prevent bypassing scanner with back button
    const preventBack = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };
    
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', preventBack);
    
    const initScanner = async () => {
      try {
        setScanState('initializing');
        
        // Dynamic import
        const Quagga = (await import('@ericblade/quagga2')).default;
        
        await Quagga.init({
          inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: document.querySelector('#usc-login-scanner') as HTMLElement,
            constraints: {
              width: { min: 640, ideal: 1920 },
              height: { min: 480, ideal: 1080 },
              facingMode: 'environment',
              aspectRatio: { ideal: 16/9 },
            },
            area: {
              top: '15%',
              right: '5%',
              left: '5%',
              bottom: '15%',
            },
          },
          decoder: {
            readers: ['codabar_reader', 'code_128_reader', 'code_39_reader'],
            multiple: false,
            debug: {
              drawBoundingBox: true,
              showFrequency: false,
              drawScanline: true,
              showPattern: false,
            },
          },
          locate: true,
          locator: {
            patchSize: 'medium',
            halfSample: true,
          },
          frequency: 10,
        }, (err) => {
          if (err) {
            setError(err.message || 'Failed to initialize scanner');
            setScanState('error');
            return;
          }

          if (!mountedRef.current) return;

          Quagga.start();
          setScanState('scanning');
        });

        Quagga.onDetected(handleDetected);

        timeoutRef.current = setTimeout(async () => {
          if (mountedRef.current && scanState !== 'success') {
            setError('Scan timeout. Please try again or use email login.');
            setScanState('error');
            const Quagga = (await import('@ericblade/quagga2')).default;
            Quagga.stop();
          }
        }, 120000);

      } catch (err: any) {
        setError(err.message || 'Failed to start camera');
        setScanState('error');
      }
    };

    initScanner();

    return () => {
      mountedRef.current = false;
      
      import('@ericblade/quagga2').then(({ default: Quagga }) => {
        Quagga.offDetected(handleDetected);
        Quagga.stop();
        Quagga.CameraAccess.release();
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
    
    setConsecutiveReads((prev) => {
      const newReads = [...prev, code].slice(-3);
      
      if (newReads.length === 3 && newReads.every(r => r === newReads[0])) {
        processingRef.current = true;
        processConfirmedScan(code);
        return [];
      }
      
      return newReads;
    });
  };

  const processConfirmedScan = async (rawValue: string) => {
    setScanState('processing');
    
    const Quagga = (await import('@ericblade/quagga2')).default;
    Quagga.stop();
    
    // Extract USC ID
    const digits = rawValue.replace(/\D/g, '');
    const uscId = digits.length === 14 ? digits.substring(0, 10) : 
                  digits.length === 10 ? digits : 
                  digits.match(/(\d{10})/)?.[1] || null;
    
    if (!uscId || !/^[0-9]{10}$/.test(uscId)) {
      setError('Invalid USC ID. Please try again.');
      setScanState('error');
      processingRef.current = false;
      
      setTimeout(async () => {
        if (mountedRef.current) {
          const Quagga = (await import('@ericblade/quagga2')).default;
          setError(null);
          Quagga.start();
          setScanState('scanning');
        }
      }, 2000);
      return;
    }

    // Success - NO backend validation for login (card should already exist)
    setScanState('success');
    setDetectedUSCId(uscId);
    
    const QuaggaCleanup = (await import('@ericblade/quagga2')).default;
    QuaggaCleanup.offDetected(handleDetected);
    QuaggaCleanup.CameraAccess.release();
    
    setTimeout(() => {
      if (mountedRef.current) {
        onSuccess(uscId, rawValue);
      }
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div 
        id="usc-login-scanner" 
        className="rounded-2xl overflow-hidden shadow-2xl bg-black"
        style={{ width: '100%', aspectRatio: '16/9', maxHeight: '60vh' }}
      />
      
      <div className="text-center">
        <AnimatePresence mode="wait">
          {scanState === 'initializing' && (
            <motion.div key="init" className="text-[#eaeaf0]/70">
              <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#ffc46a] border-t-transparent mr-2" />
              Initializing camera...
            </motion.div>
          )}

          {scanState === 'scanning' && (
            <motion.div key="scan" className="text-white">
              <span className="text-2xl mr-2">📷</span>
              Scanning... {consecutiveReads.length > 0 && `(${consecutiveReads.length}/3 reads)`}
            </motion.div>
          )}

          {scanState === 'processing' && (
            <motion.div key="proc" className="text-yellow-300">
              <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent mr-2" />
              Logging in...
            </motion.div>
          )}

          {scanState === 'success' && (
            <motion.div key="success" className="text-green-400">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-xl font-bold">USC Card Detected!</div>
              {detectedUSCId && (
                <div className="text-sm mt-2 font-mono">USC ID: ******{detectedUSCId.slice(-4)}</div>
              )}
            </motion.div>
          )}

          {scanState === 'error' && error && (
            <motion.div key="error" className="text-red-400">
              <span className="text-2xl mr-2">⚠️</span>
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={onSkipToEmail}
        className="w-full py-3 rounded-xl bg-white/10 text-[#eaeaf0] hover:bg-white/20 transition-all text-sm"
      >
        Use Email Login Instead
      </button>
    </div>
  );
}

