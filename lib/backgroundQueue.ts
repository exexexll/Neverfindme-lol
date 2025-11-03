/**
 * Background Queue Manager
 * Handles staying in matchmaking queue across pages
 * with idle detection and visibility monitoring
 */

import { Socket } from 'socket.io-client';

class BackgroundQueueManager {
  private socket: Socket | null = null;
  private inQueue = false;
  private lastActivity = Date.now();
  private visibilityCheckInterval: NodeJS.Timeout | null = null;
  private activityListeners: Array<{ event: string; handler: () => void }> = [];
  private visibilityTimeout: NodeJS.Timeout | null = null; // For tab hidden
  private blurTimeout: NodeJS.Timeout | null = null; // For window minimize
  private readonly GRACE_PERIOD = 60 * 1000; // 1 minute
  private profileComplete = false; // Cache profile check
  private callListenersSetup = false; // Track if global listeners are setup
  
  init(socket: Socket) {
    // Update socket reference (might be new socket after reconnect)
    this.socket = socket;
    
    // Setup visibility/activity detection only once
    if (this.activityListeners.length === 0) {
      this.setupVisibilityDetection();
      this.setupActivityDetection();
      console.log('[BackgroundQueue] Visibility and activity detection setup');
    }
    
    // Setup call listeners only once
    if (!this.callListenersSetup) {
      this.setupGlobalCallListeners();
    } else {
      console.log('[BackgroundQueue] Already initialized (call listeners active)');
    }
  }
  
  private setupGlobalCallListeners() {
    // NOTE: Socket call listeners are handled by GlobalCallHandler
    // Background queue only manages queue state (join/leave/sync)
    // No need for call listeners here - GlobalCallHandler persists across all pages
    
    this.callListenersSetup = true;
    console.log('[BackgroundQueue] Call listeners handled by GlobalCallHandler (no duplication)');
  }
  
  private setupVisibilityDetection() {
    // Check if tab is visible
    const handleVisibility = () => {
      if (document.hidden && this.inQueue) {
        // Clear any existing visibility timeout
        if (this.visibilityTimeout) {
          clearTimeout(this.visibilityTimeout);
        }
        
        console.log('[BackgroundQueue] Tab hidden, starting 1-minute countdown...');
        const startTime = Date.now();
        
        this.visibilityTimeout = setTimeout(() => {
          const elapsed = Date.now() - startTime;
          console.log('[BackgroundQueue] Visibility timeout fired after', elapsed, 'ms');
          
          if (document.hidden && this.inQueue) {
            console.log('[BackgroundQueue] ✅ Tab still hidden after 1 minute, leaving queue');
            this.leaveQueue();
          } else {
            console.log('[BackgroundQueue] Tab visible now, not leaving queue');
          }
        }, this.GRACE_PERIOD);
      } else if (!document.hidden) {
        // Tab visible again, cancel countdown
        if (this.visibilityTimeout) {
          console.log('[BackgroundQueue] Tab visible again, cancelling 1-minute countdown');
          clearTimeout(this.visibilityTimeout);
          this.visibilityTimeout = null;
        }
      }
    };
    
    // Check if window is focused
    const handleBlur = () => {
      if (this.inQueue) {
        // Clear any existing blur timeout
        if (this.blurTimeout) {
          clearTimeout(this.blurTimeout);
        }
        
        console.log('[BackgroundQueue] Window minimized/lost focus, starting 1-minute countdown...');
        const startTime = Date.now();
        
        this.blurTimeout = setTimeout(() => {
          const elapsed = Date.now() - startTime;
          console.log('[BackgroundQueue] Blur timeout fired after', elapsed, 'ms');
          
          if (this.inQueue) {
            console.log('[BackgroundQueue] ✅ Window still unfocused after 1 minute, leaving queue');
            this.leaveQueue();
          }
        }, this.GRACE_PERIOD);
      }
    };
    
    const handleFocus = () => {
      // Window focused again, cancel countdown
      if (this.blurTimeout) {
        console.log('[BackgroundQueue] Window focused again, cancelling 1-minute countdown');
        clearTimeout(this.blurTimeout);
        this.blurTimeout = null;
      }
    };
    
    // Add pagehide event for iOS/mobile devices
    const handlePageHide = () => {
      console.log('[BackgroundQueue] Page hidden (mobile/iOS), leaving queue immediately');
      this.leaveQueue();
    };
    
    // Add beforeunload for browser close
    const handleBeforeUnload = () => {
      console.log('[BackgroundQueue] Browser closing, leaving queue');
      this.leaveQueue();
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pagehide', handlePageHide); // iOS/mobile
    window.addEventListener('beforeunload', handleBeforeUnload); // Browser close
    
    this.activityListeners.push(
      { event: 'visibilitychange', handler: handleVisibility },
      { event: 'blur', handler: handleBlur },
      { event: 'focus', handler: handleFocus },
      { event: 'pagehide', handler: handlePageHide },
      { event: 'beforeunload', handler: handleBeforeUnload }
    );
  }
  
  private setupActivityDetection() {
    // Track user activity
    const activity = () => {
      this.lastActivity = Date.now();
    };
    
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, activity);
    });
    
    // Check every 30 seconds for idle users
    this.visibilityCheckInterval = setInterval(() => {
      const idle = Date.now() - this.lastActivity > 5 * 60 * 1000; // 5 minutes
      if (idle && this.inQueue) {
        console.log('[BackgroundQueue] User idle for 5 minutes, leaving queue');
        this.leaveQueue();
      }
    }, 30000);
  }
  
  async joinQueue() {
    console.log('[BackgroundQueue] ========== JOIN QUEUE CALLED ==========');
    console.log('[BackgroundQueue] Socket exists:', !!this.socket);
    console.log('[BackgroundQueue] Socket connected:', this.socket?.connected);
    console.log('[BackgroundQueue] Already in queue:', this.inQueue);
    console.log('[BackgroundQueue] Document hidden:', document.hidden);
    console.log('[BackgroundQueue] Background enabled:', this.isBackgroundEnabled());
    console.log('[BackgroundQueue] Current page:', typeof window !== 'undefined' ? window.location.pathname : 'unknown');
    
    if (!this.socket) {
      console.warn('[BackgroundQueue] ❌ No socket, cannot join queue');
      return;
    }
    
    if (!this.socket.connected) {
      console.warn('[BackgroundQueue] ❌ Socket not connected, cannot join queue');
      return;
    }
    
    // Check if tab is hidden or window not focused
    if (document.hidden) {
      console.log('[BackgroundQueue] ⚠️ Tab hidden, not joining queue');
      return;
    }
    
    // If background queue is disabled, only allow from /main
    if (!this.isBackgroundEnabled()) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/main') {
        console.log('[BackgroundQueue] ⚠️ Background disabled, not on /main, not joining');
        return;
      }
    }
    
    // Check cached profile completeness OR fetch if not cached
    if (!this.profileComplete) {
      const session = typeof window !== 'undefined' ? 
        JSON.parse(localStorage.getItem('bumpin_session') || 'null') : null;
      
      if (session) {
        try {
          const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
          const res = await fetch(`${API_BASE}/user/me`, {
            headers: { 'Authorization': `Bearer ${session.sessionToken}` },
          });
          
          if (res.ok) {
            const user = await res.json();
            
            // Check if profile is complete
            if (!user.selfieUrl || !user.videoUrl) {
              console.warn('[BackgroundQueue] Profile incomplete, cannot join queue');
              return;
            }
            
            // Cache for future calls
            this.profileComplete = true;
            console.log('[BackgroundQueue] Profile verified and cached');
          } else {
            console.warn('[BackgroundQueue] Failed to check profile');
            return;
          }
        } catch (err) {
          console.error('[BackgroundQueue] Error checking profile:', err);
          return;
        }
      }
    }
    
    console.log('[BackgroundQueue] ✅ Emitting presence:join and queue:join to server');
    // CRITICAL: Must emit BOTH presence:join (online) AND queue:join (available)
    this.socket.emit('presence:join');
    this.socket.emit('queue:join');
    this.inQueue = true;
    this.lastActivity = Date.now();
    console.log('[BackgroundQueue] ✅ Successfully joined queue, inQueue =', this.inQueue);
  }
  
  leaveQueue() {
    console.log('[BackgroundQueue] ========== LEAVE QUEUE CALLED ==========');
    console.log('[BackgroundQueue] Socket exists:', !!this.socket);
    console.log('[BackgroundQueue] Socket connected:', this.socket?.connected);
    console.log('[BackgroundQueue] Currently in queue:', this.inQueue);
    
    if (!this.socket) {
      console.warn('[BackgroundQueue] ❌ No socket, cannot leave queue');
      return;
    }
    
    if (!this.inQueue) {
      console.warn('[BackgroundQueue] ⚠️ Not in queue, nothing to leave');
      return;
    }
    
    console.log('[BackgroundQueue] ✅ Emitting queue:leave and presence:leave to server');
    // Emit BOTH queue:leave AND presence:leave
    this.socket.emit('queue:leave');
    this.socket.emit('presence:leave');
    this.inQueue = false;
    console.log('[BackgroundQueue] ✅ Left queue and presence, inQueue =', this.inQueue);
    console.log('[BackgroundQueue] ========================================');
  }
  
  // Force sync queue state with toggle
  syncWithToggle(toggleState: boolean) {
    console.log('[BackgroundQueue] ========== SYNC WITH TOGGLE ==========');
    console.log('[BackgroundQueue] Toggle state:', toggleState);
    console.log('[BackgroundQueue] Currently in queue:', this.inQueue);
    console.log('[BackgroundQueue] Socket exists:', !!this.socket);
    console.log('[BackgroundQueue] Socket connected:', this.socket?.connected);
    
    if (toggleState && !this.inQueue) {
      console.log('[BackgroundQueue] ✅ Action: Toggle ON but not in queue, joining...');
      this.joinQueue();
    } else if (!toggleState && this.inQueue) {
      console.log('[BackgroundQueue] ✅ Action: Toggle OFF but in queue, leaving...');
      this.leaveQueue();
    } else if (toggleState && this.inQueue) {
      console.log('[BackgroundQueue] ℹ️ Already in queue, no action needed');
    } else {
      console.log('[BackgroundQueue] ℹ️ Already out of queue, no action needed');
    }
    console.log('[BackgroundQueue] ========================================');
  }
  
  isBackgroundEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('bumpin_background_queue') === 'true';
  }
  
  isInQueue(): boolean {
    return this.inQueue;
  }
  
  cleanup() {
    console.log('[BackgroundQueue] Cleanup');
    
    // Clear intervals
    if (this.visibilityCheckInterval) {
      clearInterval(this.visibilityCheckInterval);
      this.visibilityCheckInterval = null;
    }
    
    // Clear all timers
    if (this.visibilityTimeout) {
      clearTimeout(this.visibilityTimeout);
      this.visibilityTimeout = null;
    }
    
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
      this.blurTimeout = null;
    }
    
    // Leave queue
    this.leaveQueue();
    
    // Remove socket listeners (keep them active for background queue)
    // Don't remove call:notify and call:start - they need to persist
    // this.socket?.off('call:notify');
    // this.socket?.off('call:start');
    
    // Remove event listeners
    this.activityListeners.forEach(({ event, handler }) => {
      if (event === 'visibilitychange' || event === 'pagehide') {
        document.removeEventListener(event, handler);
      } else {
        window.removeEventListener(event, handler);
      }
    });
    this.activityListeners = [];
    
    // Reset cache
    this.profileComplete = false;
  }
}

// Singleton instance
export const backgroundQueue = new BackgroundQueueManager();

