'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface AdminQRScannerProps {
  onScan: (inviteCode: string) => void;
  onClose: () => void;
}

export function AdminQRScanner({ onScan, onClose }: AdminQRScannerProps) {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [scanning, setScanning] = useState(false);

  const startScanning = async () => {
    console.log('[QR] Starting camera...');
    setError(null);
    
    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;
      
      console.log('[QR] Requesting camera permission...');
      
      await html5QrCode.start(
        { facingMode: "environment" }, // Back camera on mobile
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText, decodedResult) => {
          console.log('[QR] ✅ Scanned:', decodedText);
          
          try {
            // Check if it's a URL
            if (decodedText.startsWith('http')) {
              const url = new URL(decodedText);
              console.log('[QR] Scanned URL hostname:', url.hostname);
              console.log('[QR] Full URL:', decodedText);
              
              // If it's a myqrcode.mobi redirect, just navigate to it
              if (url.hostname === 'myqrcode.mobi' || url.hostname.endsWith('.myqrcode.mobi')) {
                console.log('[QR] ✅ myqrcode.mobi redirect detected, navigating to URL');
                try {
                  await html5QrCode.stop();
                } catch (stopErr) {
                  console.warn('[QR] Stop error (ignored):', stopErr);
                }
                // Navigate to the redirect URL, it will go to bumpin.io
                window.location.href = decodedText;
                return;
              }
              
              // For direct bumpin.io URLs, validate and extract inviteCode
              const validDomain = url.hostname === 'bumpin.io' || 
                                 url.hostname.endsWith('.bumpin.io') ||
                                 url.hostname === 'napalmsky.com' ||
                                 url.hostname.endsWith('.napalmsky.com') ||
                                 url.hostname === 'localhost';
              
              if (!validDomain) {
                console.error('[QR] Invalid domain:', url.hostname);
                setError('Invalid QR domain: ' + url.hostname);
                return;
              }
              
              console.log('[QR] ✅ Valid domain:', url.hostname);
              
              const code = url.searchParams.get('inviteCode');
              console.log('[QR] Extracted inviteCode:', code);
              
              if (code && /^[A-Z0-9]{16}$/i.test(code)) {
                console.log('[QR] ✅ Valid code, stopping scanner and calling onScan');
                try {
                  await html5QrCode.stop();
                } catch (stopErr) {
                  console.warn('[QR] Stop error (ignored):', stopErr);
                }
                onScan(code.toUpperCase());
              } else {
                console.error('[QR] No valid inviteCode parameter in URL');
                setError('No inviteCode in QR. Expected: ?inviteCode=...');
              }
            }
            // Check if it's direct code
            else if (/^[A-Z0-9]{16}$/i.test(decodedText)) {
              console.log('[QR] Direct code scanned');
              try {
                await html5QrCode.stop();
              } catch (stopErr) {
                console.warn('[QR] Stop error (ignored):', stopErr);
              }
              onScan(decodedText.toUpperCase());
            }
          } catch (err) {
            console.error('[QR] Parse error:', err);
          }
        },
        (errorMessage) => {
          // Ignore scan errors (too frequent)
        }
      );
      
      setScanning(true);
      console.log('[QR] ✅ Camera started');
    } catch (err: any) {
      console.error('[QR] Camera error:', err);
      setError('Camera error: ' + err.message);
    }
  };
  
  useEffect(() => {
    if (cameraStarted && !scanning) {
      startScanning();
    }
    
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, [cameraStarted]);

  const startScanner = () => {
    console.log('[QR] User clicked Enable Camera button');
    setCameraStarted(true);
  };

  return (
    <div className="space-y-6">
      {!cameraStarted ? (
        // Show button to request camera permission
        <div className="text-center space-y-6">
          <div className="space-y-3">
            <div className="text-6xl">📱</div>
            <h3 className="text-xl font-bold text-[#eaeaf0]">
              Camera Permission Needed
            </h3>
            <p className="text-sm text-[#eaeaf0]/70">
              Click below to enable your camera and scan the QR code
            </p>
          </div>
          
          <button
            onClick={startScanner}
            className="w-full rounded-xl bg-[#ffc46a] px-8 py-4 font-bold text-[#0a0a0c] hover:opacity-90 transition-opacity shadow-lg text-lg"
          >
            📷 Enable Camera to Scan
          </button>
          
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
          >
            Cancel
          </button>
        </div>
      ) : (
        // Show scanner after permission granted
        <>
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-black min-h-[400px]">
            <style jsx global>{`
              #qr-reader {
                border: none !important;
                min-height: 400px !important;
              }
              #qr-reader__dashboard_section {
                display: none !important;
              }
              #qr-reader__dashboard_section_csr {
                display: none !important;
              }
              #qr-reader video {
                border-radius: 12px;
                min-height: 300px !important;
              }
              #qr-reader__scan_region {
                min-height: 300px !important;
              }
            `}</style>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
              <p className="font-medium mb-1">❌ Scan Error</p>
              <p className="text-xs">{error}</p>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
          >
            Cancel
          </button>

          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-[#eaeaf0]">
              📱 Point camera at QR code
            </p>
            <p className="text-xs text-[#eaeaf0]/50">
              Admin QR from events or friend invite code
            </p>
          </div>
        </>
      )}
    </div>
  );
}

