/**
 * Location API Client
 * Frontend utilities for location-based features
 */

import { API_BASE } from './config';
import { formatDistance, roundCoordinates } from './distanceCalculation';

// Client-side rate limiting to prevent 429 errors
const lastLocationUpdate = { timestamp: 0 };
const LOCATION_UPDATE_COOLDOWN = 1800000; // 30 minutes (match server)

/**
 * Request browser location permission and update on server
 */
export async function requestAndUpdateLocation(sessionToken: string): Promise<boolean> {
  // CLIENT-SIDE RATE LIMIT CHECK: Prevent 429 errors
  const timeSinceLastUpdate = Date.now() - lastLocationUpdate.timestamp;
  if (timeSinceLastUpdate < LOCATION_UPDATE_COOLDOWN) {
    const minutesRemaining = Math.ceil((LOCATION_UPDATE_COOLDOWN - timeSinceLastUpdate) / 60000);
    console.log(`[Location] ⏱️ Skipping update - already updated ${Math.round(timeSinceLastUpdate/60000)} min ago (wait ${minutesRemaining} more min)`);
    return false; // Return false but don't show error (silent skip)
  }
  
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.error('[Location] Geolocation not supported');
      resolve(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log('[Location] Got coordinates:', { latitude, longitude, accuracy });
        
        // Round for privacy (~100m precision)
        const rounded = roundCoordinates(latitude, longitude);
        
        try {
          const response = await fetch(`${API_BASE}/location/update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sessionToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              latitude: rounded.lat,
              longitude: rounded.lon,
              accuracy
            }),
          });
          
          if (response.ok) {
            console.log('[Location] ✅ Updated successfully');
            lastLocationUpdate.timestamp = Date.now(); // Update timestamp on success
            resolve(true);
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Location] ❌ Update failed:', response.status, errorData);
            // Don't update timestamp on failure (allow retry)
            resolve(false);
          }
        } catch (error) {
          console.error('[Location] API error:', error);
          resolve(false);
        }
      },
      (error) => {
        // ENHANCED ERROR LOGGING FOR MOBILE DEBUGGING
        const errorMessages = {
          1: 'PERMISSION_DENIED - User or browser blocked location',
          2: 'POSITION_UNAVAILABLE - GPS/network issue', 
          3: 'TIMEOUT - Location request timed out'
        };
        
        console.error('[Location] Error:', errorMessages[error.code as keyof typeof errorMessages] || 'Unknown error');
        console.error('[Location] Full error details:', { 
          code: error.code, 
          message: error.message,
          userAgent: navigator.userAgent.substring(0, 50)
        });
        
        // For mobile, show helpful instructions
        if (/iPhone|iPad|Android/i.test(navigator.userAgent) && error.code === 1) {
          console.log('[Location] 📱 Mobile permission denied - user needs to check settings');
          console.log('[Location] iOS: Settings → Safari/Chrome → Location → Allow');
          console.log('[Location] Android: Settings → Apps → Chrome → Permissions → Location → Allow');
        }
        
        resolve(false);
      },
      {
        enableHighAccuracy: false, // Battery-friendly
        timeout: 10000,
        maximumAge: 300000, // 5 min cache OK
      }
    );
  });
}

/**
 * Clear user's location from server
 */
export async function clearLocation(sessionToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/location/clear`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    
    return response.ok;
  } catch (error) {
    console.error('[Location] Clear failed:', error);
    return false;
  }
}

/**
 * Check location sharing status
 */
export async function checkLocationStatus(sessionToken: string): Promise<{
  active: boolean;
  updatedAt: string | null;
  expiresIn: number;
}> {
  try {
    const response = await fetch(`${API_BASE}/location/status`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('[Location] Status check failed:', error);
  }
  
  return { active: false, updatedAt: null, expiresIn: 0 };
}

export { formatDistance };

