'use client';

interface PixelIconProps {
  type: 'football' | 'soccer' | 'music' | 'car' | 'game';
  half: 'left' | 'right' | 'complete';
  color: string;
}

export function PixelIcon({ type, half, color }: PixelIconProps) {
  return (
    <svg width="60" height="60" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
      {/* Football - simplified oval */}
      {type === 'football' && half === 'left' && (
        <g fill={color}>
          <rect x="3" y="5" width="4" height="6"/>
          <rect x="4" y="4" width="2" height="1"/>
          <rect x="4" y="11" width="2" height="1"/>
        </g>
      )}
      {type === 'football' && half === 'right' && (
        <g fill={color}>
          <rect x="9" y="5" width="4" height="6"/>
          <rect x="10" y="4" width="2" height="1"/>
          <rect x="10" y="11" width="2" height="1"/>
        </g>
      )}
      {type === 'football' && half === 'complete' && (
        <g fill={color}>
          <rect x="5" y="3" width="6" height="10"/>
          <rect x="4" y="4" width="8" height="8"/>
          <line x1="8" y1="4" x2="8" y2="12" stroke="white" strokeWidth="1"/>
        </g>
      )}
      
      {/* Soccer - circle */}
      {type === 'soccer' && half === 'left' && (
        <g fill={color}>
          <rect x="3" y="6" width="4" height="4"/>
          <rect x="4" y="5" width="2" height="1"/>
          <rect x="4" y="10" width="2" height="1"/>
        </g>
      )}
      {type === 'soccer' && half === 'right' && (
        <g fill={color}>
          <rect x="9" y="6" width="4" height="4"/>
          <rect x="10" y="5" width="2" height="1"/>
          <rect x="10" y="10" width="2" height="1"/>
        </g>
      )}
      {type === 'soccer' && half === 'complete' && (
        <g>
          <circle cx="8" cy="8" r="5" fill={color}/>
          <rect x="7" y="5" width="2" height="6" fill="white"/>
          <rect x="5" y="7" width="6" height="2" fill="white"/>
        </g>
      )}
      
      {/* Music note */}
      {type === 'music' && half === 'left' && (
        <g fill={color}>
          <rect x="4" y="4" width="2" height="6"/>
          <rect x="3" y="8" width="3" height="2"/>
        </g>
      )}
      {type === 'music' && half === 'right' && (
        <g fill={color}>
          <rect x="10" y="4" width="2" height="6"/>
          <rect x="10" y="8" width="3" height="2"/>
        </g>
      )}
      {type === 'music' && half === 'complete' && (
        <g fill={color}>
          <rect x="6" y="3" width="2" height="7"/>
          <rect x="8" y="3" width="3" height="1"/>
          <rect x="5" y="8" width="3" height="3"/>
        </g>
      )}
      
      {/* Car */}
      {type === 'car' && half === 'left' && (
        <g fill={color}>
          <rect x="2" y="7" width="5" height="2"/>
          <rect x="3" y="6" width="3" height="1"/>
          <rect x="2" y="9" width="1" height="1"/>
          <rect x="5" y="9" width="1" height="1"/>
        </g>
      )}
      {type === 'car' && half === 'right' && (
        <g fill={color}>
          <rect x="9" y="7" width="5" height="2"/>
          <rect x="10" y="6" width="3" height="1"/>
          <rect x="10" y="9" width="1" height="1"/>
          <rect x="13" y="9" width="1" height="1"/>
        </g>
      )}
      {type === 'car' && half === 'complete' && (
        <g fill={color}>
          <rect x="3" y="7" width="10" height="2"/>
          <rect x="5" y="6" width="6" height="1"/>
          <rect x="4" y="9" width="1" height="1" fill="black"/>
          <rect x="11" y="9" width="1" height="1" fill="black"/>
        </g>
      )}
      
      {/* Game controller */}
      {type === 'game' && half === 'left' && (
        <g fill={color}>
          <rect x="2" y="6" width="5" height="3"/>
          <rect x="3" y="5" width="3" height="1"/>
        </g>
      )}
      {type === 'game' && half === 'right' && (
        <g fill={color}>
          <rect x="9" y="6" width="5" height="3"/>
          <rect x="10" y="5" width="3" height="1"/>
        </g>
      )}
      {type === 'game' && half === 'complete' && (
        <g fill={color}>
          <rect x="3" y="6" width="10" height="3"/>
          <rect x="4" y="5" width="8" height="1"/>
          <rect x="5" y="7" width="1" height="1" fill="white"/>
          <rect x="10" y="7" width="1" height="1" fill="white"/>
        </g>
      )}
    </svg>
  );
}

