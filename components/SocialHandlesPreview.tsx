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
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center border border-white/20 hover:scale-110 active:scale-95"
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

