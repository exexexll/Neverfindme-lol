/**
 * Matchmaking API client functions
 * Production-ready with centralized configuration
 */

import { API_BASE } from './config';

export interface ReelUser {
  userId: string;
  name: string;
  gender: 'female' | 'male' | 'nonbinary' | 'unspecified';
  selfieUrl?: string;
  videoUrl?: string;
  hasCooldown?: boolean;
  cooldownExpiry?: number | null;
  wasIntroducedToMe?: boolean;
  introducedBy?: string | null;
  // Location-based (optional)
  distance?: number | null; // meters
  hasLocation?: boolean;
}

export interface ReelResponse {
  items: ReelUser[];
  cursor: string;
  hasMore: boolean;
}

export interface QueueResponse {
  users: ReelUser[];
  totalAvailable: number;
}

export async function getReel(sessionToken: string, cursor?: string, limit: number = 20): Promise<ReelResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (cursor) {
    params.append('cursor', cursor);
  }

  console.log('[API] Fetching reel:', { cursor, limit });

  const res = await fetch(`${API_BASE}/room/reel?${params}`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    console.error('[API] Reel error:', res.status, error);
    throw new Error(error.error || `Failed to fetch reel (${res.status})`);
  }

  const data = await res.json();
  console.log('[API] Reel loaded:', data.items.length, 'users');
  return data;
}

export async function getQueue(sessionToken: string): Promise<QueueResponse> {
  const res = await fetch(`${API_BASE}/room/queue`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch queue');
  }

  const data = await res.json();
  console.log('[API] Queue loaded:', data.users.length, 'users shown,', data.totalAvailable, 'total available');
  return data;
}

