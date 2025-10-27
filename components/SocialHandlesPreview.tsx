'use client';

/**
 * Social Handles Preview
 * Shows user's social media handles in matchmaking card
 * Clickable to open in floating browser
 */

interface SocialHandlesPreviewProps {
  socials?: Record<string, string>;
}

const socialPlatforms = [
  { key: 'instagram', iconPath: '/instagram.png', label: 'Instagram' },
  { key: 'snapchat', iconPath: '/snapchat.png', label: 'Snapchat' },
  { key: 'tiktok', iconPath: '/tiktok.png', label: 'TikTok' },
  { key: 'twitter', iconPath: '/X.png', label: 'Twitter/X' },
];

export function SocialHandlesPreview({ socials }: SocialHandlesPreviewProps) {
  if (!socials || Object.keys(socials).length === 0) {
    return null;
  }

  // Filter to only socials that have values
  const availableSocials = socialPlatforms.filter(platform => 
    socials[platform.key] && socials[platform.key].trim()
  );

  if (availableSocials.length === 0) {
    return null;
  }

  // Normalize URL based on platform (research-based best practices)
  const normalizeUrl = (platform: string, handle: string): string => {
    if (!handle || handle.trim() === '') return '#';
    
    // Clean handle: remove @, spaces, URLs, special chars
    let clean = handle.trim();
    
    // If it's already a URL, extract just the username
    if (clean.includes('instagram.com/')) {
      clean = clean.split('instagram.com/').pop()?.split('/')[0] || '';
    } else if (clean.includes('tiktok.com/@')) {
      clean = clean.split('tiktok.com/@').pop()?.split('/')[0] || '';
    } else if (clean.includes('snapchat.com/')) {
      clean = clean.split('snapchat.com/').pop()?.split('/')[0] || '';
    } else if (clean.includes('twitter.com/') || clean.includes('x.com/')) {
      clean = clean.split('.com/').pop()?.split('/')[0] || '';
    }
    
    // Remove @ prefix, spaces, special chars
    clean = clean.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
    
    if (!clean) return '#';
    
    switch (platform) {
      case 'instagram':
        // Instagram: always lowercase, trailing slash
        return `https://www.instagram.com/${clean.toLowerCase()}/`;
      
      case 'snapchat':
        // Snapchat: add/ endpoint, case-sensitive
        return `https://www.snapchat.com/add/${clean}`;
      
      case 'tiktok':
        // TikTok: @ prefix in URL, case-sensitive
        return `https://www.tiktok.com/@${clean}`;
      
      case 'twitter':
        // Twitter/X: new domain, case-insensitive
        return `https://x.com/${clean}`;
      
      default:
        return '#';
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {availableSocials.map(platform => {
        const handle = socials[platform.key];
        const url = normalizeUrl(platform.key, handle);

        return (
          <a
            key={platform.key}
            href={url}
            onClick={(e) => {
              // CRITICAL: Skip FloatingBrowser for social media
              // These sites block iframes (X-Frame-Options)
              // Open directly instead
              e.preventDefault();
              e.stopPropagation();
              
              console.log(`[Social] Opening ${platform.label} directly:`, url);
              
              // Try deep link on mobile (opens native app if installed)
              if (typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                const deepLinks: Record<string, string> = {
                  'instagram': `instagram://user?username=${clean}`,
                  'tiktok': `tiktok://user?username=${clean}`,
                  'twitter': `twitter://user?screen_name=${clean}`,
                  'snapchat': `snapchat://add/${clean}`,
                };
                
                if (deepLinks[platform.key]) {
                  // Try deep link
                  window.location.href = deepLinks[platform.key];
                  
                  // Fallback to web after 500ms if app not installed
                  setTimeout(() => {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }, 500);
                } else {
                  // No deep link, open web
                  window.open(url, '_blank', 'noopener,noreferrer');
                }
              } else {
                // Desktop: Open in new tab
                window.open(url, '_blank', 'noopener,noreferrer');
              }
            }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center border border-white/20 hover:scale-110 active:scale-95 cursor-pointer"
            title={`${platform.label}: ${handle}`}
          >
            {/* Official app icon - use PNG with transparent background */}
            <img 
              src={platform.iconPath} 
              alt={platform.label}
              className="w-5 h-5 object-contain"
            />
          </a>
        );
      })}
    </div>
  );
}

