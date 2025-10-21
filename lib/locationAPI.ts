/**
 * Location API Client
 * Frontend utilities for location-based features
 */

import { API_BASE } from './config';
import { formatDistance, roundCoordinates } from './distanceCalculation';

/**
 * Request browser location permission and update on server
 */
export async function requestAndUpdateLocation(sessionToken: string): Promise<boolean> {
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
            console.log('[Location] Updated successfully');
            resolve(true);
          } else {
            console.error('[Location] Update failed');
            resolve(false);
          }
        } catch (error) {
          console.error('[Location] API error:', error);
          resolve(false);
        }
      },
      (error) => {
        console.log('[Location] Permission denied or error:', error.message);
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

