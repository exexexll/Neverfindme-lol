'use client';

import Link from 'next/link';

export function LegalFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0a0a0c]/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4">
          {/* Legal Links */}
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link 
              href="/terms-of-service" 
              className="text-[#eaeaf0]/60 hover:text-[#fcf290] transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-[#eaeaf0]/30">|</span>
            <Link 
              href="/privacy-policy" 
              className="text-[#eaeaf0]/60 hover:text-[#fcf290] transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-[#eaeaf0]/30">|</span>
            <Link 
              href="/acceptable-use" 
              className="text-[#eaeaf0]/60 hover:text-[#fcf290] transition-colors"
            >
              Acceptable Use
            </Link>
            <span className="text-[#eaeaf0]/30">|</span>
            <Link 
              href="/cookie-policy" 
              className="text-[#eaeaf0]/60 hover:text-[#fcf290] transition-colors"
            >
              Cookie Policy
            </Link>
            <span className="text-[#eaeaf0]/30">|</span>
            <Link 
              href="/community-guidelines" 
              className="text-[#eaeaf0]/60 hover:text-[#fcf290] transition-colors"
            >
              Community Guidelines
            </Link>
            <span className="text-[#eaeaf0]/30">|</span>
            <Link 
              href="/content-policy" 
              className="text-[#eaeaf0]/60 hover:text-[#fcf290] transition-colors"
            >
              Content Policy
            </Link>
          </div>

          {/* Contact Info */}
          <div className="text-center text-xs text-[#eaeaf0]/40">
            <p>BUMPIn</p>
            <p>1506 Nolita, Los Angeles, CA 90026</p>
            <p>
              Contact:{' '}
              <a 
                href="mailto:everything@bumpin.com" 
                className="text-[#fcf290]/80 hover:text-[#fcf290] transition-colors"
              >
                everything@bumpin.com
              </a>
            </p>
          </div>

          {/* Copyright */}
          <div className="text-xs text-[#eaeaf0]/30">
            © 2025 BUMPIn. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}

