'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getEventStatus } from '@/lib/api';
import BanNotification from './BanNotification';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard - Protects routes from unauthorized access
 * Redirects to onboarding if no session exists
 * Shows ban notification if user is banned
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [eventCheckComplete, setEventCheckComplete] = useState(true); // Default to true
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    const session = getSession();
    
    // Public routes that don't require authentication
    const publicRoutes = [
      '/', '/onboarding', '/login', '/manifesto', '/blacklist', '/event-wait',
      '/terms-of-service', '/privacy-policy', '/acceptable-use',
      '/cookie-policy', '/community-guidelines', '/content-policy',
    ];
    
    const isAdminRoute = pathname?.startsWith('/admin');
    const isPublicRoute = publicRoutes.includes(pathname || '');
    
    // If not public and no session, redirect to onboarding
    if (!isPublicRoute && !session) {
      console.log('[AuthGuard] No session found, redirecting to onboarding');
      router.push('/onboarding');
      return;
    }

    // EVENT MODE CHECK: Only check ONCE per pathname (prevent loops)
    if (session && !isPublicRoute && !isAdminRoute && pathname && pathname !== '/event-wait') {
      // Skip if already checked this path
      if (checkedPaths.has(pathname)) {
        setEventCheckComplete(true);
        return;
      }
      
      const eventRestrictedRoutes = ['/main', '/history', '/tracker', '/refilm', '/settings'];
      const isEventRestricted = eventRestrictedRoutes.some(route => pathname.startsWith(route));
      
      if (isEventRestricted) {
        // Mark as checked BEFORE API call
        setCheckedPaths(prev => new Set(prev).add(pathname));
        
        getEventStatus(session.sessionToken)
          .then(status => {
            if (status.eventModeEnabled && !status.canAccess) {
              console.log('[AuthGuard] Event mode ON - redirect to wait page');
              router.push('/event-wait');
            }
            setEventCheckComplete(true);
          })
          .catch(err => {
            console.error('[AuthGuard] Event check error, allowing:', err.message);
            setEventCheckComplete(true);
          });
      } else {
        setEventCheckComplete(true);
      }
    } else {
      setEventCheckComplete(true);
    }
  }, [pathname, router, checkedPaths]);

  // Show nothing while checking event access (prevents flash of wrong content)
  if (!eventCheckComplete) {
    return null;
  }

  return (
    <>
      <BanNotification />
      {children}
    </>
  );
}

