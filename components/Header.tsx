'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Container } from './Container';
import { cn } from '@/lib/utils';
import { getSession } from '@/lib/session';

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const session = getSession();
    setIsLoggedIn(!!session);
  }, [pathname]); // Re-check session when pathname changes

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 16);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Hide header on room pages
  if (pathname?.startsWith('/room')) {
    return null;
  }
  
  // Always hide header on blacklist page (has its own inline header)
  if (pathname === '/blacklist') {
    return null;
  }

  // Hide header when logged in, EXCEPT on public pages
  const publicPages = ['/', '/manifesto', '/login'];
  const isPublicPage = publicPages.includes(pathname || '');
  
  // Hide header for logged-in users on non-public pages
  if (isLoggedIn && !isPublicPage) {
    return null;
  }

  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-50 h-16 transition-all duration-200',
        isScrolled && 'bg-black/30 backdrop-blur-md'
      )}
    >
      <Container className="flex h-full items-center justify-between">
        <Link href="/" className="focus-ring rounded-md" aria-label="BUMPIN home">
          <h1 className="font-playfair text-2xl font-bold text-white">BUMPIN</h1>
        </Link>

        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-6">
            <li>
              <Link
                href="/manifesto"
                className={cn(
                  'focus-ring rounded-md text-sm font-medium transition-colors hover:text-[#ffc46a] sm:text-base',
                  pathname === '/manifesto' ? 'text-[#ffc46a]' : 'text-[#e6e6e9]'
                )}
              >
                Meet Who and Do What?
              </Link>
            </li>
            <li>
              <Link
                href="/check-access"
                className="focus-ring rounded-xl bg-[#ffc46a] px-4 py-2 text-sm font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 sm:text-base"
              >
                Get Started
              </Link>
            </li>
          </ul>
        </nav>
      </Container>
    </header>
  );
}

