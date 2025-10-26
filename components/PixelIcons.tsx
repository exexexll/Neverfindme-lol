'use client';

interface PixelIconProps {
  type: 'football' | 'soccer' | 'music' | 'car' | 'game';
  half: 'left' | 'right' | 'complete';
  color: string;
}

export function PixelIcon({ type, half, color }: PixelIconProps) {
  const size = 80; // Larger for better recognition
  
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}>
      {/* Football - Brown oval with white laces */}
      {type === 'football' && half === 'left' && (
        <g>
          <ellipse cx="5" cy="8" rx="3" ry="5" fill="#8B4513"/>
          <rect x="4" y="6" width="2" height="1" fill="white"/>
          <rect x="4" y="8" width="2" height="1" fill="white"/>
          <rect x="4" y="10" width="2" height="1" fill="white"/>
        </g>
      )}
      {type === 'football' && half === 'right' && (
        <g>
          <ellipse cx="11" cy="8" rx="3" ry="5" fill="#8B4513"/>
          <rect x="10" y="6" width="2" height="1" fill="white"/>
          <rect x="10" y="8" width="2" height="1" fill="white"/>
          <rect x="10" y="10" width="2" height="1" fill="white"/>
        </g>
      )}
      {type === 'football' && half === 'complete' && (
        <g>
          <ellipse cx="8" cy="8" rx="5" ry="7" fill={color}/>
          <rect x="7" y="5" width="2" height="1" fill="white"/>
          <rect x="7" y="7" width="2" height="1" fill="white"/>
          <rect x="7" y="9" width="2" height="1" fill="white"/>
          <rect x="7" y="11" width="2" height="1" fill="white"/>
        </g>
      )}
      
      {/* Soccer - Ball with pentagon pattern */}
      {type === 'soccer' && half === 'left' && (
        <g>
          <circle cx="5" cy="8" r="4" fill="white"/>
          <polygon points="5,6 4,7 5,9 6,7" fill="black"/>
        </g>
      )}
      {type === 'soccer' && half === 'right' && (
        <g>
          <circle cx="11" cy="8" r="4" fill="white"/>
          <polygon points="11,6 10,7 11,9 12,7" fill="black"/>
        </g>
      )}
      {type === 'soccer' && half === 'complete' && (
        <g>
          <circle cx="8" cy="8" r="6" fill="white" stroke="black" strokeWidth="0.5"/>
          <polygon points="8,4 6,6 7,9 9,9 10,6" fill="black"/>
          <circle cx="8" cy="8" r="1" fill={color}/>
        </g>
      )}
      
      {/* Music note - Clear musical note */}
      {type === 'music' && half === 'left' && (
        <g>
          <rect x="5" y="4" width="1" height="7" fill={color === '#000000' ? color : '#1E90FF'}/>
          <circle cx="5" cy="11" r="2" fill={color === '#000000' ? color : '#1E90FF'}/>
        </g>
      )}
      {type === 'music' && half === 'right' && (
        <g>
          <rect x="10" y="4" width="1" height="7" fill={color === '#000000' ? color : '#1E90FF'}/>
          <circle cx="10" cy="11" r="2" fill={color === '#000000' ? color : '#1E90FF'}/>
        </g>
      )}
      {type === 'music' && half === 'complete' && (
        <g>
          <rect x="7" y="3" width="2" height="8" fill={color}/>
          <rect x="9" y="3" width="3" height="2" fill={color}/>
          <ellipse cx="8" cy="11" rx="2.5" ry="2" fill={color}/>
        </g>
      )}
      
      {/* Car - Side view with wheels */}
      {type === 'car' && half === 'left' && (
        <g>
          <rect x="2" y="7" width="5" height="3" fill={color === '#000000' ? '#FF4444' : color}/>
          <rect x="3" y="5" width="3" height="2" fill={color === '#000000' ? '#FF4444' : color}/>
          <rect x="4" y="6" width="1" height="1" fill="#87CEEB"/>
          <circle cx="3" cy="10" r="1.5" fill="black"/>
        </g>
      )}
      {type === 'car' && half === 'right' && (
        <g>
          <rect x="9" y="7" width="5" height="3" fill={color === '#000000' ? '#FF4444' : color}/>
          <rect x="10" y="5" width="3" height="2" fill={color === '#000000' ? '#FF4444' : color}/>
          <rect x="11" y="6" width="1" height="1" fill="#87CEEB"/>
          <circle cx="12" cy="10" r="1.5" fill="black"/>
        </g>
      )}
      {type === 'car' && half === 'complete' && (
        <g>
          <rect x="3" y="7" width="10" height="3" fill={color}/>
          <rect x="5" y="5" width="6" height="2" fill={color}/>
          <rect x="6" y="6" width="2" height="1" fill="#87CEEB"/>
          <rect x="9" y="6" width="2" height="1" fill="#87CEEB"/>
          <circle cx="5" cy="10" r="2" fill="black"/>
          <circle cx="11" cy="10" r="2" fill="black"/>
          <circle cx="5" cy="10" r="0.8" fill="white"/>
          <circle cx="11" cy="10" r="0.8" fill="white"/>
        </g>
      )}
      
      {/* Game controller - With D-pad and buttons */}
      {type === 'game' && half === 'left' && (
        <g>
          <rect x="2" y="6" width="5" height="4" fill={color === '#000000' ? '#6C5CE7' : color}/>
          <rect x="3" y="7" width="1" height="1" fill="white"/>
          <rect x="4" y="6" width="1" height="1" fill="white"/>
          <rect x="4" y="8" width="1" height="1" fill="white"/>
          <rect x="5" y="7" width="1" height="1" fill="white"/>
        </g>
      )}
      {type === 'game' && half === 'right' && (
        <g>
          <rect x="9" y="6" width="5" height="4" fill={color === '#000000' ? '#6C5CE7' : color}/>
          <circle cx="11" cy="7" r="0.8" fill="#FF6B6B"/>
          <circle cx="12" cy="8" r="0.8" fill="#4ECDC4"/>
          <circle cx="11" cy="9" r="0.8" fill="#FFA502"/>
          <circle cx="10" cy="8" r="0.8" fill="#A29BFE"/>
        </g>
      )}
      {type === 'game' && half === 'complete' && (
        <g>
          <rect x="3" y="6" width="10" height="5" fill={color} rx="1"/>
          <rect x="2" y="8" width="1" height="2" fill={color}/>
          <rect x="13" y="8" width="1" height="2" fill={color}/>
          {/* D-pad */}
          <rect x="5" y="7" width="1" height="1" fill="white"/>
          <rect x="6" y="6" width="1" height="1" fill="white"/>
          <rect x="6" y="8" width="1" height="1" fill="white"/>
          <rect x="7" y="7" width="1" height="1" fill="white"/>
          {/* Buttons */}
          <circle cx="10" cy="7" r="0.7" fill="#FF6B6B"/>
          <circle cx="11" cy="8" r="0.7" fill="#4ECDC4"/>
          <circle cx="10" cy="9" r="0.7" fill="#FFA502"/>
          <circle cx="9" cy="8" r="0.7" fill="#A29BFE"/>
        </g>
      )}
    </svg>
  );
}

