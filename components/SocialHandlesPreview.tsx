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
      {availableSocials.slice(0, 3).map(platform => { // Show max 3 to avoid clutter
        const handle = socials[platform.key];
        const url = platform.key === 'phone' 
          ? `tel:${handle}`
          : platform.key === 'discord'
          ? '#' // Discord shows but isn't clickable
          : `${platform.baseUrl}${handle}`;

        return (
          <a
            key={platform.key}
            href={url}
            onClick={(e) => {
              if (platform.key === 'discord') {
                e.preventDefault(); // Discord has no URL, just show handle
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#eaeaf0] hover:bg-white/20 transition-colors border border-white/20"
            title={`${platform.label}: ${handle}`}
          >
            <span>{platform.icon}</span>
            <span className="max-w-[80px] truncate">{handle}</span>
          </a>
        );
      })}
      
      {availableSocials.length > 3 && (
        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs text-[#eaeaf0]/70">
          +{availableSocials.length - 3} more
        </span>
      )}
    </div>
  );
}

