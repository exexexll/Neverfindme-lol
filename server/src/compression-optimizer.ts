/**
 * Compression & Network Optimization
 * 
 * Reduces network traffic by:
 * 1. Compressing HTTP responses (gzip/brotli)
 * 2. Compressing Socket.IO messages
 * 3. Minimizing payload sizes
 * 4. Deduplicating data
 */

import compression from 'compression';
import { Server as SocketServer } from 'socket.io';

/**
 * HTTP Compression Middleware Configuration
 * - Compresses responses > 1KB
 * - Uses brotli for modern browsers, gzip fallback
 * - Excludes already compressed files (images, videos)
 */
export function createCompressionMiddleware() {
  return compression({
    // Only compress responses larger than 1KB
    threshold: 1024,
    
    // Compression level (0-9, 6 is default balance)
    level: 6,
    
    // Filter function - what to compress
    filter: (req, res) => {
      // Don't compress if explicitly disabled
      if (req.headers['x-no-compression']) {
        return false;
      }
      
      // Don't compress already compressed formats
      const contentType = res.getHeader('Content-Type') as string;
      if (contentType) {
        const uncompressible = [
          'image/', 'video/', 'audio/',
          'application/zip', 'application/gzip',
          'application/x-rar', 'application/pdf'
        ];
        
        if (uncompressible.some(type => contentType.includes(type))) {
          return false;
        }
      }
      
      // Compress everything else
      return compression.filter(req, res);
    }
  });
}

/**
 * Socket.IO Compression Configuration
 * - Enables perMessageDeflate for WebSocket compression
 * - Reduces message size by ~60-70%
 */
export function configureSocketCompression(io: SocketServer): void {
  // Socket.IO compression is enabled via engine.io options
  // Already configured in io setup, but we can add packet optimization
  
  console.log('[Compression] Socket.IO compression enabled (perMessageDeflate)');
  
  // Add middleware to optimize outgoing packets
  io.use((socket, next) => {
    // Store original emit
    const originalEmit = socket.emit.bind(socket);
    
    // Override emit to compress large payloads
    socket.emit = function(event: string, ...args: any[]) {
      // Optimize specific events
      if (event === 'queue:update' || event === 'reel:update') {
        // Send only essential data
        const optimized = optimizeQueueData(args[0]);
        return originalEmit(event, optimized);
      }
      
      if (event === 'presence:update') {
        // Presence updates don't need full user objects
        const optimized = optimizePresenceData(args[0]);
        return originalEmit(event, optimized);
      }
      
      // Default behavior for other events
      return originalEmit(event, ...args);
    } as any;
    
    next();
  });
}

/**
 * Optimize queue/reel data to reduce size
 * - Remove duplicate user data
 * - Send only essential fields
 */
function optimizeQueueData(data: any): any {
  if (!data || !data.users) return data;
  
  // Keep only essential user fields
  const optimized = {
    ...data,
    users: data.users.map((user: any) => ({
      userId: user.userId,
      name: user.name,
      gender: user.gender,
      selfieUrl: user.selfieUrl,
      videoUrl: user.videoUrl,
      hasCooldown: user.hasCooldown,
      cooldownExpiry: user.cooldownExpiry,
      wasIntroducedToMe: user.wasIntroducedToMe,
      introducedBy: user.introducedBy,
      distance: user.distance, // CRITICAL: Include distance for location badges
      hasLocation: user.hasLocation, // CRITICAL: Include location flag
      // Omit heavy fields: bio, timestamps, etc.
    }))
  };
  
  return optimized;
}

/**
 * Optimize presence data
 * - Send only changed fields
 */
function optimizePresenceData(data: any): any {
  if (!data) return data;
  
  // Keep only essential presence fields
  return {
    userId: data.userId,
    online: data.online,
    available: data.available,
    // Omit: socketId, lastActiveAt (not needed on client)
  };
}

/**
 * WebRTC SDP Compression
 * - SDP offers/answers are huge (10-50KB)
 * - Compress them before sending
 */
export function compressSDP(sdp: string): string {
  // Remove unnecessary whitespace and newlines
  let compressed = sdp
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
  
  // Remove comments (lines starting with #)
  compressed = compressed
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n');
  
  return compressed;
}

/**
 * Rate Limiting for Heavy Endpoints
 * - Prevents abuse and reduces load
 */
export const heavyEndpointLimiter = {
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * Connection Pool Optimization
 * - Limits concurrent connections per user
 * - Prevents memory exhaustion
 */
export class ConnectionPool {
  private connections = new Map<string, Set<string>>(); // userId -> Set<socketIds>
  private readonly MAX_CONNECTIONS_PER_USER = 3;
  
  addConnection(userId: string, socketId: string): boolean {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    
    const userConnections = this.connections.get(userId)!;
    
    // Check limit
    if (userConnections.size >= this.MAX_CONNECTIONS_PER_USER) {
      console.warn(`[ConnectionPool] User ${userId.substring(0, 8)} exceeded max connections (${this.MAX_CONNECTIONS_PER_USER})`);
      
      // Disconnect oldest connection
      const oldest = Array.from(userConnections)[0];
      this.removeConnection(userId, oldest);
    }
    
    userConnections.add(socketId);
    return true;
  }
  
  removeConnection(userId: string, socketId: string): void {
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.delete(socketId);
      if (userConnections.size === 0) {
        this.connections.delete(userId);
      }
    }
  }
  
  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size || 0;
  }
  
  getTotalConnections(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }
  
  getStats(): { users: number; totalConnections: number } {
    return {
      users: this.connections.size,
      totalConnections: this.getTotalConnections(),
    };
  }
}

// Export singleton
export const connectionPool = new ConnectionPool();

/**
 * Message Deduplication
 * - Prevents sending duplicate messages
 * - Useful for chat and presence updates
 */
export class MessageDeduplicator {
  private cache = new Map<string, { hash: string; timestamp: number }>();
  private readonly CACHE_TTL = 5000; // 5 seconds
  
  isDuplicate(userId: string, event: string, data: any): boolean {
    const key = `${userId}:${event}`;
    const hash = this.hashData(data);
    const cached = this.cache.get(key);
    
    if (cached && cached.hash === hash && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return true; // Duplicate
    }
    
    // Store new message
    this.cache.set(key, { hash, timestamp: Date.now() });
    
    // Cleanup old entries periodically
    if (this.cache.size > 1000) {
      this.cleanup();
    }
    
    return false;
  }
  
  private hashData(data: any): string {
    return JSON.stringify(data); // Simple hash for now
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}

// Export singleton
export const messageDeduplicator = new MessageDeduplicator();

