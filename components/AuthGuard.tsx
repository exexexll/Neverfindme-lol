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
  const [eventCheckComplete, setEventCheckComplete] = useState(false);

  useEffect(() => {
    const session = getSession();
    
    // Public routes that don't require authentication
    const publicRoutes = [
      '/', 
      '/onboarding', 
      '/login', 
      '/manifesto', 
      '/blacklist',
      '/event-wait', // Event wait page is semi-public (requires session but not full access)
      // Legal pages - must be publicly accessible
      '/terms-of-service',
      '/privacy-policy',
      '/acceptable-use',
      '/cookie-policy',
      '/community-guidelines',
      '/content-policy',
    ];
    
    // Admin routes bypass event checks
    const isAdminRoute = pathname?.startsWith('/admin');
    
    // Check if current route is public
    const isPublicRoute = publicRoutes.includes(pathname || '');
    
    // If not public and no session, redirect to onboarding
    if (!isPublicRoute && !session) {
      console.log('[AuthGuard] No session found, redirecting to onboarding');
      router.push('/onboarding');
      return;
    }

    // EVENT MODE CHECK: If user has session and on protected route, check event access
    if (session && !isPublicRoute && !isAdminRoute) {
      // Routes that should be blocked by event mode (matchmaking/main)
      const eventRestrictedRoutes = ['/main'];
      const isEventRestricted = eventRestrictedRoutes.some(route => pathname?.startsWith(route));
      
      if (isEventRestricted) {
        // Check event status
        getEventStatus(session.sessionToken)
          .then(status => {
            setEventCheckComplete(true);
            
            // If event mode is ON and user doesn't have access
            if (status.eventModeEnabled && !status.canAccess) {
              console.log('[AuthGuard] Event mode active, user blocked - redirecting to wait page');
              if (pathname !== '/event-wait') {
                router.push('/event-wait');
              }
            }
          })
          .catch(err => {
            console.error('[AuthGuard] Failed to check event status:', err);
            setEventCheckComplete(true); // Continue anyway on error
          });
      } else {
        setEventCheckComplete(true);
      }
    } else {
      setEventCheckComplete(true);
    }
  }, [pathname, router]);

  return (
    <>
      <BanNotification />
      {children}
    </>
  );
}

