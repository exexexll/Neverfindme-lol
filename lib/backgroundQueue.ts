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
    this.socket = socket;
    this.setupVisibilityDetection();
    this.setupActivityDetection();
    this.setupGlobalCallListeners();
    console.log('[BackgroundQueue] Initialized');
  }
  
  private setupGlobalCallListeners() {
    if (!this.socket || this.callListenersSetup) return;
    
    console.log('[BackgroundQueue] Setting up global call listeners for background queue');
    
    // Listen for incoming calls while in background queue
    this.socket.on('call:notify', (data: any) => {
      console.log('[BackgroundQueue] ✅ Received call notification while in background queue');
      console.log('[BackgroundQueue] From:', data.fromUser?.name);
      console.log('[BackgroundQueue] Current page:', typeof window !== 'undefined' ? window.location.pathname : 'unknown');
      
      // Emit custom event that main page can listen to
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('backgroundqueue:call', { detail: data }));
      }
    });
    
    this.socket.on('call:start', (data: any) => {
      console.log('[BackgroundQueue] ✅ Received call:start while in background queue');
      console.log('[BackgroundQueue] Room:', data.roomId);
      
      // Emit custom event that main page can listen to
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('backgroundqueue:callstart', { detail: data }));
      }
    });
    
    this.callListenersSetup = true;
    console.log('[BackgroundQueue] Global call listeners active');
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
    if (!this.socket) {
      console.warn('[BackgroundQueue] No socket, cannot join queue');
      return;
    }
    
    // Check if tab is hidden or window not focused
    if (document.hidden) {
      console.log('[BackgroundQueue] Tab hidden, not joining queue');
      return;
    }
    
    // If background queue is disabled, only allow from /main
    if (!this.isBackgroundEnabled()) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/main') {
        console.log('[BackgroundQueue] Background disabled, not on /main, not joining');
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
    
    console.log('[BackgroundQueue] Joining queue');
    this.socket.emit('queue:join');
    this.inQueue = true;
    this.lastActivity = Date.now();
  }
  
  leaveQueue() {
    if (!this.socket || !this.inQueue) return;
    
    console.log('[BackgroundQueue] Leaving queue');
    this.socket.emit('queue:leave');
    this.inQueue = false;
  }
  
  // Force sync queue state with toggle
  syncWithToggle(toggleState: boolean) {
    if (toggleState && !this.inQueue) {
      console.log('[BackgroundQueue] Syncing: Toggle ON but not in queue, joining...');
      this.joinQueue();
    } else if (!toggleState && this.inQueue) {
      console.log('[BackgroundQueue] Syncing: Toggle OFF but in queue, leaving...');
      this.leaveQueue();
    }
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

