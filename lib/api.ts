/**
 * API client functions for Napalm Sky
 * Production-ready with centralized configuration
 */

import { API_BASE } from './config';

export async function createGuestAccount(name: string, gender: string, referralCode?: string, inviteCode?: string, email?: string) {
  const res = await fetch(`${API_BASE}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, gender, referralCode, inviteCode, email }),
  });

  if (!res.ok) {
    const error = await res.json();
    // Pass through requiresUSCEmail flag
    const err: any = new Error(error.error || 'Failed to create account');
    err.requiresUSCEmail = error.requiresUSCEmail;
    throw err;
  }

  return res.json();
}

export async function linkAccount(sessionToken: string, email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken, email, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to link account');
  }

  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Login failed');
  }

  return res.json();
}

export async function uploadSelfie(sessionToken: string, blob: Blob) {
  const formData = new FormData();
  formData.append('selfie', blob, 'selfie.jpg');

  const res = await fetch(`${API_BASE}/media/selfie`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Upload failed');
  }

  return res.json();
}

export async function uploadVideo(sessionToken: string, blob: Blob, onProgress?: (percent: number) => void) {
  // Ensure blob has correct MIME type by creating a new blob if needed
  const videoBlob = blob.type.startsWith('video/') 
    ? blob 
    : new Blob([blob], { type: 'video/webm' });
  
  console.log('[Upload] Video size:', (videoBlob.size / 1024 / 1024).toFixed(2), 'MB');
  
  const formData = new FormData();
  formData.append('video', videoBlob, 'intro.webm');

  // OPTIMIZATION: Use XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
        console.log('[Upload] Progress:', percent, '%');
      }
    });
    
    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject(new Error('Invalid response format'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch (e) {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });
    
    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload cancelled'));
    });
    
    // Send request
    xhr.open('POST', `${API_BASE}/media/video`);
    xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
    xhr.send(formData);
  });
}

export async function getCurrentUser(sessionToken: string) {
  const res = await fetch(`${API_BASE}/user/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch user data');
  }

  return res.json();
}

export async function generateReferralLink(sessionToken: string, targetUserId: string) {
  const res = await fetch(`${API_BASE}/referral/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetUserId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to generate referral link');
  }

  return res.json();
}

export async function getReferralInfo(code: string) {
  const res = await fetch(`${API_BASE}/referral/info/${code}`);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Invalid referral code');
  }

  return res.json();
}

export async function getTargetStatus(code: string) {
  const res = await fetch(`${API_BASE}/referral/target-status/${code}`);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get target status');
  }

  return res.json();
}

export async function directMatch(sessionToken: string, referralCode: string) {
  const res = await fetch(`${API_BASE}/referral/direct-match`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ referralCode }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to direct match');
  }

  return res.json();
}

export async function getMyIntroductions(sessionToken: string) {
  const res = await fetch(`${API_BASE}/referral/my-introductions`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get introductions');
  }

  return res.json();
}

export async function getReferralNotifications(sessionToken: string) {
  const res = await fetch(`${API_BASE}/referral/notifications`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch notifications');
  }

  return res.json();
}

export async function markNotificationRead(sessionToken: string, notificationId: string) {
  const res = await fetch(`${API_BASE}/referral/notifications/${notificationId}/read`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to mark notification as read');
  }

  return res.json();
}

// ===== Report & Ban System =====

export async function reportUser(sessionToken: string, reportedUserId: string, reason?: string, roomId?: string) {
  const res = await fetch(`${API_BASE}/report/user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reportedUserId, reason, roomId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to report user');
  }

  return res.json();
}

export async function checkBanStatus(sessionToken: string) {
  const res = await fetch(`${API_BASE}/report/check-ban`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to check ban status');
  }

  return res.json();
}

export async function getPendingReviews(sessionToken: string) {
  const res = await fetch(`${API_BASE}/report/pending`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get pending reviews');
  }

  return res.json();
}

export async function getAllReports(sessionToken: string) {
  const res = await fetch(`${API_BASE}/report/all`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get all reports');
  }

  return res.json();
}

export async function reviewBan(sessionToken: string, userId: string, decision: 'permanent' | 'vindicated') {
  const res = await fetch(`${API_BASE}/report/review/${userId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ decision }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to review ban');
  }

  return res.json();
}

export async function getBlacklist() {
  const res = await fetch(`${API_BASE}/report/blacklist`);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get blacklist');
  }

  return res.json();
}

export async function getReportStats(sessionToken: string) {
  const res = await fetch(`${API_BASE}/report/stats`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get report stats');
  }

  return res.json();
}

// ===== Event Mode System =====

/**
 * Get current event status (public endpoint)
 */
export async function getEventStatus(sessionToken?: string) {
  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const res = await fetch(`${API_BASE}/event/status`, { headers });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get event status');
  }

  return res.json();
}

/**
 * Get event settings (public, read-only)
 */
export async function getEventSettings() {
  const res = await fetch(`${API_BASE}/event/settings`);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get event settings');
  }

  return res.json();
}

/**
 * Submit or update user's RSVP
 */
export async function submitEventRSVP(
  sessionToken: string,
  preferredTime: string,
  eventDate: string
) {
  const res = await fetch(`${API_BASE}/event/rsvp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preferredTime, eventDate }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to submit RSVP');
  }

  return res.json();
}

/**
 * Get user's RSVP for a specific date
 */
export async function getUserRSVP(sessionToken: string, date: string) {
  const res = await fetch(`${API_BASE}/event/rsvp/${date}`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get RSVP');
  }

  return res.json();
}

/**
 * Get attendance data for a specific date
 */
export async function getEventAttendance(date: string) {
  const res = await fetch(`${API_BASE}/event/attendance/${date}`);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get attendance data');
  }

  return res.json();
}

// ===== Admin Event APIs =====

/**
 * Get event settings (admin)
 */
export async function getAdminEventSettings(sessionToken: string) {
  const res = await fetch(`${API_BASE}/admin/event/settings`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get event settings');
  }

  return res.json();
}

/**
 * Update event settings (admin only)
 */
export async function updateEventSettings(
  sessionToken: string,
  settings: {
    eventModeEnabled?: boolean;
    eventStartTime?: string;
    eventEndTime?: string;
    timezone?: string;
    eventDays?: number[];
    eventTitle?: string;
    eventBannerText?: string;
  }
) {
  const res = await fetch(`${API_BASE}/admin/event/settings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update event settings');
  }

  return res.json();
}

/**
 * Get attendance for a specific date (admin)
 */
export async function getAdminEventAttendance(sessionToken: string, date: string) {
  const res = await fetch(`${API_BASE}/admin/event/attendance/${date}`, {
    headers: {
      'Authorization': `Bearer ${sessionToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get attendance data');
  }

  return res.json();
}

