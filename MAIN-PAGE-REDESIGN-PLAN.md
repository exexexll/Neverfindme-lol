# Main Page Redesign Plan

## Requirements:
1. White background with #ffc46a grid borders
2. Animated objects: football, soccer ball, music note, car, etc. (at least 5 pairs)
3. Same collision animation as landing page
4. After collision, merged objects keep moving
5. Remove Windows 95 grid tiles
6. Sleek 3D "Matchmake Now" button in center
7. Button layout:
   - Top left: Intro Code
   - Top right: Profile
   - Bottom left: Past Chat
   - Bottom right: Settings
   - Below center button: Social (smaller)
8. Mobile layout: clean, no overlapping

## Implementation:
- Create IconPair components (football, soccer, etc.)
- Reuse AnimatedHearts logic with different icons
- New layout with positioned buttons
- Responsive mobile design

