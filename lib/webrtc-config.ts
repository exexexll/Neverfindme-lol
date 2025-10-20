/**
 * WebRTC Configuration & Optimization
 * Phase 4: 1080p quality + TURN caching + connection speed
 */

import { API_BASE } from './config';

export function detectDevice() {
  if (typeof window === 'undefined') {
    return { isMobile: false, isSafari: false, isIOS: false };
  }
  
  const ua = navigator.userAgent;
  return {
    isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
    isIOS: /iPhone|iPad|iPod/i.test(ua),
  };
}

/**
 * Get optimal getUserMedia constraints
 * Desktop: 1920x1080 @ 30fps (Full HD)
 * Mobile: 1280x720 @ 30fps (HD)
 */
export function getMediaConstraints() {
  const { isMobile } = detectDevice();
  
  return {
    video: {
      facingMode: 'user',
      width: { min: 480, ideal: isMobile ? 1280 : 1920, max: 1920 },
      height: { min: 480, ideal: isMobile ? 720 : 1080, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
      aspectRatio: { ideal: isMobile ? 9/16 : 16/9 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 }, // CD quality
      channelCount: { ideal: 1 }, // Mono for voice
    }
  };
}

/**
 * Prefetch TURN credentials (saves 0.5-1s on call connection)
 * Call this on main page before user opens matchmaking
 */
export async function prefetchTurnCredentials(sessionToken: string): Promise<void> {
  try {
    const cached = sessionStorage.getItem('napalmsky_turn_cache');
    if (cached) {
      const { fetchedAt } = JSON.parse(cached);
      // Skip if less than 45 min old (creds valid 1 hour)
      if (Date.now() - fetchedAt < 2700000) {
        return;
      }
    }
    
    const response = await fetch(`${API_BASE}/turn/credentials`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });
    
    if (!response.ok) {
      console.warn('[TURN] Prefetch failed');
      return;
    }
    
    const data = await response.json();
    
    sessionStorage.setItem('napalmsky_turn_cache', JSON.stringify({
      iceServers: data.iceServers,
      fetchedAt: Date.now(),
    }));
    
    console.log('[TURN] Prefetched (provider:', data.provider + ')');
  } catch (error) {
    console.log('[TURN] Prefetch error (non-critical):', error);
  }
}

/**
 * Get ICE servers (uses cache or fetches)
 */
export async function getIceServers(sessionToken: string): Promise<RTCIceServer[]> {
  // Try cache first
  const cached = sessionStorage.getItem('napalmsky_turn_cache');
  if (cached) {
    const { iceServers, fetchedAt } = JSON.parse(cached);
    if (Date.now() - fetchedAt < 3300000) { // < 55 min old
      console.log('[TURN] Using cache');
      return iceServers;
    }
  }
  
  // Fetch fresh
  try {
    const response = await fetch(`${API_BASE}/turn/credentials`, {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });
    
    const data = await response.json();
    
    sessionStorage.setItem('napalmsky_turn_cache', JSON.stringify({
      iceServers: data.iceServers,
      fetchedAt: Date.now(),
    }));
    
    return data.iceServers;
  } catch (error) {
    console.error('[TURN] Fetch failed:', error);
    // Fallback to Google STUN
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }
}

