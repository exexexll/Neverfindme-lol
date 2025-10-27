/**
 * Link Interceptor Hook
 * Detects clicks on external links and opens them in floating browser
 * Instead of navigating away from the app
 */

import { useEffect, useCallback } from 'react';

interface LinkInterceptorOptions {
  onLinkClick: (url: string) => void;
  enabled?: boolean;
}

export function useLinkInterceptor({ onLinkClick, enabled = true }: LinkInterceptorOptions) {
  const handleClick = useCallback((e: MouseEvent) => {
    if (!enabled) return;

    const target = e.target as HTMLElement;
    const link = target.closest('a');
    
    if (!link || !link.href) return;
    
    try {
      const linkUrl = new URL(link.href);
      const currentOrigin = window.location.origin;
      
      // Only intercept external links (not same-origin)
      const isExternal = linkUrl.origin !== currentOrigin;
      
      // Don't intercept if link has target="_blank" or download attribute
      const hasBlankTarget = link.target === '_blank';
      const hasDownload = link.hasAttribute('download');
      
      // Don't intercept mailto:, tel:, etc.
      const isSpecialProtocol = linkUrl.protocol !== 'http:' && linkUrl.protocol !== 'https:';
      
      if (isExternal && !hasBlankTarget && !hasDownload && !isSpecialProtocol) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[LinkInterceptor] Opening in floating browser:', link.href);
        onLinkClick(link.href);
      }
    } catch (err) {
      // Invalid URL, let default behavior handle it
      console.warn('[LinkInterceptor] Invalid URL:', err);
    }
  }, [onLinkClick, enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Use capture phase to catch clicks before other handlers
    document.addEventListener('click', handleClick, true);
    
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [handleClick, enabled]);
}

