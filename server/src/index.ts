// Load environment variables FIRST before any other imports
import 'dotenv/config';

// Force Railway rebuild - Security features deployment
// Build timestamp: 2025-10-18T04:45:00Z

import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { store } from './store';
import { createAuthRoutes } from './auth';
import mediaRoutes, { deleteFromCloudinary } from './media';
import roomRoutes from './room';
import userRoutes from './user';
import referralRoutes from './referral';
import reportRoutes from './report';
import paymentRoutes from './payment';
import turnRoutes from './turn';
import adminAuthRoutes from './admin-auth';
import eventRoutes from './event';
import { createEventAdminRoutes } from './event-admin';
import { requireEventAccess } from './event-guard';
import { authLimiter, apiLimiter, turnLimiter, paymentLimiter, reportLimiter, rsvpLimiter, eventPublicLimiter } from './rate-limit';
import verificationRoutes from './verification';
import locationRoutes from './location';
import { securityHeaders, httpsRedirect } from './security-headers';
import { memoryManager } from './memory-manager';
import { 
  createCompressionMiddleware, 
  configureSocketCompression,
  connectionPool 
} from './compression-optimizer';
import {
  advancedConnectionManager,
  configureRedisAdapter,
  presenceOptimizer,
} from './advanced-optimizer';
import { userCache, sessionCache } from './lru-cache';
import { queryCache } from './query-cache';
import { 
  checkMessageRateLimit, 
  sanitizeMessageContent, 
  validateMessage, 
  saveChatMessage,
  getRoomMessages,
  markMessageRead 
} from './text-chat';

const app = express();
const server = http.createServer(app);

// Socket.io with environment-based CORS
const socketOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

const io = new SocketServer(server, {
  cors: {
    origin: socketOrigins,
    credentials: true,
  },
  // Enable WebSocket compression for ~60% bandwidth reduction
  perMessageDeflate: {
    threshold: 1024, // Compress messages > 1KB
    zlibDeflateOptions: {
      chunkSize: 8 * 1024,
      level: 6, // Compression level (0-9, 6 is balanced)
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    }
  },
  // Limit max HTTP buffer size to prevent memory issues
  maxHttpBufferSize: 1e6, // 1 MB (enough for signaling, not huge files)
  // Ping timeout and interval for connection health
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Socket.io Authentication Middleware
// Authenticate connections BEFORE accepting them (security improvement)
// For backward compatibility, this is optional - full auth happens in 'auth' event
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    // Allow connection but mark as not pre-authenticated
    console.log('[Socket.io] Connection without pre-auth token - will auth via event');
    (socket as any).userId = null;
    return next();
  }
  
  const session = await store.getSession(token);
  if (!session) {
    console.warn('[Socket.io] Invalid pre-auth token - will retry via event');
    (socket as any).userId = null;
    return next();
  }
  
  // Check if user is banned
  if (store.isUserBanned(session.userId)) {
    console.warn(`[Socket.io] Connection rejected - user ${session.userId} is banned`);
    return next(new Error('Account suspended'));
  }
  
  // Attach userId to socket for use in event handlers
  (socket as any).userId = session.userId;
  console.log(`[Socket.io] Pre-authenticated connection for user ${session.userId.substring(0, 8)}`);
  next();
});

const PORT = process.env.PORT || 3001;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Trust proxy for cloud deployment (required for correct IP detection)
app.set('trust proxy', true);

// Centralized IP extraction function
function getClientIp(req: any): string {
  // Priority order: x-forwarded-for (proxy) > req.ip > socket address > unknown
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list, take the first one
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Middleware
// HTTP Compression - MUST be before other middleware
app.use(createCompressionMiddleware());

// CORS with environment-based origin configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow main domains
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    
    // Allow Vercel preview deployments (for testing)
    if (origin.includes('vercel.app') || origin.includes('hansons-projects')) {
      console.log('[CORS] Allowing Vercel preview:', origin);
      callback(null, true);
      return;
    }
    
    console.warn(`[CORS] Rejected request from unauthorized origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Security headers (OWASP best practices)
app.use(securityHeaders);
app.use(httpsRedirect);

// JSON parsing middleware - EXCEPT for Stripe webhook (needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/payment/webhook') {
    next(); // Skip JSON parsing for webhook
  } else {
    express.json()(req, res, next);
  }
});

// IP tracking middleware - track user IPs for ban enforcement
app.use((req, res, next) => {
  const ip = getClientIp(req);
  
  // Check if IP is banned
  const ipBan = store.isIpBanned(ip);
  if (ipBan) {
    console.log(`[Security] 🚫 Blocked request from banned IP: ${ip}`);
    return res.status(403).json({
      error: 'Access denied',
      banned: true,
      message: 'Your IP address has been banned from accessing this service.',
      reason: ipBan.reason,
    });
  }
  
  // Attach IP to request for later use
  (req as any).userIp = ip;
  next();
});

// Serve uploaded files (cloud seam: replace with CDN in production)
app.use('/uploads', express.static(uploadsDir));

// Socket.io state (must be declared before routes that need it)
const activeSockets = new Map<string, string>(); // userId -> socketId
const activeRooms = new Map<string, { user1: string; user2: string; messages: any[]; startedAt: number; duration: number }>(); // roomId -> room data

// Routes with rate limiting and dependency injection
app.use('/auth', authLimiter, createAuthRoutes(io, activeSockets));
app.use('/media', apiLimiter, mediaRoutes);
// IMPORTANT: Do NOT apply event guard to /room routes
// Video chat rooms must always work (only block queue/matchmaking)
// Event guard is selectively applied in room.ts to specific routes
app.use('/room', apiLimiter, roomRoutes);
app.use('/user', apiLimiter, userRoutes);
app.use('/referral', apiLimiter, referralRoutes);
app.use('/report', reportLimiter, reportRoutes);
// CRITICAL FIX: Don't apply rate limiter to /payment routes (interferes with Stripe webhook)
app.use('/payment', paymentRoutes);
app.use('/turn', turnLimiter, turnRoutes);
app.use('/admin', authLimiter, adminAuthRoutes);
app.use('/verification', apiLimiter, verificationRoutes);
app.use('/location', apiLimiter, locationRoutes);
// EVENT MODE: Public event endpoints with rate limiting (SECURITY: prevent scraping)
app.use('/event/attendance', eventPublicLimiter);
app.use('/event/settings', eventPublicLimiter);
app.use('/event/status', eventPublicLimiter);
// EVENT MODE: Event routes for users (includes RSVP with proper rate limiting)
app.use('/event', apiLimiter, eventRoutes);
// EVENT MODE: Admin event routes (integrated with admin auth)
app.use('/admin', authLimiter, createEventAdminRoutes(io));

// Root endpoint - API information
app.get('/', (req, res) => {
  res.json({
    name: 'Napalm Sky API',
    version: '1.0.0',
    status: 'running',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      auth: '/auth/*',
      user: '/user/*',
      matchmaking: '/room/queue',
      payment: '/payment/*',
      admin: '/admin/*',
    },
    databases: {
      postgresql: process.env.DATABASE_URL ? 'connected' : 'not configured',
      redis: process.env.REDIS_URL ? 'connected' : 'not configured',
    },
    message: 'Napalm Sky Backend API - For frontend integration only'
  });
});

// Health check with comprehensive stats for 3000-4000 user scale
app.get('/health', (req, res) => {
  const memory = memoryManager.getCurrentMemory();
  const connStats = advancedConnectionManager.getStats();
  const userCacheStats = (userCache as any).getStats();
  const sessionCacheStats = (sessionCache as any).getStats();
  const queryCacheStats = (queryCache as any).getStats(); // NEW: Query cache monitoring
  
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    memory: {
      heapUsed: `${memory.heapUsed.toFixed(2)} MB`,
      heapTotal: `${memory.heapTotal.toFixed(2)} MB`,
      rss: `${memory.rss.toFixed(2)} MB`,
      usage: `${((memory.heapUsed / memory.heapTotal) * 100).toFixed(1)}%`,
    },
    connections: {
      users: connStats.users,
      total: connStats.connections,
      avgPerUser: connStats.avgPerUser,
      limit: connStats.limit,
      utilization: connStats.utilization,
    },
    cache: {
      users: userCacheStats,
      sessions: sessionCacheStats,
      queries: queryCacheStats, // NEW: Monitor query cache performance
    },
    scalability: {
      currentCapacity: `${connStats.users} users`,
      maxCapacity: '4000 users single-instance (10,000+ with Redis)',
      optimization: 'Multi-tier caching + query cache + compression enabled',
    },
  });
});

// Live stats (public endpoint)
app.get('/stats/live', (req, res) => {
  // Count only online users (not just available)
  const allPresence = Array.from(store['presence'].values());
  const onlineCount = allPresence.filter(p => p.online).length;
  
  res.json({
    onlineUsers: onlineCount,
    timestamp: Date.now(),
  });
});

// Configure Socket.IO compression and optimization
configureSocketCompression(io);

// Configure Redis adapter for horizontal scaling (if available)
configureRedisAdapter(io).catch((err) => {
  console.warn('[Server] Redis adapter setup failed, using single-instance mode:', err.message);
});

// Start memory manager
console.log('[Server] Starting memory manager...');
memoryManager.start();

// Start background stale user cleanup (every 30 seconds)
setInterval(() => {
  const now = Date.now();
  const STALE_THRESHOLD = 60000; // Must match store.ts threshold - 60s
  let cleanedCount = 0;
  
  // Get all presence entries from store
  const allPresence = Array.from(store['presence'].entries());
  
  for (const [userId, presence] of allPresence) {
    // If user has heartbeat and it's stale, mark offline
    if (presence.lastHeartbeat && (now - presence.lastHeartbeat) > STALE_THRESHOLD) {
      console.warn(`[Cleanup] Marking stale user ${userId.substring(0, 8)} offline (no heartbeat in ${Math.floor((now - presence.lastHeartbeat) / 1000)}s)`);
      
      store.updatePresence(userId, {
        online: false,
        available: false,
      });
      
      // Broadcast offline status
      io.emit('presence:update', {
        userId,
        online: false,
        available: false,
      });
      
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[Cleanup] 🧹 Marked ${cleanedCount} stale users as offline`);
  }
}, 30000); // Run every 30 seconds

console.log('[Server] Stale user cleanup started (every 30s)');

// Cleanup unpaid user uploads (every 6 hours)
setInterval(async () => {
  console.log('[Cleanup] Starting unpaid user upload cleanup...');
  
  try {
    // Find all users with uploads but unpaid status
    if (store['useDatabase']) {
      const result = await require('./database').query(
        `SELECT user_id, selfie_url, video_url, paid_status, created_at 
         FROM users 
         WHERE paid_status = 'unpaid' 
         AND (selfie_url IS NOT NULL OR video_url IS NOT NULL)
         AND created_at < NOW() - INTERVAL '24 hours'`
      );
      
      for (const row of result.rows) {
        const userId = row.user_id;
        console.log(`[Cleanup] Found unpaid user with uploads: ${userId.substring(0, 8)} (${Math.floor((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60))}h old)`);
        
        // Delete from Cloudinary
        if (row.selfie_url && row.selfie_url.includes('cloudinary')) {
          const deleted = await deleteFromCloudinary(row.selfie_url);
          if (deleted) {
            await store.updateUser(userId, { selfieUrl: undefined });
            console.log(`[Cleanup] ✅ Deleted unpaid user selfie: ${userId.substring(0, 8)}`);
          }
        }
        
        if (row.video_url && row.video_url.includes('cloudinary')) {
          const deleted = await deleteFromCloudinary(row.video_url);
          if (deleted) {
            await store.updateUser(userId, { videoUrl: undefined });
            console.log(`[Cleanup] ✅ Deleted unpaid user video: ${userId.substring(0, 8)}`);
          }
        }
      }
      
      if (result.rows.length > 0) {
        console.log(`[Cleanup] 🧹 Cleaned up ${result.rows.length} unpaid user uploads`);
      }
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning unpaid uploads:', error);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours

console.log('[Server] Unpaid upload cleanup started (every 6 hours)');

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Support both pre-authenticated (via middleware) and post-authenticated (via event) flows
  let currentUserId: string | null = (socket as any).userId || null;

  // If pre-authenticated, set up presence immediately
  if (currentUserId) {
    // Track connection in ADVANCED pool (supports 1000 users)
    const allowed = advancedConnectionManager.addConnection(currentUserId, socket.id);
    if (!allowed) {
      console.error('[Connection] Global connection limit reached, rejecting connection');
      socket.emit('error', { message: 'Server at capacity, please try again shortly' });
      socket.disconnect(true);
      return;
    }
    
    activeSockets.set(currentUserId, socket.id);
    store.setPresence(currentUserId, {
      socketId: socket.id,
      online: true,
      available: false,
      lastActiveAt: Date.now(),
      lastHeartbeat: Date.now(), // Initialize heartbeat
    });
    console.log(`[Connection] User ${currentUserId.substring(0, 8)} pre-authenticated and marked online`);
    
    // CRITICAL: Emit auth:success for pre-authenticated users
    // This triggers frontend to join queue (presence:join, queue:join)
    socket.emit('auth:success');
    console.log(`[Connection] ✅ Emitted auth:success for pre-authenticated user`);
  }

  // Authenticate socket connection (for clients that don't use handshake auth)
  socket.on('auth', async ({ sessionToken }) => {
    const session = await store.getSession(sessionToken);
    if (session) {
      // Check if user is banned
      if (store.isUserBanned(session.userId)) {
        console.log(`[Security] 🚫 Banned user ${session.userId} attempted socket connection`);
        socket.emit('auth:banned', {
          message: 'Your account has been suspended.',
          banned: true,
        });
        socket.disconnect(true);
        return;
      }

      // Set currentUserId if not already set by middleware
      if (!currentUserId) {
        currentUserId = session.userId;
        
        // Track connection in ADVANCED pool (supports 1000 users)
        const allowed = advancedConnectionManager.addConnection(session.userId, socket.id);
        if (!allowed) {
          console.error('[Connection] Global connection limit reached, rejecting auth');
          socket.emit('error', { message: 'Server at capacity, please try again shortly' });
          socket.disconnect(true);
          return;
        }
        
        activeSockets.set(session.userId, socket.id);
        
        // IMMEDIATELY set presence when authenticated (fix race condition)
        store.setPresence(session.userId, {
          socketId: socket.id,
          online: true,
          available: false,
          lastActiveAt: Date.now(),
          lastHeartbeat: Date.now(), // Initialize heartbeat
        });
        
        console.log(`[Connection] User ${session.userId.substring(0, 8)} authenticated via event and marked online`);
      }
      
      socket.emit('auth:success');
      
      // Check for any referral notifications for this user (someone was introduced to them)
      const notifications = await store.getReferralNotifications(session.userId);
      const unreadNotifications = notifications.filter((n: any) => !n.read);
      
      if (unreadNotifications.length > 0) {
        // Send all unread notifications
        unreadNotifications.forEach((notif: any) => {
          socket.emit('referral:notification', {
            message: `${notif.referredName} wants to connect with you!`,
            notification: notif,
          });
        });
        console.log(`[Referral] Sent ${unreadNotifications.length} unread notifications to ${session.userId.substring(0, 8)}`);
      }
    } else {
      socket.emit('auth:failed');
    }
  });

  // Presence: join (mark online) - DEPRECATED, presence set at auth now
  // Kept for backward compatibility but now just confirms presence
  socket.on('presence:join', async () => {
    if (!currentUserId) {
      console.error('[Presence] ❌ presence:join called but user not authenticated yet!');
      return;
    }
    
    // Update lastActiveAt (presence already set at auth time)
    store.updatePresence(currentUserId, {
      online: true,
      available: false,
      lastActiveAt: Date.now(),
    });

    console.log(`[Presence] ✅ ${currentUserId.substring(0, 8)} confirmed online`);
    
    // Broadcast to all (debounced for 1000-user scale)
    if (presenceOptimizer.shouldUpdate(currentUserId)) {
      io.emit('presence:update', {
        userId: currentUserId,
        online: true,
        available: false,
      });
    }
  });

  // Presence: leave
  socket.on('presence:leave', async () => {
    if (!currentUserId) return;
    
    store.updatePresence(currentUserId, {
      online: false,
      available: false,
    });

    console.log(`[Presence] ${currentUserId} left (offline)`);
    
    // Always emit leave events (important for real-time)
    io.emit('presence:update', {
      userId: currentUserId,
      online: false,
      available: false,
    });
  });

  // Heartbeat - keeps connection alive and detects stale users
  socket.on('heartbeat', () => {
    if (currentUserId) {
      store.updateHeartbeat(currentUserId);
    }
  });

  // Queue: join (mark available for matching)
  socket.on('queue:join', async () => {
    if (!currentUserId) {
      console.error('[Queue] ❌ queue:join called but user not authenticated yet!');
      return;
    }
    
    // First ensure user is online
    const currentPresence = store.getPresence(currentUserId);
    if (!currentPresence || !currentPresence.online) {
      console.warn(`[Queue] User ${currentUserId.substring(0, 8)} trying to join queue but not marked online - fixing`);
      store.setPresence(currentUserId, {
        socketId: socket.id,
        online: true,
        available: true,
        lastActiveAt: Date.now(),
        lastHeartbeat: Date.now(),
      });
    } else {
      // Update available flag + heartbeat
      store.updatePresence(currentUserId, {
        available: true,
        lastActiveAt: Date.now(),
        lastHeartbeat: Date.now(),
      });
    }

    const presence = store.getPresence(currentUserId);
    console.log(`[Queue] ${currentUserId.substring(0, 8)} joined queue - online: ${presence?.online}, available: ${presence?.available}`);
    
    // Broadcast to all users
    io.emit('queue:update', {
      userId: currentUserId,
      available: true,
    });
    
    // Double-check presence was set correctly
    const verified = store.getPresence(currentUserId);
    if (!verified?.available) {
      console.error(`[Queue] ⚠️ FAILED to set available for ${currentUserId.substring(0, 8)} - presence: ${JSON.stringify(verified)}`);
    } else {
      console.log(`[Queue] ✅ Verified ${currentUserId.substring(0, 8)} is now available`);
    }
  });

  // Queue: leave
  socket.on('queue:leave', async () => {
    if (!currentUserId) return;
    
    store.updatePresence(currentUserId, {
      available: false,
    });

    console.log(`[Queue] ${currentUserId} left queue`);
    
    io.emit('queue:update', {
      userId: currentUserId,
      available: false,
    });
  });

  // Call: invite
  socket.on('call:invite', async ({ toUserId, requestedSeconds }: { toUserId: string; requestedSeconds: number }) => {
    if (!currentUserId) {
      console.error('[Invite] ❌ call:invite received but currentUserId is null - user not authenticated yet');
      return socket.emit('error', { message: 'Please wait for authentication to complete' });
    }

    console.log(`[Invite] 📞 Received invite request from ${currentUserId.substring(0, 8)} to ${toUserId.substring(0, 8)} for ${requestedSeconds}s`);

    // Validate toUserId
    if (!toUserId || typeof toUserId !== 'string') {
      console.warn(`[Invite] Invalid toUserId: ${toUserId}`);
      return;
    }

    // Can't invite yourself
    if (toUserId === currentUserId) {
      console.warn(`[Invite] User ${currentUserId.substring(0, 8)} tried to invite themselves`);
      return socket.emit('call:declined', {
        inviteId: uuidv4(),
        reason: 'invalid_target',
      });
    }

    // Check if target user exists
    const targetUser = await store.getUser(toUserId);
    if (!targetUser) {
      console.warn(`[Invite] Target user not found: ${toUserId}`);
      return socket.emit('call:declined', {
        inviteId: uuidv4(),
        reason: 'user_not_found',
      });
    }

    // Validate requested time (60s to 30min)
    if (!requestedSeconds || 
        typeof requestedSeconds !== 'number' ||
        requestedSeconds < 60 || 
        requestedSeconds > 1800 ||
        !Number.isInteger(requestedSeconds)) {
      console.warn(`[Invite] Invalid duration requested: ${requestedSeconds}`);
      return socket.emit('call:declined', {
        inviteId: uuidv4(),
        reason: 'invalid_duration',
      });
    }

    const inviteId = uuidv4();
    const targetPresence = store.getPresence(toUserId);
    const targetSocket = activeSockets.get(toUserId);

    // Validation
    if (!targetPresence || !targetPresence.online || !targetPresence.available) {
      return socket.emit('call:declined', {
        inviteId,
        reason: 'offline',
      });
    }

    if (await store.hasCooldown(currentUserId, toUserId)) {
      return socket.emit('call:declined', {
        inviteId,
        reason: 'cooldown',
      });
    }

    // Create invite
    store.createInvite({
      inviteId,
      fromUserId: currentUserId,
      toUserId,
      createdAt: Date.now(),
      callerSeconds: requestedSeconds,
    });

    const fromUser = await store.getUser(currentUserId);

    // Notify callee
    if (targetSocket) {
      const notificationPayload = {
        inviteId,
        fromUser: {
          userId: fromUser?.userId,
          name: fromUser?.name,
          gender: fromUser?.gender,
          selfieUrl: fromUser?.selfieUrl,
          videoUrl: fromUser?.videoUrl,
        },
        requestedSeconds,
        ttlMs: 20000, // Changed to 20 seconds
      };
      
      io.to(targetSocket).emit('call:notify', notificationPayload);
      console.log(`[Invite] ${currentUserId.substring(0, 8)} → ${toUserId.substring(0, 8)}, invite: ${inviteId}`);
      console.log(`[Invite] ✅ Notification emitted to socket: ${targetSocket}`);

      // Note: No automatic timeout - caller must manually cancel (rescind)
      // This gives caller full control over when to give up
    } else {
      console.error(`[Invite] ❌ Target socket not found for user ${toUserId.substring(0, 8)}`);
      console.error(`[Invite] Target might be offline or disconnected`);
      
      // Send decline back to caller
      socket.emit('call:declined', {
        inviteId,
        reason: 'offline'
      });
    }
  });

  // Call: accept
  socket.on('call:accept', async ({ inviteId, requestedSeconds }: { inviteId: string; requestedSeconds: number }) => {
    console.log(`[Accept] 📞 Received accept for invite ${inviteId} with ${requestedSeconds}s`);
    
    const invite = store.getInvite(inviteId);
    if (!invite) {
      console.error('[Accept] ❌ Invite not found:', inviteId);
      return socket.emit('error', { message: 'Invite not found or expired' });
    }

    console.log(`[Accept] ✅ Invite found: ${invite.fromUserId.substring(0, 8)} → ${invite.toUserId.substring(0, 8)}, caller requested ${invite.callerSeconds}s`);

    // Validate requested time (60s to 30min)
    if (!requestedSeconds || 
        typeof requestedSeconds !== 'number' ||
        requestedSeconds < 60 || 
        requestedSeconds > 1800 ||
        !Number.isInteger(requestedSeconds)) {
      console.warn(`[Accept] Invalid duration requested: ${requestedSeconds}`);
      return socket.emit('error', { message: 'Invalid call duration' });
    }

    // Calculate average
    const agreedSeconds = Math.floor((invite.callerSeconds + requestedSeconds) / 2);
    const roomId = uuidv4();
    
    console.log(`[Call] Averaging times: ${invite.callerSeconds}s (caller) + ${requestedSeconds}s (callee) = ${agreedSeconds}s (average)`);

    // Mark both as unavailable
    store.updatePresence(invite.fromUserId, { available: false });
    store.updatePresence(invite.toUserId, { available: false });
    
    // Broadcast presence change
    io.emit('queue:update', { userId: invite.fromUserId, available: false });
    io.emit('queue:update', { userId: invite.toUserId, available: false });

    // Create room
    activeRooms.set(roomId, {
      user1: invite.fromUserId,
      user2: invite.toUserId,
      messages: [],
      startedAt: Date.now(),
      duration: agreedSeconds,
    });

    const user1 = await store.getUser(invite.fromUserId);
    const user2 = await store.getUser(invite.toUserId);

    const callerSocket = activeSockets.get(invite.fromUserId);
    const calleeSocket = activeSockets.get(invite.toUserId);

    // Notify both users
    if (callerSocket) {
      io.to(callerSocket).emit('call:start', {
        roomId,
        agreedSeconds,
        isInitiator: true, // Caller creates offer
        peerUser: {
          userId: user2?.userId,
          name: user2?.name,
        },
      });
    }

    if (calleeSocket) {
      io.to(calleeSocket).emit('call:start', {
        roomId,
        agreedSeconds,
        isInitiator: false, // Callee waits for offer
        peerUser: {
          userId: user1?.userId,
          name: user1?.name,
        },
      });
    }

    store.deleteInvite(inviteId);
    console.log(`[Call] Started room ${roomId} with ${agreedSeconds}s`);
  });

  // Call: decline
  socket.on('call:decline', async ({ inviteId }: { inviteId: string }) => {
    const invite = store.getInvite(inviteId);
    if (!invite) return;

    const callerSocket = activeSockets.get(invite.fromUserId);
    if (callerSocket) {
      io.to(callerSocket).emit('call:declined', {
        inviteId,
        reason: 'user_declined',
      });
    }

    // Set 24h cooldown when user declines (prevents repeated unwanted invites)
    const cooldownUntil = Date.now() + (24 * 60 * 60 * 1000);
    await store.setCooldown(invite.fromUserId, invite.toUserId, cooldownUntil);
    console.log(`[Cooldown] Set 24h cooldown after decline: ${invite.fromUserId.substring(0, 8)} ↔ ${invite.toUserId.substring(0, 8)}`);

    store.deleteInvite(inviteId);
    console.log(`[Invite] ${inviteId} declined by user`);
  });

  // REMOVED: call:extend-wait - Users auto-cancel after 20s (no "Keep Waiting")
  
  // Call: rescind (caller cancels their own invite)
  socket.on('call:rescind', async ({ toUserId }: { toUserId: string }) => {
    if (!currentUserId) {
      console.error('[Rescind] ❌ call:rescind received but currentUserId is null');
      return;
    }

    // Find the active invite from current user to target user
    const invite = Array.from(store['activeInvites'].values()).find(
      inv => inv.fromUserId === currentUserId && inv.toUserId === toUserId
    );

    if (!invite) {
      console.warn(`[Rescind] No active invite found from ${currentUserId.substring(0, 8)} to ${toUserId.substring(0, 8)}`);
      return;
    }

    console.log(`[Rescind] User ${currentUserId.substring(0, 8)} rescinding invite to ${toUserId.substring(0, 8)}`);

    const calleeSocket = activeSockets.get(toUserId);
    if (calleeSocket) {
      // Notify callee that invite was cancelled
      io.to(calleeSocket).emit('call:rescinded', { inviteId: invite.inviteId });
    }

    // Set 1h cooldown when caller cancels (prevents spam re-invites)
    const cooldownUntil = Date.now() + (60 * 60 * 1000); // 1 hour
    await store.setCooldown(currentUserId, toUserId, cooldownUntil);
    console.log(`[Cooldown] Set 1h cooldown after rescind: ${currentUserId.substring(0, 8)} ↔ ${toUserId.substring(0, 8)}`);

    store.deleteInvite(invite.inviteId);
    console.log(`[Invite] ${invite.inviteId} rescinded by caller`);
  });

  // Join room
  socket.on('room:join', async ({ roomId }) => {
    if (!currentUserId) {
      return socket.emit('error', { message: 'Not authenticated' });
    }
    socket.join(roomId);
    console.log(`User ${currentUserId} joined room ${roomId}`);
  });

  // WebRTC signaling
  socket.on('rtc:offer', async ({ roomId, offer }) => {
    console.log(`RTC offer from ${currentUserId} in room ${roomId}`);
    socket.to(roomId).emit('rtc:offer', { offer, from: currentUserId });
  });

  socket.on('rtc:answer', async ({ roomId, answer }) => {
    console.log(`RTC answer from ${currentUserId} in room ${roomId}`);
    socket.to(roomId).emit('rtc:answer', { answer, from: currentUserId });
  });

  socket.on('rtc:ice', async ({ roomId, candidate }) => {
    socket.to(roomId).emit('rtc:ice', { candidate, from: currentUserId });
  });

  // Chat messaging
  socket.on('room:chat', async ({ roomId, text }) => {
    if (!currentUserId) return;
    
    // Sanitize input to prevent XSS attacks
    // Remove HTML tags and limit length
    let sanitized = text || '';
    
    // Strip all HTML/script tags (basic sanitization)
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Limit length to 500 characters
    sanitized = sanitized.substring(0, 500);
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Don't send empty messages
    if (!sanitized) {
      return;
    }
    
    const message = {
      from: currentUserId,
      text: sanitized,
      timestamp: Date.now(),
      type: 'message' as const,
    };

    // Save to room
    const room = activeRooms.get(roomId);
    if (room) {
      room.messages.push(message);
    }

    // Broadcast to room
    io.to(roomId).emit('room:chat', message);
  });

  // Give social
  socket.on('room:giveSocial', async ({ roomId, socials }) => {
    if (!currentUserId) return;

    const message = {
      from: currentUserId,
      timestamp: Date.now(),
      type: 'social' as const,
      socials,
    };

    // Save to room
    const room = activeRooms.get(roomId);
    if (room) {
      room.messages.push(message);
    }

    // Broadcast to room
    io.to(roomId).emit('room:socialShared', message);
  });

  // TEXT CHAT: Send message (text/image/file/GIF)
  socket.on('textchat:send', async ({ roomId, messageType, content, fileUrl, fileName, fileSizeBytes, gifUrl, gifId }) => {
    if (!currentUserId) return;
    
    // Rate limit check (1.5s between messages) - ASYNC
    const rateCheck = await checkMessageRateLimit(currentUserId);
    if (!rateCheck.allowed) {
      socket.emit('textchat:rate-limited', { retryAfter: rateCheck.retryAfter });
      console.log(`[TextChat] Rate limited: ${currentUserId.substring(0, 8)} - wait ${rateCheck.retryAfter}s`);
      return;
    }
    
    // Sanitize content if text message
    let sanitizedContent = content;
    if (messageType === 'text' && content) {
      sanitizedContent = sanitizeMessageContent(content);
    }
    
    // Validate message (include file size)
    const validation = validateMessage(messageType, sanitizedContent, fileUrl, gifUrl, fileSizeBytes);
    if (!validation.valid) {
      socket.emit('textchat:error', { error: validation.error });
      console.warn(`[TextChat] Invalid message: ${validation.error}`);
      return;
    }
    
    // Get room and verify user is in it (SECURITY)
    const room = activeRooms.get(roomId);
    if (!room) {
      socket.emit('textchat:error', { error: 'Room not found' });
      return;
    }
    
    // SECURITY: Verify user is actually in this room
    if (room.user1 !== currentUserId && room.user2 !== currentUserId) {
      console.error(`[TextChat] SECURITY: User ${currentUserId.substring(0, 8)} tried to send message to room they're not in`);
      socket.emit('textchat:error', { error: 'Unauthorized' });
      return;
    }
    
    const receiverId = room.user1 === currentUserId ? room.user2 : room.user1;
    
    // Get sender info for message payload
    const senderUser = await store.getUser(currentUserId);
    if (!senderUser) {
      socket.emit('textchat:error', { error: 'User not found' });
      return;
    }
    
    // Save to database
    try {
      const saved = await saveChatMessage({
        sessionId: roomId, // Use roomId as session identifier
        roomId,
        senderUserId: currentUserId,
        receiverUserId: receiverId,
        messageType,
        content: sanitizedContent,
        fileUrl,
        fileName,
        fileSizeBytes,
        gifUrl,
        gifId,
      });
      
      // Broadcast to room with full sender info
      const messagePayload = {
        messageId: saved.messageId,
        from: currentUserId,
        fromName: senderUser.name, // Include sender name
        fromSelfie: senderUser.selfieUrl, // Include profile pic for UI
        messageType,
        content: sanitizedContent,
        fileUrl,
        fileName,
        gifUrl,
        timestamp: saved.sentAt,
      };
      
      io.to(roomId).emit('textchat:message', messagePayload);
      console.log(`[TextChat] Message sent: ${messageType} in room ${roomId.substring(0, 8)}`);
      
    } catch (error) {
      socket.emit('textchat:error', { error: 'Failed to send message' });
      console.error('[TextChat] Failed to save message:', error);
    }
  });
  
  // TEXT CHAT: Mark message as read
  socket.on('textchat:mark-read', async ({ messageId }) => {
    if (!currentUserId) return;
    await markMessageRead(messageId);
  });
  
  // TEXT CHAT: Get message history for room
  socket.on('textchat:get-history', async ({ roomId }, callback) => {
    if (!currentUserId) return;
    
    try {
      const messages = await getRoomMessages(roomId, 100);
      callback({ success: true, messages });
    } catch (error) {
      callback({ success: false, error: 'Failed to load messages' });
    }
  });
  
  // TEXT CHAT: Request video upgrade
  socket.on('textchat:request-video', async ({ roomId }) => {
    if (!currentUserId) return;
    
    console.log(`[TextChat] ${currentUserId.substring(0, 8)} requesting video upgrade in ${roomId.substring(0, 8)}`);
    
    // Notify other user
    socket.to(roomId).emit('textchat:video-requested', {
      fromUserId: currentUserId,
    });
  });
  
  // TEXT CHAT: Accept video upgrade
  socket.on('textchat:accept-video', async ({ roomId }) => {
    if (!currentUserId) return;
    
    console.log(`[TextChat] ${currentUserId.substring(0, 8)} accepted video upgrade in ${roomId.substring(0, 8)}`);
    
    // Notify both users to switch to video mode
    io.to(roomId).emit('textchat:upgrade-to-video', {
      roomId,
      message: 'Switching to video mode...',
    });
  });
  
  // TEXT CHAT: Decline video upgrade
  socket.on('textchat:decline-video', async ({ roomId }) => {
    if (!currentUserId) return;
    
    console.log(`[TextChat] ${currentUserId.substring(0, 8)} declined video upgrade in ${roomId.substring(0, 8)}`);
    
    // Notify requester
    socket.to(roomId).emit('textchat:video-declined', {
      message: 'Video request declined',
    });
  });

  // Connection failed - notify peer immediately
  socket.on('connection:failed', ({ roomId, reason }) => {
    if (!currentUserId) return;
    
    console.log(`[Room] User ${currentUserId.substring(0, 8)} connection failed in room ${roomId}: ${reason}`);
    
    // Find the room and notify the peer
    const room = activeRooms.get(roomId);
    if (room) {
      const peerId = room.user1 === currentUserId ? room.user2 : room.user1;
      const peerSocketId = activeSockets.get(peerId);
      
      if (peerSocketId) {
        console.log(`[Room] Notifying peer ${peerId.substring(0, 8)} of connection failure`);
        io.to(peerSocketId).emit('connection:peer-failed', { 
          roomId,
          reason: reason || 'Partner could not establish connection' 
        });
      }
      
      // Clean up the room since connection failed
      activeRooms.delete(roomId);
      console.log(`[Room] Room ${roomId} deleted due to connection failure`);
      
      // Mark both users as available again
      store.updatePresence(room.user1, { available: true });
      store.updatePresence(room.user2, { available: true });
    }
  });

  // End call
  socket.on('call:end', async ({ roomId }) => {
    if (!currentUserId) return;

    const room = activeRooms.get(roomId);
    if (room) {
      const sessionId = `session-${Date.now()}`;
      const user1 = await store.getUser(room.user1);
      const user2 = await store.getUser(room.user2);

      // Calculate actual duration (in seconds)
      const actualDuration = Math.floor((Date.now() - room.startedAt) / 1000);

      if (user1 && user2) {
        // Track session completion for QR grace period (both users)
        // Only if duration >= 30 seconds (prevents gaming)
        if (actualDuration >= 30) {
          await store.trackSessionCompletion(room.user1, room.user2, roomId, actualDuration);
          await store.trackSessionCompletion(room.user2, room.user1, roomId, actualDuration);
          
          // Check if either user unlocked QR and notify them
          const user1Status = await store.getQrUnlockStatus(room.user1);
          const user2Status = await store.getQrUnlockStatus(room.user2);
          
          if (user1Status.unlocked && user1Status.sessionsCompleted === 4) {
            const user1Socket = activeSockets.get(room.user1);
            if (user1Socket) {
              io.to(user1Socket).emit('qr:unlocked', {
                message: '🎉 Congratulations! You\'ve unlocked your QR code!',
                sessionsCompleted: 4,
              });
            }
          }
          
          if (user2Status.unlocked && user2Status.sessionsCompleted === 4) {
            const user2Socket = activeSockets.get(room.user2);
            if (user2Socket) {
              io.to(user2Socket).emit('qr:unlocked', {
                message: '🎉 Congratulations! You\'ve unlocked your QR code!',
                sessionsCompleted: 4,
              });
            }
          }
        }
        
        // Only save to history if call lasted at least 5 seconds (prevents accidental/spam calls)
        if (actualDuration >= 5) {
          // Save to history for both users
          const history1 = {
            sessionId,
            roomId,
            partnerId: user2.userId,
            partnerName: user2.name,
            startedAt: room.startedAt,
            duration: actualDuration,
            messages: room.messages,
          };

          const history2 = {
            sessionId,
            roomId,
            partnerId: user1.userId,
            partnerName: user1.name,
            startedAt: room.startedAt,
            duration: actualDuration,
            messages: room.messages,
          };

          await store.addHistory(room.user1, history1);
          await store.addHistory(room.user2, history2);

          // Update timer totals and metrics (use actual duration)
          await store.addToTimer(room.user1, actualDuration);
          await store.addToTimer(room.user2, actualDuration);
          
          console.log(`[Call] Saved ${actualDuration}s call to history for both users`);
        } else {
          console.log(`[Call] Call too short (${actualDuration}s), not saving to history`);
        }

        // Emit metrics update to both users
        const user1Socket = activeSockets.get(room.user1);
        const user2Socket = activeSockets.get(room.user2);

        if (user1Socket) {
          const u1 = await store.getUser(room.user1);
          io.to(user1Socket).emit('metrics:update', {
            timerTotalSeconds: u1?.timerTotalSeconds || 0,
            sessionCount: u1?.sessionCount || 0,
            lastSessions: u1?.lastSessions || [],
          });
        }

        if (user2Socket) {
          const u2 = await store.getUser(room.user2);
          io.to(user2Socket).emit('metrics:update', {
            timerTotalSeconds: u2?.timerTotalSeconds || 0,
            sessionCount: u2?.sessionCount || 0,
            lastSessions: u2?.lastSessions || [],
          });
        }

        // Set 24h cooldown between these users
        const cooldownUntil = Date.now() + (24 * 60 * 60 * 1000);
        await store.setCooldown(room.user1, room.user2, cooldownUntil);
        console.log(`[Cooldown] Set 24h cooldown between ${room.user1} and ${room.user2}`);
      }

      // Mark both users as available again
      store.updatePresence(room.user1, { available: true });
      store.updatePresence(room.user2, { available: true });
      
      // Broadcast presence change
      io.emit('queue:update', { userId: room.user1, available: true });
      io.emit('queue:update', { userId: room.user2, available: true });
      
      console.log(`[Queue] ${room.user1} marked available again`);
      console.log(`[Queue] ${room.user2} marked available again`);

      // Notify both users (CRITICAL: Use io.to for reliability)
      console.log(`[Room] Emitting session:finalized to room ${roomId} (session: ${sessionId})`);
      io.to(roomId).emit('session:finalized', { sessionId });
      
      // BACKUP: Also emit directly to socket IDs (for mobile reliability)
      const user1Socket = activeSockets.get(room.user1);
      const user2Socket = activeSockets.get(room.user2);
      if (user1Socket) {
        io.to(user1Socket).emit('session:finalized', { sessionId });
        console.log(`[Room] Direct emit to user1 socket: ${user1Socket}`);
      }
      if (user2Socket) {
        io.to(user2Socket).emit('session:finalized', { sessionId });
        console.log(`[Room] Direct emit to user2 socket: ${user2Socket}`);
      }

      // Cleanup
      activeRooms.delete(roomId);
    }
  });

  // Disconnect
  socket.on('disconnect', async (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    
    // Don't immediately mark offline for temporary disconnects
    const temporaryReasons = ['transport close', 'ping timeout', 'transport error'];
    const isTemporary = temporaryReasons.includes(reason);
    
    if (isTemporary) {
      console.log(`[Disconnect] Temporary disconnect (${reason}), waiting 5s for reconnection...`);
      
      // Wait 5 seconds before cleaning up
      setTimeout(async () => {
        // Check if user reconnected
        if (!currentUserId) return;
        
        const stillHasSocket = activeSockets.get(currentUserId);
        if (!stillHasSocket) {
          console.log(`[Disconnect] User ${currentUserId.substring(0, 8)} did not reconnect, cleaning up...`);
          await handleFullDisconnect(currentUserId);
        } else {
          console.log(`[Disconnect] User ${currentUserId.substring(0, 8)} reconnected successfully!`);
        }
      }, 5000);
      
      return; // Don't clean up immediately
    }
    
    // For intentional disconnects (client close, server shutdown), clean up immediately
    console.log(`[Disconnect] Permanent disconnect (${reason}), cleaning up immediately...`);
    await handleFullDisconnect(currentUserId);
  });
  
  // Extracted disconnect handler for reuse
  async function handleFullDisconnect(userId: string | null) {
    if (!userId) return; // Guard clause for null
    
    // CRITICAL COOLDOWN FIX: Check if user has active outgoing invites
    // If they disconnect while waiting, auto-rescind and set cooldown
    const userActiveInvites = Array.from(store['activeInvites'].values()).filter(
      inv => inv.fromUserId === userId
    );
    
    if (userActiveInvites.length > 0) {
      console.warn(`[Disconnect] User ${userId.substring(0, 8)} has ${userActiveInvites.length} active invites - auto-rescinding`);
      
      for (const invite of userActiveInvites) {
        // Set 1h cooldown (same as manual rescind)
        const cooldownUntil = Date.now() + (60 * 60 * 1000); // 1 hour
        await store.setCooldown(invite.fromUserId, invite.toUserId, cooldownUntil);
        console.log(`[Cooldown] Set 1h cooldown after disconnect: ${invite.fromUserId.substring(0, 8)} ↔ ${invite.toUserId.substring(0, 8)}`);
        
        // Notify the callee that invite was cancelled
        const calleeSocket = activeSockets.get(invite.toUserId);
        if (calleeSocket) {
          io.to(calleeSocket).emit('call:rescinded', { inviteId: invite.inviteId });
        }
        
        // Delete the invite
        store.deleteInvite(invite.inviteId);
        console.log(`[Disconnect] Cleaned up invite ${invite.inviteId}`);
      }
    }
    
    // Remove from ADVANCED connection pool
    advancedConnectionManager.removeConnection(userId, socket.id);
    
    activeSockets.delete(userId);
    
    // Find any active room and clean up properly
    for (const [roomId, room] of activeRooms.entries()) {
      if (room.user1 === userId || room.user2 === userId) {
        const partnerId = room.user1 === userId ? room.user2 : room.user1;
          const partnerUser = await store.getUser(partnerId);
          
          // Notify partner
          io.to(roomId).emit('peer:disconnected');
          console.log(`[Disconnect] Notified partner ${partnerId.substring(0, 8)} of disconnection`);
          
          // Save partial session history (for analytics/debugging)
          const actualDuration = Math.floor((Date.now() - room.startedAt) / 1000);
          if (actualDuration >= 5) {
            const sessionId = `session-${Date.now()}-disconnected`;
            const user1 = await store.getUser(room.user1);
            const user2 = await store.getUser(room.user2);
            
            if (user1 && user2) {
              // Save history for both users with disconnection flag
              const history1 = {
                sessionId,
                roomId,
                partnerId: room.user2,
                partnerName: user2.name,
                startedAt: room.startedAt,
                duration: actualDuration,
                messages: [...room.messages, {
                  from: 'system',
                  text: 'Call ended due to disconnection',
                  timestamp: Date.now(),
                  type: 'message' as const,
                }],
              };
              
              const history2 = {
                sessionId,
                roomId,
                partnerId: room.user1,
                partnerName: user1.name,
                startedAt: room.startedAt,
                duration: actualDuration,
                messages: [...room.messages, {
                  from: 'system',
                  text: 'Call ended due to disconnection',
                  timestamp: Date.now(),
                  type: 'message' as const,
                }],
              };
              
              await store.addHistory(room.user1, history1);
              await store.addHistory(room.user2, history2);
              
              // Update timer totals
              await store.addToTimer(room.user1, actualDuration);
              await store.addToTimer(room.user2, actualDuration);
              
              // Set cooldown even for disconnected calls (prevent abuse)
              const cooldownUntil = Date.now() + (24 * 60 * 60 * 1000);
              await store.setCooldown(room.user1, room.user2, cooldownUntil);
              
              console.log(`[Disconnect] Saved partial session (${actualDuration}s) and set cooldown`);
            }
          } else {
            console.log(`[Disconnect] Call too short (${actualDuration}s), not saving history`);
          }
          
          // Mark both users as available again
          store.updatePresence(room.user1, { available: true });
          store.updatePresence(room.user2, { available: true });
          
          // Broadcast presence updates
          io.emit('queue:update', { userId: room.user1, available: true });
          io.emit('queue:update', { userId: room.user2, available: true });
          
          // Clean up room from memory (critical fix for memory leak)
          activeRooms.delete(roomId);
          
          console.log(`[Disconnect] ✅ Cleaned up room ${roomId} and marked users available`);
        }
    }
    
    // Mark user offline (they disconnected from socket)
    store.updatePresence(userId, { 
      online: false, 
      available: false 
    });
    
    // Broadcast offline status (always emit disconnects)
    io.emit('presence:update', {
      userId: userId,
      online: false,
      available: false,
    });
    
    console.log(`[Disconnect] ✅ User ${userId.substring(0, 8)} marked offline`);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   ⚠️  In-memory store active - migrate to PostgreSQL for production`);
  console.log(`   ℹ️  Production mode - ready for real users`);
});
