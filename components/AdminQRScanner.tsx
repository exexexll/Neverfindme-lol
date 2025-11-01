'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface AdminQRScannerProps {
  onScan: (inviteCode: string) => void;
  onClose: () => void;
}

export function AdminQRScanner({ onScan, onClose }: AdminQRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);

  const startScanner = () => {
    setCameraStarted(true);
    
    // Initialize scanner after user clicks button
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
        formatsToSupport: undefined, // All formats
        videoConstraints: {
          facingMode: "environment", // Back camera on mobile
          aspectRatio: 1.0,
        },
      },
      /* verbose= */ false // Hide default UI buttons
    );

    scanner.render(
      // Success callback
      (decodedText) => {
        console.log('[QR] Scanned:', decodedText);
        
        try {
          // Check if it's a URL (QR code from admin)
          if (decodedText.startsWith('http')) {
            const url = new URL(decodedText);
            
            // SECURITY: Validate domain
            if (!url.hostname.includes('napalmsky.com') && 
                !url.hostname.includes('bumpin.io')) {
              setError('Invalid QR code domain');
              return;
            }
            
            // Extract invite code
            const code = url.searchParams.get('inviteCode');
            if (code && /^[A-Z0-9]{16}$/i.test(code)) {
              scanner.clear();
              onScan(code.toUpperCase());
            } else {
              setError('No valid invite code in QR');
            }
          }
          // Check if it's a direct invite code
          else if (/^[A-Z0-9]{16}$/i.test(decodedText)) {
            scanner.clear();
            onScan(decodedText.toUpperCase());
          } else {
            setError('Invalid QR code format');
          }
        } catch (err) {
          setError('Failed to parse QR code');
        }
      },
      // Error callback
      (errorMessage) => {
        // Ignore frequent scan errors
      }
    );

    scannerRef.current = scanner;

    // Auto-timeout after 2 minutes
    const timeout = setTimeout(() => {
      scanner.clear();
      onClose();
    }, 120000);

    return () => {
      clearTimeout(timeout);
      scanner.clear().catch(() => {});
    };
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
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-black">
            <style jsx global>{`
              #qr-reader {
                border: none !important;
              }
              #qr-reader__dashboard_section {
                display: none !important;
              }
              #qr-reader__dashboard_section_csr {
                display: none !important;
              }
              #qr-reader video {
                border-radius: 12px;
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

