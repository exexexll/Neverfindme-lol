'use client';

interface PixelIconProps {
  type: 'football' | 'soccer' | 'music' | 'car' | 'game';
  half: 'left' | 'right' | 'complete';
  color: 'black' | string;
}

export function PixelIcon({ type, half, color }: PixelIconProps) {
  const iconColor = color === 'black' ? '#000000' : color;
  
  return (
    <svg width="60" height="60" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* Football */}
      {type === 'football' && half === 'left' && (
        <g fill={iconColor}>
          <rect x="3" y="4" width="4" height="8"/>
          <rect x="4" y="3" width="2" height="1"/>
          <rect x="4" y="12" width="2" height="1"/>
        </g>
      )}
      {type === 'football' && half === 'right' && (
        <g fill={iconColor}>
          <rect x="9" y="4" width="4" height="8"/>
          <rect x="10" y="3" width="2" height="1"/>
          <rect x="10" y="12" width="2" height="1"/>
        </g>
      )}
      {type === 'football' && half === 'complete' && (
        <g fill={iconColor}>
          <rect x="5" y="2" width="6" height="12"/>
          <rect x="4" y="3" width="8" height="10"/>
          <rect x="6" y="6" width="1" height="1" fill="white"/>
          <rect x="9" y="6" width="1" height="1" fill="white"/>
          <rect x="6" y="9" width="1" height="1" fill="white"/>
          <rect x="9" y="9" width="1" height="1" fill="white"/>
        </g>
      )}
      
      {/* Soccer Ball */}
      {type === 'soccer' && half === 'left' && (
        <g fill={iconColor}>
          <rect x="2" y="5" width="5" height="6"/>
          <rect x="3" y="4" width="3" height="1"/>
          <rect x="3" y="11" width="3" height="1"/>
        </g>
      )}
      {type === 'soccer' && half === 'right' && (
        <g fill={iconColor}>
          <rect x="9" y="5" width="5" height="6"/>
          <rect x="10" y="4" width="3" height="1"/>
          <rect x="10" y="11" width="3" height="1"/>
        </g>
      )}
      {type === 'soccer' && half === 'complete' && (
        <g fill={iconColor}>
          <circle cx="8" cy="8" r="6" fill={iconColor}/>
          <path d="M8,3 L9,6 L7,6 Z" fill="white"/>
          <rect x="5" y="9" width="2" height="2" fill="white"/>
          <rect x="9" y="9" width="2" height="2" fill="white"/>
        </g>
      )}
      
      {/* Music Note */}
      {type === 'music' && half === 'left' && (
        <g fill={iconColor}>
          <rect x="4" y="3" width="2" height="8"/>
          <rect x="3" y="9" width="3" height="2"/>
        </g>
      )}
      {type === 'music' && half === 'right' && (
        <g fill={iconColor}>
          <rect x="10" y="3" width="2" height="8"/>
          <rect x="10" y="9" width="3" height="2"/>
        </g>
      )}
      {type === 'music' && half === 'complete' && (
        <g fill={iconColor}>
          <rect x="6" y="2" width="2" height="9"/>
          <rect x="8" y="2" width="2" height="1"/>
          <rect x="5" y="9" width="3" height="3"/>
        </g>
      )}
      
      {/* Car */}
      {type === 'car' && half === 'left' && (
        <g fill={iconColor}>
          <rect x="2" y="7" width="6" height="3"/>
          <rect x="3" y="6" width="4" height="1"/>
          <rect x="3" y="10" width="1" height="1"/>
          <rect x="6" y="10" width="1" height="1"/>
        </g>
      )}
      {type === 'car' && half === 'right' && (
        <g fill={iconColor}>
          <rect x="8" y="7" width="6" height="3"/>
          <rect x="9" y="6" width="4" height="1"/>
          <rect x="9" y="10" width="1" height="1"/>
          <rect x="12" y="10" width="1" height="1"/>
        </g>
      )}
      {type === 'car' && half === 'complete' && (
        <g fill={iconColor}>
          <rect x="3" y="7" width="10" height="3"/>
          <rect x="5" y="6" width="6" height="1"/>
          <rect x="4" y="10" width="1" height="1" fill="black"/>
          <rect x="11" y="10" width="1" height="1" fill="black"/>
        </g>
      )}
      
      {/* Game Controller */}
      {type === 'game' && half === 'left' && (
        <g fill={iconColor}>
          <rect x="2" y="6" width="5" height="4"/>
          <rect x="3" y="5" width="3" height="1"/>
          <rect x="4" y="7" width="1" height="1" fill="white"/>
        </g>
      )}
      {type === 'game' && half === 'right' && (
        <g fill={iconColor}>
          <rect x="9" y="6" width="5" height="4"/>
          <rect x="10" y="5" width="3" height="1"/>
          <rect x="11" y="7" width="1" height="1" fill="white"/>
        </g>
      )}
      {type === 'game' && half === 'complete' && (
        <g fill={iconColor}>
          <rect x="3" y="6" width="10" height="4"/>
          <rect x="4" y="5" width="8" height="1"/>
          <rect x="5" y="7" width="1" height="1" fill="white"/>
          <rect x="7" y="7" width="1" height="1" fill="white"/>
          <rect x="10" y="7" width="1" height="1" fill="white"/>
        </g>
      )}
    </svg>
  );
}

