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
  { key: 'instagram', icon: '📷', label: 'Instagram', baseUrl: 'https://instagram.com/' },
  { key: 'snapchat', icon: '👻', label: 'Snapchat', baseUrl: 'https://snapchat.com/add/' },
  { key: 'tiktok', icon: '🎵', label: 'TikTok', baseUrl: 'https://tiktok.com/@' },
  { key: 'discord', icon: '💬', label: 'Discord', baseUrl: '' }, // Discord doesn't have profile URLs
  { key: 'phone', icon: '📞', label: 'Phone', baseUrl: 'tel:' },
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

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {availableSocials.map(platform => { // Show ALL socials (not just 3)
        const handle = socials[platform.key];
        
        // Normalize URLs properly
        let url = '';
        if (platform.key === 'phone') {
          url = `tel:${handle}`;
        } else if (platform.key === 'discord') {
          url = '#'; // Discord has no public profile URL
        } else if (platform.key === 'instagram') {
          // Remove @ if present, normalize
          const cleanHandle = handle.replace(/^@/, '');
          url = `https://www.instagram.com/${cleanHandle}/`;
        } else if (platform.key === 'snapchat') {
          const cleanHandle = handle.replace(/^@/, '');
          url = `https://www.snapchat.com/add/${cleanHandle}`;
        } else if (platform.key === 'tiktok') {
          const cleanHandle = handle.replace(/^@/, '');
          url = `https://www.tiktok.com/@${cleanHandle}`;
        }

        return (
          <a
            key={platform.key}
            href={url}
            onClick={(e) => {
              if (platform.key === 'discord' || platform.key === 'phone') {
                // Discord has no URL, phone opens tel:
                if (platform.key === 'discord') {
                  e.preventDefault();
                }
                // tel: links are handled by OS
              }
              // All other links will be intercepted by useLinkInterceptor
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#eaeaf0] hover:bg-white/20 transition-colors border border-white/20"
            title={`${platform.label}: ${handle}`}
          >
            <span>{platform.icon}</span>
            <span className="max-w-[100px] truncate">{handle}</span>
          </a>
        );
      })}
    </div>
  );
}

