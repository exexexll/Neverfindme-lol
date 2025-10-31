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

  useEffect(() => {
    // Initialize scanner
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      },
      false
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
  }, [onScan, onClose]);

  const handleManualEntry = () => {
    const code = prompt('Enter the 16-character admin invite code:');
    if (code && /^[A-Z0-9]{16}$/i.test(code)) {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
      onScan(code.toUpperCase());
    } else if (code) {
      alert('Invalid code format. Must be 16 characters (A-Z, 0-9)');
    }
  };

  return (
    <div className="space-y-4">
      <div id="qr-reader" className="w-full"></div>

      {error && (
        <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={handleManualEntry}
          className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
        >
          Enter Code Manually
        </button>
        <button
          onClick={onClose}
          className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-[#eaeaf0] hover:bg-white/20 transition-all"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-center text-[#eaeaf0]/50">
        Point your camera at the admin QR code
      </p>
    </div>
  );
}

