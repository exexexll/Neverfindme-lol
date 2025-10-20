/**
 * WebRTC Server Load Optimizer
 * Reduces TURN API calls and signaling overhead
 */

/**
 * Optimize SDP (Session Description Protocol) to reduce signaling size
 * Removes unnecessary candidates and attributes
 */
export function optimizeSDP(sdp: string): string {
  // Remove duplicate ICE candidates
  const lines = sdp.split('\r\n');
  const seen = new Set<string>();
  const optimized: string[] = [];
  
  for (const line of lines) {
    // Keep only unique ICE candidates
    if (line.startsWith('a=candidate:')) {
      if (!seen.has(line)) {
        seen.add(line);
        optimized.push(line);
      }
    } else {
      optimized.push(line);
    }
  }
  
  return optimized.join('\r\n');
}

/**
 * Determine if TURN is needed based on network conditions
 * Try STUN-only first to save TURN bandwidth
 */
export async function shouldUseTurn(localCandidates: RTCIceCandidate[]): Promise<boolean> {
  // Check if we have srflx (STUN-discovered) candidates
  const hasSrflx = localCandidates.some(c => c.type === 'srflx');
  
  // Check previous call success with STUN-only
  const lastCallMethod = sessionStorage.getItem('napalmsky_last_call_method');
  const stunOnlySuccess = lastCallMethod === 'stun';
  
  // If STUN worked before and we have srflx candidates, try STUN first
  if (stunOnlySuccess && hasSrflx) {
    console.log('[Optimizer] STUN-only mode (previous success)');
    return false;
  }
  
  // Conservative: Use TURN by default
  return true;
}

/**
 * Track call connection method for future optimization
 */
export function trackCallSuccess(usedTurn: boolean): void {
  const method = usedTurn ? 'turn' : 'stun';
  sessionStorage.setItem('napalmsky_last_call_method', method);
  console.log('[Optimizer] Call succeeded with:', method);
}

/**
 * Batch TURN credential requests
 * Request once, use for multiple potential calls
 */
let batchedCredentials: {
  iceServers: RTCIceServer[];
  fetchedAt: number;
  usesRemaining: number;
} | null = null;

export async function getBatchedTurnCredentials(
  sessionToken: string,
  apiBase: string
): Promise<RTCIceServer[]> {
  // Check batched credentials
  if (batchedCredentials && batchedCredentials.usesRemaining > 0) {
    const age = Date.now() - batchedCredentials.fetchedAt;
    if (age < 3300000) { // < 55 min
      batchedCredentials.usesRemaining--;
      console.log('[Optimizer] Using batched credentials (', 
                 batchedCredentials.usesRemaining, 'uses left)');
      return batchedCredentials.iceServers;
    }
  }
  
  // Fetch new batch (good for 3 calls or 55 minutes)
  const response = await fetch(`${apiBase}/turn/credentials`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  
  const data = await response.json();
  
  batchedCredentials = {
    iceServers: data.iceServers,
    fetchedAt: Date.now(),
    usesRemaining: 2, // Can be used for 2 more calls
  };
  
  console.log('[Optimizer] Fetched batch credentials (good for 3 calls)');
  return data.iceServers;
}

/**
 * Calculate optimal bandwidth limit based on available upload
 * Prevents oversaturation
 */
export async function getOptimalBandwidth(): Promise<number> {
  // Estimate available bandwidth (simplified)
  // In production, use navigator.connection.downlink
  const connection = (navigator as any).connection;
  
  if (connection && connection.effectiveType) {
    const effectiveType = connection.effectiveType;
    
    switch (effectiveType) {
      case 'slow-2g': return 50000; // 50 kbps
      case '2g': return 250000; // 250 kbps
      case '3g': return 750000; // 750 kbps
      case '4g': return 2000000; // 2 Mbps
      default: return 1500000; // 1.5 Mbps default
    }
  }
  
  // Fallback: Conservative 1.5 Mbps
  return 1500000;
}

