import { User, Session, ReferralNotification, Report, BanRecord, IPBan, InviteCode, RateLimitRecord, EventSettings, EventRSVP } from './types';
import { query } from './database';
import { userCache, sessionCache } from './lru-cache';
import { queryCache, generateCacheKey } from './query-cache';

interface ChatMessage {
  from: string;
  text: string;
  timestamp: number;
  type: 'message' | 'social';
  socials?: any;
}

interface ChatHistory {
  sessionId: string;
  roomId: string;
  partnerId: string;
  partnerName: string;
  startedAt: number;
  duration: number;
  messages: ChatMessage[];
}

/**
 * In-memory data store for demo purposes.
 * ⚠️ Data will be lost on server restart.
 * Cloud-ready seam: Replace with PostgreSQL/MongoDB for production.
 */
interface Presence {
  socketId: string;
  online: boolean;
  available: boolean;
  lastActiveAt: number;
}

interface ActiveInvite {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
  createdAt: number;
  callerSeconds: number;
}

interface ReferralMapping {
  targetUserId: string;
  targetName: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: number;
}

class DataStore {
  private useDatabase = !!process.env.DATABASE_URL;
  
  // OPTIMIZED FOR 1000 USERS: Use LRU cache instead of unlimited Maps
  // users cache: Max 200 most recent (instead of all users)
  // sessions cache: Max 300 most recent (instead of all sessions)
  private users = new Map<string, User>(); // Kept for backward compatibility, but will use userCache
  private sessions = new Map<string, Session>(); // Kept for backward compatibility, but will use sessionCache
  
  // History removed from memory - fetch from DB only when needed
  // This saves MASSIVE memory (was growing unbounded)
  private history = new Map<string, ChatHistory[]>(); // DEPRECATED - use DB queries instead
  
  private timerTotals = new Map<string, number>(); // userId -> cumulative seconds (lightweight)
  private presence = new Map<string, Presence>(); // userId -> presence (must be in-memory for real-time)
  private cooldowns = new Map<string, number>(); // "userId1|userId2" -> expiresAt
  private activeInvites = new Map<string, ActiveInvite>(); // inviteId -> invite (must be in-memory for real-time)
  private seenInSession = new Map<string, Set<string>>(); // sessionId -> Set<userIds>
  private referralNotifications = new Map<string, ReferralNotification[]>(); // userId -> notifications[]
  private referralMappings = new Map<string, ReferralMapping>(); // code -> {targetUserId, createdByUserId, ...}
  
  // Blacklist & Reporting system
  private reports = new Map<string, Report>(); // reportId -> Report
  private userReports = new Map<string, Set<string>>(); // reportedUserId -> Set<reportId>
  private reporterHistory = new Map<string, Set<string>>(); // reporterUserId -> Set<reportedUserId> (tracks who reported whom)
  private banRecords = new Map<string, BanRecord>(); // userId -> BanRecord
  private ipBans = new Map<string, IPBan>(); // ipAddress -> IPBan
  private userIps = new Map<string, Set<string>>(); // userId -> Set<ipAddresses>
  
  // Paywall & Invite Code system
  private inviteCodes = new Map<string, InviteCode>(); // code -> InviteCode
  private rateLimits = new Map<string, RateLimitRecord>(); // ipAddress -> RateLimitRecord

  constructor() {
    console.log(`[Store] Using ${this.useDatabase ? 'PostgreSQL' : 'in-memory'} storage`);
    
    // Test database connection on startup
    if (this.useDatabase) {
      this.testDatabaseConnection();
    }
  }
  
  private async testDatabaseConnection(): Promise<void> {
    try {
      const result = await query('SELECT NOW() as time');
      console.log('[Store] ✅ PostgreSQL connection successful:', result.rows[0].time);
    } catch (error) {
      console.error('[Store] ❌ PostgreSQL connection failed:', error);
      console.warn('[Store] ⚠️  Falling back to in-memory storage');
      this.useDatabase = false; // Disable database, use memory only
    }
  }

  // User operations - with PostgreSQL support
  async createUser(user: User): Promise<void> {
    // CRITICAL: Always save to memory first (immediate availability)
    this.users.set(user.userId, user);
    
    // Then persist to PostgreSQL (with retry)
    if (this.useDatabase) {
      let retries = 3;
      let lastError: any = null;
      
      while (retries > 0) {
        try {
          await query(
            `INSERT INTO users (user_id, name, gender, account_type, email, password_hash, selfie_url, video_url, 
             socials, paid_status, paid_at, payment_id, invite_code_used, my_invite_code, invite_code_uses_remaining,
             ban_status, introduced_to, introduced_by, introduced_via_code, qr_unlocked, successful_sessions)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
             ON CONFLICT (user_id) DO UPDATE SET
               name = EXCLUDED.name,
               paid_status = EXCLUDED.paid_status,
               qr_unlocked = EXCLUDED.qr_unlocked,
               successful_sessions = EXCLUDED.successful_sessions`,
            [
              user.userId, user.name, user.gender, user.accountType, user.email || null,
              user.password_hash || null, user.selfieUrl || null, user.videoUrl || null,
              JSON.stringify(user.socials || {}), user.paidStatus || 'unpaid',
              user.paidAt ? new Date(user.paidAt) : null, user.paymentId || null,
              user.inviteCodeUsed || null, user.myInviteCode || null, user.inviteCodeUsesRemaining || 0,
              user.banStatus || 'none', user.introducedTo || null, user.introducedBy || null,
              user.introducedViaCode || null, user.qrUnlocked || false, user.successfulSessions || 0
            ]
          );
          console.log('[Store] ✅ User created in PostgreSQL:', user.userId.substring(0, 8));
          return; // Success!
        } catch (error: any) {
          lastError = error;
          retries--;
          
          if (retries > 0) {
            console.warn(`[Store] User creation failed, retrying... (${3 - retries}/3)`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      // All retries failed
      console.error('[Store] ❌ FAILED to create user in PostgreSQL after 3 attempts:', lastError?.message);
      console.warn('[Store] ⚠️  User will work in memory-only mode (data lost on restart)');
    }
  }

  async getUser(userId: string): Promise<User | undefined> {
    // OPTIMIZED FOR 3000-4000 USERS: Multi-level caching
    
    // Level 1: Check in-memory Map first (most recent updates)
    let user = this.users.get(userId);
    if (user) return user;
    
    // Level 2: Check LRU cache
    const cachedUser = userCache.get(userId);
    if (cachedUser) {
      // LRU cache returns LightweightUser, we'll fetch full data from DB if needed
      user = cachedUser as unknown as User;
      this.users.set(userId, user);
      return user;
    }
    
    // Level 3: Check query result cache (60s TTL)
    const queryCacheKey = generateCacheKey('user', userId);
    const queryCached = queryCache.get(queryCacheKey);
    if (queryCached) {
      user = queryCached as User;
      this.users.set(userId, user);
      userCache.set(userId, user);
      console.log('[QueryCache] User cache HIT:', userId.substring(0, 8));
      return user;
    }
    
    // Level 4: Fetch from database (last resort)
    if (this.useDatabase) {
      try {
        const result = await query('SELECT * FROM users WHERE user_id = $1', [userId]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          user = this.dbRowToUser(row);
          
          // Cache in all levels
          this.users.set(userId, user);
          userCache.set(userId, user);
          queryCache.set(queryCacheKey, user);
          
          console.log('[QueryCache] User cache MISS - cached:', userId.substring(0, 8));
        }
      } catch (error) {
        console.error('[Store] Failed to get user from database:', error);
      }
    }
    
    return user;
  }
  
  // Helper: Convert database row to User object
  private dbRowToUser(row: any): User {
    return {
      userId: row.user_id,
      name: row.name,
      gender: row.gender,
      accountType: row.account_type,
      email: row.email,
      password_hash: row.password_hash,
      selfieUrl: row.selfie_url,
      videoUrl: row.video_url,
      socials: row.socials || {},
      paidStatus: row.paid_status,
      paidAt: row.paid_at ? new Date(row.paid_at).getTime() : undefined,
      paymentId: row.payment_id,
      inviteCodeUsed: row.invite_code_used,
      myInviteCode: row.my_invite_code,
      inviteCodeUsesRemaining: row.invite_code_uses_remaining,
      qrUnlocked: row.qr_unlocked || false,
      successfulSessions: row.successful_sessions || 0,
      qrUnlockedAt: row.qr_unlocked_at ? new Date(row.qr_unlocked_at).getTime() : undefined,
      banStatus: row.ban_status,
      bannedAt: row.banned_at ? new Date(row.banned_at).getTime() : undefined,
      bannedReason: row.banned_reason,
      reviewStatus: row.review_status,
      introducedTo: row.introduced_to,
      introducedBy: row.introduced_by,
      introducedViaCode: row.introduced_via_code,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    };
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Check memory first
    let user = Array.from(this.users.values()).find(u => u.email === email);
    
    // If not found and database available, check there
    if (!user && this.useDatabase && email) {
      try {
        const result = await query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
          user = this.dbRowToUser(result.rows[0]);
          this.users.set(user.userId, user);
        }
      } catch (error) {
        console.error('[Store] Failed to get user by email from database:', error);
      }
    }
    
    return user;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    // Update in memory
    const user = this.users.get(userId);
    if (user) {
      const updatedUser = { ...user, ...updates };
      this.users.set(userId, updatedUser);
      
      // CRITICAL: Invalidate all caches immediately to prevent stale reads
      userCache.set(userId, updatedUser);
      const queryCacheKey = generateCacheKey('user', userId);
      queryCache.delete(queryCacheKey); // Force re-fetch from DB next time
      
      // Also update in database if available
      if (this.useDatabase) {
        try {
          // Build dynamic UPDATE query based on what fields were updated
          const setClauses: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;
          
          if (updates.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); values.push(updates.name); }
          if (updates.email !== undefined) { setClauses.push(`email = $${paramIndex++}`); values.push(updates.email); }
          if (updates.password_hash !== undefined) { setClauses.push(`password_hash = $${paramIndex++}`); values.push(updates.password_hash); }
          if (updates.selfieUrl !== undefined) { setClauses.push(`selfie_url = $${paramIndex++}`); values.push(updates.selfieUrl); }
          if (updates.videoUrl !== undefined) { setClauses.push(`video_url = $${paramIndex++}`); values.push(updates.videoUrl); }
          if (updates.socials !== undefined) { setClauses.push(`socials = $${paramIndex++}`); values.push(JSON.stringify(updates.socials)); }
          if (updates.paidStatus !== undefined) { setClauses.push(`paid_status = $${paramIndex++}`); values.push(updates.paidStatus); }
          if (updates.paidAt !== undefined) { setClauses.push(`paid_at = $${paramIndex++}`); values.push(updates.paidAt ? new Date(updates.paidAt) : null); }
          if (updates.paymentId !== undefined) { setClauses.push(`payment_id = $${paramIndex++}`); values.push(updates.paymentId); }
          if (updates.myInviteCode !== undefined) { setClauses.push(`my_invite_code = $${paramIndex++}`); values.push(updates.myInviteCode); }
          if (updates.inviteCodeUsesRemaining !== undefined) { setClauses.push(`invite_code_uses_remaining = $${paramIndex++}`); values.push(updates.inviteCodeUsesRemaining); }
          if (updates.inviteCodeUsed !== undefined) { setClauses.push(`invite_code_used = $${paramIndex++}`); values.push(updates.inviteCodeUsed); }
          if (updates.banStatus !== undefined) { setClauses.push(`ban_status = $${paramIndex++}`); values.push(updates.banStatus); }
          if (updates.accountType !== undefined) { setClauses.push(`account_type = $${paramIndex++}`); values.push(updates.accountType); }
          // NEW QR FIELDS
          if (updates.qrUnlocked !== undefined) { setClauses.push(`qr_unlocked = $${paramIndex++}`); values.push(updates.qrUnlocked); }
          if (updates.successfulSessions !== undefined) { setClauses.push(`successful_sessions = $${paramIndex++}`); values.push(updates.successfulSessions); }
          if (updates.qrUnlockedAt !== undefined) { setClauses.push(`qr_unlocked_at = $${paramIndex++}`); values.push(updates.qrUnlockedAt ? new Date(updates.qrUnlockedAt) : null); }
          
          if (setClauses.length > 0) {
            values.push(userId);
            await query(
              `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id = $${paramIndex}`,
              values
            );
            console.log('[Store] User updated in database:', userId.substring(0, 8));
          }
        } catch (error) {
          console.error('[Store] Failed to update user in database:', error);
          // Don't throw - fallback to memory-only mode
        }
      }
    }
  }

  // Session operations - with PostgreSQL support  
  async createSession(session: Session): Promise<void> {
    this.sessions.set(session.sessionToken, session);
    
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO sessions (session_token, user_id, ip_address, device_info, is_active, last_active_at, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
           ON CONFLICT (session_token) DO UPDATE SET 
             expires_at = EXCLUDED.expires_at,
             is_active = EXCLUDED.is_active,
             last_active_at = EXCLUDED.last_active_at`,
          [
            session.sessionToken, 
            session.userId, 
            session.ipAddress || null,
            session.deviceInfo || null,
            session.isActive !== false, // Default to true
            new Date(session.lastActiveAt || session.createdAt),
            new Date(session.createdAt), 
            new Date(session.expiresAt)
          ]
        );
        console.log('[Store] Session created with device_info:', session.deviceInfo?.substring(0, 50));
      } catch (error) {
        console.error('[Store] Failed to create session in database:', error);
      }
    }
  }

  async getSession(sessionToken: string): Promise<Session | undefined> {
    // OPTIMIZED FOR 3000-4000 USERS: Multi-level caching for sessions
    
    // Level 1: Check LRU cache first (limits memory for 1000+ sessions)
    const cached = sessionCache.get(sessionToken);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    
    // Level 2: Check in-memory Map
    let session = this.sessions.get(sessionToken);
    
    // Level 3: Check query result cache (60s TTL)
    if (!session) {
      const queryCacheKey = generateCacheKey('session', sessionToken);
      const queryCached = queryCache.get(queryCacheKey);
      if (queryCached && queryCached.expiresAt > Date.now()) {
        session = queryCached;
        sessionCache.set(sessionToken, session);
        return session;
      }
    }
    
    // Level 4: Check database if not in memory/cache
    if (!session && this.useDatabase) {
      try {
        const result = await query('SELECT * FROM sessions WHERE session_token = $1 AND expires_at > NOW()', [sessionToken]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          session = {
            sessionToken: row.session_token,
            userId: row.user_id,
            createdAt: new Date(row.created_at).getTime(),
            expiresAt: new Date(row.expires_at).getTime(),
            ipAddress: row.ip_address,
            deviceInfo: row.device_info,
            isActive: row.is_active !== false, // Default to true for backward compatibility
            lastActiveAt: row.last_active_at ? new Date(row.last_active_at).getTime() : new Date(row.created_at).getTime(),
          };
          
          // Cache in all levels
          sessionCache.set(sessionToken, session);
          const queryCacheKey = generateCacheKey('session', sessionToken);
          queryCache.set(queryCacheKey, session);
        }
      } catch (error) {
        console.error('[Store] Failed to get session from database:', error);
      }
    }
    
    // Check expiry
    if (session && session.expiresAt > Date.now()) {
      return session;
    }
    
    // Expired - clean up from all caches
    if (session) {
      this.sessions.delete(sessionToken);
      sessionCache.delete(sessionToken);
      const queryCacheKey = generateCacheKey('session', sessionToken);
      queryCache.delete(queryCacheKey);
      
      if (this.useDatabase) {
        try {
          await query('DELETE FROM sessions WHERE session_token = $1', [sessionToken]);
        } catch (error) {}
      }
    }
    return undefined;
  }

  async deleteSession(sessionToken: string): Promise<void> {
    this.sessions.delete(sessionToken);
    if (this.useDatabase) {
      try {
        await query('DELETE FROM sessions WHERE session_token = $1', [sessionToken]);
      } catch (error) {}
    }
  }

  // History operations - with PostgreSQL support
  async addHistory(userId: string, history: ChatHistory): Promise<void> {
    const userHistory = this.history.get(userId) || [];
    userHistory.push(history);
    this.history.set(userId, userHistory);
    
    // Also save to PostgreSQL
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO chat_history (session_id, user_id, partner_id, partner_name, room_id, started_at, duration, messages, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (session_id) DO UPDATE SET duration = EXCLUDED.duration, messages = EXCLUDED.messages`,
          [
            history.sessionId,
            userId,
            history.partnerId,
            history.partnerName,
            history.roomId,
            new Date(history.startedAt),
            history.duration,
            JSON.stringify(history.messages),
            new Date()
          ]
        );
        console.log('[Store] Chat history saved to database for user:', userId.substring(0, 8));
      } catch (error) {
        console.error('[Store] Failed to save chat history to database:', error);
      }
    }
  }

  async getHistory(userId: string): Promise<ChatHistory[]> {
    // Check memory first
    let history = this.history.get(userId) || [];
    
    // If database available, load from there
    if (this.useDatabase) {
      try {
        const result = await query(
          'SELECT * FROM chat_history WHERE user_id = $1 ORDER BY started_at DESC',
          [userId]
        );
        
        if (result.rows.length > 0) {
          history = result.rows.map(row => ({
            sessionId: row.session_id,
            roomId: row.room_id,
            partnerId: row.partner_id,
            partnerName: row.partner_name,
            startedAt: new Date(row.started_at).getTime(),
            duration: row.duration,
            messages: row.messages || [],
          }));
          
          // Cache in memory
          this.history.set(userId, history);
          console.log('[Store] Loaded', history.length, 'chat history records from database for user:', userId.substring(0, 8));
        }
      } catch (error) {
        console.error('[Store] Failed to load chat history from database:', error);
      }
    }
    
    return history;
  }

  // Timer operations (legacy - now using user.timerTotalSeconds)
  async addToTimer(userId: string, seconds: number): Promise<void> {
    const current = this.timerTotals.get(userId) || 0;
    this.timerTotals.set(userId, current + seconds);
    
    // Also update user metrics
    const user = await this.getUser(userId);
    if (user) {
      const timerTotal = (user.timerTotalSeconds || 0) + seconds;
      const sessionCount = (user.sessionCount || 0) + 1;
      const lastSessions = user.lastSessions || [];
      
      // Add new session to lastSessions (cap at 10)
      lastSessions.push({ at: Date.now(), duration: seconds });
      if (lastSessions.length > 10) {
        lastSessions.shift();
      }

      await this.updateUser(userId, {
        timerTotalSeconds: timerTotal,
        sessionCount,
        lastSessions,
      });
    }
  }

  getTimerTotal(userId: string): number {
    return this.timerTotals.get(userId) || 0;
  }

  // Presence operations
  setPresence(userId: string, presence: Presence): void {
    this.presence.set(userId, presence);
  }

  getPresence(userId: string): Presence | undefined {
    return this.presence.get(userId);
  }

  updatePresence(userId: string, updates: Partial<Presence>): void {
    const current = this.presence.get(userId);
    if (current) {
      const updated = { ...current, ...updates };
      this.presence.set(userId, updated);
      console.log(`[Store] Presence updated for ${userId.substring(0, 8)}: online=${updated.online}, available=${updated.available}`);
    } else {
      console.warn(`[Store] Cannot update presence for ${userId.substring(0, 8)} - not found`);
    }
  }

  getAllOnlineAvailable(excludeUserId?: string): string[] {
    const allPresence = Array.from(this.presence.entries());
    
    // Debug: Log presence states
    console.log(`[Store] getAllOnlineAvailable called - Total presence entries: ${allPresence.length}`);
    allPresence.forEach(([uid, p]) => {
      // Note: User lookup removed from debug log (would require async)
      const isExcluded = uid === excludeUserId;
      const isIncluded = p.online && p.available && !isExcluded;
      console.log(`[Store]   ${uid.substring(0, 8)}: online=${p.online}, available=${p.available}, excluded=${isExcluded} → ${isIncluded ? '✅ INCLUDED' : '❌ FILTERED'}`);
    });
    
    const available = allPresence
      .filter(([uid, p]) => p.online && p.available && uid !== excludeUserId)
      .map(([uid]) => uid);
    
    console.log(`[Store] getAllOnlineAvailable result: ${available.length} users`);
    return available;
  }

  // Cooldown operations
  
  /**
   * Generate consistent cooldown key for any pair of users
   * Always returns same key regardless of parameter order
   */
  private getCooldownKey(userId1: string, userId2: string): string {
    // Lexicographic comparison ensures consistent ordering
    // Works correctly for UUIDs and any string-based IDs
    return userId1 < userId2 
      ? `${userId1}|${userId2}`
      : `${userId2}|${userId1}`;
  }

  async setCooldown(userId1: string, userId2: string, expiresAt: number): Promise<void> {
    const key = this.getCooldownKey(userId1, userId2);
    this.cooldowns.set(key, expiresAt);
    
    // Also save to PostgreSQL
    if (this.useDatabase) {
      try {
        // Ensure consistent ordering for database constraint
        const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
        
        await query(
          `INSERT INTO cooldowns (user_id_1, user_id_2, expires_at, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id_1, user_id_2) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          [user1, user2, new Date(expiresAt), new Date()]
        );
        console.log('[Store] Cooldown saved to database:', userId1.substring(0, 8), '↔', userId2.substring(0, 8));
      } catch (error) {
        console.error('[Store] Failed to save cooldown to database:', error);
      }
    }
  }

  async hasCooldown(userId1: string, userId2: string): Promise<boolean> {
    const key = this.getCooldownKey(userId1, userId2);
    let expires = this.cooldowns.get(key);
    
    // If not in memory and database available, check there
    if (!expires && this.useDatabase) {
      try {
        const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
        const result = await query(
          'SELECT expires_at FROM cooldowns WHERE user_id_1 = $1 AND user_id_2 = $2 AND expires_at > NOW()',
          [user1, user2]
        );
        
        if (result.rows.length > 0) {
          expires = new Date(result.rows[0].expires_at).getTime();
          this.cooldowns.set(key, expires);
        }
      } catch (error) {
        console.error('[Store] Failed to check cooldown in database:', error);
      }
    }
    
    if (expires && expires > Date.now()) {
      const hoursLeft = Math.floor((expires - Date.now()) / (1000 * 60 * 60));
      const minutesLeft = Math.floor(((expires - Date.now()) % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`[Store] 🚫 Cooldown active: ${userId1.substring(0, 8)} ↔ ${userId2.substring(0, 8)} - ${hoursLeft}h ${minutesLeft}m remaining`);
      return true;
    }
    if (expires) {
      console.log(`[Store] ✅ Cooldown expired, removing: ${userId1.substring(0, 8)} ↔ ${userId2.substring(0, 8)}`);
      this.cooldowns.delete(key);
      
      // Also delete from database
      if (this.useDatabase) {
        try {
          const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
          await query('DELETE FROM cooldowns WHERE user_id_1 = $1 AND user_id_2 = $2', [user1, user2]);
        } catch (error) {}
      }
    }
    return false;
  }

  getCooldownExpiry(userId1: string, userId2: string): number | null {
    const key = this.getCooldownKey(userId1, userId2);
    const expires = this.cooldowns.get(key);
    if (expires && expires > Date.now()) {
      return expires;
    }
    return null;
  }

  // Active invite operations
  createInvite(invite: ActiveInvite): void {
    this.activeInvites.set(invite.inviteId, invite);
  }

  getInvite(inviteId: string): ActiveInvite | undefined {
    return this.activeInvites.get(inviteId);
  }

  deleteInvite(inviteId: string): void {
    this.activeInvites.delete(inviteId);
  }

  // Seen tracking for reel
  addSeen(sessionId: string, userId: string): void {
    if (!this.seenInSession.has(sessionId)) {
      this.seenInSession.set(sessionId, new Set());
    }
    this.seenInSession.get(sessionId)!.add(userId);
  }

  getSeen(sessionId: string): Set<string> {
    return this.seenInSession.get(sessionId) || new Set();
  }

  clearSeen(sessionId: string): void {
    this.seenInSession.delete(sessionId);
  }

  // Referral operations (matchmaker system)
  createReferralMapping(code: string, mapping: { targetUserId: string; targetName: string; createdByUserId: string; createdByName: string; createdAt: number }): void {
    this.referralMappings.set(code, mapping);
    console.log(`[Referral] ${mapping.createdByName} created intro link for ${mapping.targetName} (code: ${code})`);
  }

  getReferralMapping(code: string): { targetUserId: string; targetName: string; createdByUserId: string; createdByName: string; createdAt: number } | undefined {
    return this.referralMappings.get(code);
  }

  async createReferralNotification(notification: ReferralNotification): Promise<void> {
    const notifications = this.referralNotifications.get(notification.forUserId) || [];
    notifications.push(notification);
    this.referralNotifications.set(notification.forUserId, notifications);
    console.log(`[Referral] Notification created for ${notification.forUserId.substring(0, 8)}: ${notification.referredName} signed up`);
    
    // Also save to PostgreSQL
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO referral_notifications (id, for_user_id, referred_user_id, referred_name, introduced_by, introduced_by_name, timestamp, read)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            notification.id,
            notification.forUserId,
            notification.referredUserId,
            notification.referredName,
            notification.introducedBy,
            notification.introducedByName,
            new Date(notification.timestamp),
            notification.read
          ]
        );
        console.log('[Store] Referral notification saved to database');
      } catch (error) {
        console.error('[Store] Failed to save referral notification to database:', error);
      }
    }
  }

  async getReferralNotifications(userId: string): Promise<ReferralNotification[]> {
    let notifications = this.referralNotifications.get(userId) || [];
    
    // Load from database if available
    if (this.useDatabase) {
      try {
        const result = await query(
          'SELECT * FROM referral_notifications WHERE for_user_id = $1 ORDER BY timestamp DESC',
          [userId]
        );
        
        if (result.rows.length > 0) {
          notifications = result.rows.map(row => ({
            id: row.id,
            forUserId: row.for_user_id,
            referredUserId: row.referred_user_id,
            referredName: row.referred_name,
            introducedBy: row.introduced_by,
            introducedByName: row.introduced_by_name,
            timestamp: new Date(row.timestamp).getTime(),
            read: row.read,
          }));
          
          // Cache in memory
          this.referralNotifications.set(userId, notifications);
        }
      } catch (error) {
        console.error('[Store] Failed to load referral notifications from database:', error);
      }
    }
    
    return notifications;
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    const notifications = this.referralNotifications.get(userId) || [];
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      
      // Also update in database
      if (this.useDatabase) {
        try {
          await query(
            'UPDATE referral_notifications SET read = TRUE WHERE id = $1',
            [notificationId]
          );
        } catch (error) {
          console.error('[Store] Failed to mark notification read in database:', error);
        }
      }
    }
  }

  async clearNotifications(userId: string): Promise<void> {
    this.referralNotifications.delete(userId);
    
    // Also delete from database
    if (this.useDatabase) {
      try {
        await query('DELETE FROM referral_notifications WHERE for_user_id = $1', [userId]);
      } catch (error) {
        console.error('[Store] Failed to clear notifications from database:', error);
      }
    }
  }

  // ===== Report & Ban System =====

  // Track IP address for user
  addUserIp(userId: string, ipAddress: string): void {
    if (!this.userIps.has(userId)) {
      this.userIps.set(userId, new Set());
    }
    this.userIps.get(userId)!.add(ipAddress);
  }

  getUserIps(userId: string): string[] {
    return Array.from(this.userIps.get(userId) || []);
  }

  // Check if IP is banned
  isIpBanned(ipAddress: string): IPBan | null {
    return this.ipBans.get(ipAddress) || null;
  }

  // Ban an IP address - with PostgreSQL support
  async banIp(ipAddress: string, userId: string, reason: string): Promise<void> {
    const ipBan: IPBan = {
      ipAddress,
      bannedAt: Date.now(),
      userId,
      reason,
    };
    this.ipBans.set(ipAddress, ipBan);
    console.log(`[Ban] IP ${ipAddress} banned for user ${userId}: ${reason}`);
    
    // Also save to PostgreSQL
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO ip_bans (ip_address, banned_at, user_id, reason)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ip_address) DO UPDATE SET user_id = EXCLUDED.user_id, reason = EXCLUDED.reason`,
          [ipAddress, new Date(), userId, reason]
        );
        console.log('[Store] IP ban saved to database');
      } catch (error) {
        console.error('[Store] Failed to save IP ban to database:', error);
      }
    }
  }

  // Create a report - with PostgreSQL support
  async createReport(report: Report): Promise<void> {
    this.reports.set(report.reportId, report);
    
    // Track by reported user
    if (!this.userReports.has(report.reportedUserId)) {
      this.userReports.set(report.reportedUserId, new Set());
    }
    this.userReports.get(report.reportedUserId)!.add(report.reportId);

    // Track reporter history (who reported whom)
    if (!this.reporterHistory.has(report.reporterUserId)) {
      this.reporterHistory.set(report.reporterUserId, new Set());
    }
    this.reporterHistory.get(report.reporterUserId)!.add(report.reportedUserId);

    console.log(`[Report] User ${report.reportedUserName} reported by ${report.reporterName}`);
    
    // Also save to PostgreSQL
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO reports (report_id, reported_user_id, reported_user_name, reported_user_selfie, reported_user_video,
                                reporter_user_id, reporter_name, reporter_ip, reason, room_id, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            report.reportId,
            report.reportedUserId,
            report.reportedUserName,
            report.reportedUserSelfie || null,
            report.reportedUserVideo || null,
            report.reporterUserId,
            report.reporterName,
            report.reporterIp,
            report.reason,
            report.roomId || null,
            new Date(report.timestamp)
          ]
        );
        console.log('[Store] Report saved to database');
      } catch (error) {
        console.error('[Store] Failed to save report to database:', error);
      }
    }
  }

  // Check if reporter already reported this user
  hasReportedUser(reporterUserId: string, reportedUserId: string): boolean {
    const reportedUsers = this.reporterHistory.get(reporterUserId);
    return reportedUsers ? reportedUsers.has(reportedUserId) : false;
  }

  // Get all reports for a user
  getReportsForUser(userId: string): Report[] {
    const reportIds = this.userReports.get(userId);
    if (!reportIds) return [];
    
    return Array.from(reportIds)
      .map(id => this.reports.get(id))
      .filter(r => r !== undefined) as Report[];
  }

  // Get report count for user (unique reporters only)
  getReportCount(userId: string): number {
    const reports = this.getReportsForUser(userId);
    const uniqueReporters = new Set(reports.map(r => r.reporterUserId));
    return uniqueReporters.size;
  }

  // Create or update ban record - with PostgreSQL support
  async createBanRecord(record: BanRecord): Promise<void> {
    this.banRecords.set(record.userId, record);
    
    // Also update user's ban status in users table
    const user = await this.getUser(record.userId);
    if (user) {
      await this.updateUser(record.userId, {
        banStatus: record.banStatus,
        bannedAt: record.bannedAt,
        bannedReason: record.bannedReason,
        reviewStatus: record.reviewStatus,
      });
    }

    // Ban all IPs associated with this user
    const userIps = this.getUserIps(record.userId);
    for (const ip of userIps) {
      await this.banIp(ip, record.userId, record.bannedReason);
    }

    console.log(`[Ban] User ${record.userName} status: ${record.banStatus}`);
    
    // Also save ban record to PostgreSQL
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO ban_records (user_id, user_name, user_selfie, user_video, ban_status, banned_at, banned_reason, 
                                    report_count, review_status, reviewed_at, reviewed_by, ip_addresses)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (user_id) DO UPDATE SET 
             ban_status = EXCLUDED.ban_status,
             banned_at = EXCLUDED.banned_at,
             banned_reason = EXCLUDED.banned_reason,
             report_count = EXCLUDED.report_count,
             review_status = EXCLUDED.review_status,
             reviewed_at = EXCLUDED.reviewed_at,
             reviewed_by = EXCLUDED.reviewed_by,
             ip_addresses = EXCLUDED.ip_addresses`,
          [
            record.userId,
            record.userName,
            record.userSelfie || null,
            record.userVideo || null,
            record.banStatus,
            new Date(record.bannedAt),
            record.bannedReason,
            record.reportCount,
            record.reviewStatus || null,
            record.reviewedAt ? new Date(record.reviewedAt) : null,
            record.reviewedBy || null,
            JSON.stringify(record.ipAddresses)
          ]
        );
        console.log('[Store] Ban record saved to database');
      } catch (error) {
        console.error('[Store] Failed to save ban record to database:', error);
      }
    }
  }

  getBanRecord(userId: string): BanRecord | undefined {
    return this.banRecords.get(userId);
  }

  getAllBanRecords(): BanRecord[] {
    return Array.from(this.banRecords.values());
  }

  // Get all permanently banned users for blacklist
  getBlacklistedUsers(): BanRecord[] {
    return Array.from(this.banRecords.values())
      .filter(record => record.banStatus === 'permanent');
  }

  // Get all pending reviews
  getPendingReviews(): BanRecord[] {
    return Array.from(this.banRecords.values())
      .filter(record => record.reviewStatus === 'pending');
  }

  // Update ban status (for admin review)
  async updateBanStatus(userId: string, newStatus: 'permanent' | 'vindicated', reviewedBy: string): Promise<void> {
    const banRecord = this.banRecords.get(userId);
    if (!banRecord) return;

    banRecord.banStatus = newStatus;
    banRecord.reviewStatus = newStatus === 'permanent' ? 'reviewed_ban' : 'reviewed_vindicate';
    banRecord.reviewedAt = Date.now();
    banRecord.reviewedBy = reviewedBy;

    // Update user
    const user = await this.getUser(userId);
    if (user) {
      if (newStatus === 'vindicated') {
        // Clear ban
        await this.updateUser(userId, {
          banStatus: 'none',
          bannedAt: undefined,
          bannedReason: undefined,
          reviewStatus: undefined,
        });
        
        // Unban IPs (only if not used by other banned users)
        const userIps = this.getUserIps(userId);
        userIps.forEach(ip => {
          // Check if any other banned user has this IP
          const otherBannedUsersWithIp = Array.from(this.banRecords.values())
            .filter(record => 
              record.userId !== userId && 
              record.banStatus !== 'vindicated' &&
              record.banStatus !== 'none' &&
              this.getUserIps(record.userId).includes(ip)
            );
          
          if (otherBannedUsersWithIp.length === 0) {
            this.ipBans.delete(ip);
          }
        });
      } else {
        await this.updateUser(userId, {
          banStatus: newStatus,
          reviewStatus: 'reviewed_ban',
        });
      }
    }

    console.log(`[Ban] User ${banRecord.userName} reviewed: ${newStatus}`);
  }

  // Check if user is banned (any type)
  // NOTE: Uses memory cache only for performance (called frequently)
  isUserBanned(userId: string): boolean {
    const user = this.users.get(userId); // Direct memory access for speed
    if (!user) return false;
    return user.banStatus === 'temporary' || user.banStatus === 'permanent';
  }

  // Get all reports (for admin)
  getAllReports(): Report[] {
    return Array.from(this.reports.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  // ===== Invite Code System =====

  // Create an invite code - with PostgreSQL support
  async createInviteCode(inviteCode: InviteCode): Promise<void> {
    // ALWAYS save to memory first (works immediately)
    this.inviteCodes.set(inviteCode.code, inviteCode);
    console.log(`[InviteCode] Created ${inviteCode.type} code: ${inviteCode.code} (${inviteCode.maxUses === -1 ? 'unlimited' : inviteCode.maxUses} uses)`);
    
    // Try to save to PostgreSQL (best effort)
    if (this.useDatabase) {
      try {
        await query(
          `INSERT INTO invite_codes (code, created_by, created_by_name, created_at, type, max_uses, uses_remaining, used_by, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (code) DO UPDATE SET 
             uses_remaining = EXCLUDED.uses_remaining,
             used_by = EXCLUDED.used_by`,
          [
            inviteCode.code,
            inviteCode.createdBy || null, // NULL if user not in DB
            inviteCode.createdByName,
            new Date(inviteCode.createdAt),
            inviteCode.type,
            inviteCode.maxUses,
            inviteCode.usesRemaining,
            JSON.stringify(inviteCode.usedBy),
            inviteCode.isActive
          ]
        );
        console.log(`[InviteCode] ✅ Saved to PostgreSQL: ${inviteCode.code}`);
      } catch (error: any) {
        // Foreign key error if user doesn't exist - that's OK, code still works in memory
        if (error.code === '23503') {
          console.warn(`[InviteCode] User not in PostgreSQL - code ${inviteCode.code} works in memory only`);
        } else {
          console.error('[Store] Failed to create invite code in database:', error);
        }
      }
    }
  }

  // Get invite code - with PostgreSQL support
  async getInviteCode(code: string): Promise<InviteCode | undefined> {
    // Check memory first
    let inviteCode = this.inviteCodes.get(code);
    
    // If not in memory and database available, check there
    if (!inviteCode && this.useDatabase) {
      try {
        const result = await query('SELECT * FROM invite_codes WHERE code = $1', [code]);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          inviteCode = {
            code: row.code,
            createdBy: row.created_by,
            createdByName: row.created_by_name,
            createdAt: new Date(row.created_at).getTime(),
            type: row.type,
            maxUses: row.max_uses,
            usesRemaining: row.uses_remaining,
            usedBy: row.used_by || [],
            isActive: row.is_active,
          };
          // Cache in memory
          this.inviteCodes.set(code, inviteCode);
        }
      } catch (error) {
        console.error('[Store] Failed to get invite code from database:', error);
      }
    }
    
    return inviteCode;
  }

  // Validate and use an invite code
  useInviteCode(code: string, userId: string, userName: string): { success: boolean; error?: string } {
    const inviteCode = this.inviteCodes.get(code);
    
    if (!inviteCode) {
      return { success: false, error: 'Invalid invite code' };
    }

    if (!inviteCode.isActive) {
      return { success: false, error: 'This invite code has been deactivated' };
    }

    // Check if user already used this code (prevent reuse)
    if (inviteCode.usedBy.includes(userId)) {
      return { success: false, error: 'You have already used this invite code' };
    }

    // Check if code has uses remaining
    if (inviteCode.type === 'user' && inviteCode.usesRemaining <= 0) {
      return { success: false, error: 'This invite code has been fully used' };
    }

    // Use the code
    inviteCode.usedBy.push(userId);
    
    // Decrement uses for user codes (admin codes have unlimited uses)
    if (inviteCode.type === 'user') {
      inviteCode.usesRemaining--;
      console.log(`[InviteCode] Code ${code} used by ${userName} - ${inviteCode.usesRemaining} uses remaining`);
    } else {
      console.log(`[InviteCode] Admin code ${code} used by ${userName} - unlimited uses`);
    }

    return { success: true };
  }

  // Get all codes created by a user
  getUserInviteCodes(userId: string): InviteCode[] {
    return Array.from(this.inviteCodes.values())
      .filter(code => code.createdBy === userId);
  }

  // Get all admin codes
  getAdminInviteCodes(): InviteCode[] {
    return Array.from(this.inviteCodes.values())
      .filter(code => code.type === 'admin');
  }

  // Deactivate a code (admin only)
  deactivateInviteCode(code: string): boolean {
    const inviteCode = this.inviteCodes.get(code);
    if (!inviteCode) return false;
    
    inviteCode.isActive = false;
    console.log(`[InviteCode] Code ${code} deactivated`);
    return true;
  }

  // ===== Rate Limiting =====

  // Check rate limit (5 attempts per hour per IP)
  checkRateLimit(ipAddress: string): { allowed: boolean; remainingAttempts?: number; retryAfter?: number } {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const maxAttempts = 5;

    let record = this.rateLimits.get(ipAddress);

    // Clean up old records (older than 1 hour)
    if (record && (now - record.firstAttemptAt) > oneHour) {
      this.rateLimits.delete(ipAddress);
      record = undefined;
    }

    if (!record) {
      // First attempt in this window
      this.rateLimits.set(ipAddress, {
        ipAddress,
        attempts: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
      });
      return { allowed: true, remainingAttempts: maxAttempts - 1 };
    }

    // Check if limit exceeded
    if (record.attempts >= maxAttempts) {
      const retryAfter = record.firstAttemptAt + oneHour - now;
      console.warn(`[RateLimit] IP ${ipAddress} exceeded limit - ${record.attempts} attempts`);
      return { allowed: false, retryAfter };
    }

    // Increment attempts
    record.attempts++;
    record.lastAttemptAt = now;
    return { allowed: true, remainingAttempts: maxAttempts - record.attempts };
  }

  // Clear rate limit for IP (admin override)
  clearRateLimit(ipAddress: string): void {
    this.rateLimits.delete(ipAddress);
    console.log(`[RateLimit] Cleared for IP: ${ipAddress}`);
  }

  // ===== SESSION COMPLETIONS (QR Grace Period) =====
  
  /**
   * Track a successful session completion
   * Increments user's count and unlocks QR after 4 completions
   */
  async trackSessionCompletion(userId: string, partnerId: string, roomId: string, durationSeconds: number): Promise<void> {
    console.log(`[Store] Tracking session completion for user ${userId.substring(0, 8)}, duration: ${durationSeconds}s`);
    
    // Only count if duration > 30 seconds (prevent gaming)
    if (durationSeconds < 30) {
      console.log('[Store] Session too short (<30s), not counting for QR unlock');
      return;
    }
    
    if (this.useDatabase) {
      try {
        // Insert completion record (UNIQUE constraint prevents duplicates)
        await query(
          `INSERT INTO session_completions (user_id, partner_id, room_id, duration_seconds)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, room_id) DO NOTHING`,
          [userId, partnerId, roomId, durationSeconds]
        );
        
        // Get user's total successful sessions
        const countResult = await query(
          `SELECT COUNT(*) as count FROM session_completions WHERE user_id = $1`,
          [userId]
        );
        
        const totalSessions = parseInt(countResult.rows[0]?.count || '0');
        console.log(`[Store] User ${userId.substring(0, 8)} now has ${totalSessions} successful sessions`);
        
        // Update user's successful_sessions count
        await query(
          `UPDATE users SET successful_sessions = $1 WHERE user_id = $2`,
          [totalSessions, userId]
        );
        
        // CRITICAL: Invalidate cache so next getUser returns fresh data
        userCache.delete(userId);
        const queryCacheKey = generateCacheKey('user', userId);
        queryCache.delete(queryCacheKey);
        
        // Check if should unlock QR (4+ sessions and not already unlocked)
        if (totalSessions >= 4) {
          const userResult = await query(
            `SELECT qr_unlocked FROM users WHERE user_id = $1`,
            [userId]
          );
          
          if (userResult.rows[0] && !userResult.rows[0].qr_unlocked) {
            await query(
              `UPDATE users SET qr_unlocked = TRUE, qr_unlocked_at = NOW(), paid_status = 'qr_verified'
               WHERE user_id = $1`,
              [userId]
            );
            
            console.log(`[Store] 🎉 QR code unlocked for user ${userId.substring(0, 8)} after ${totalSessions} sessions!`);
            
            // Update in-memory cache
            const user = await this.getUser(userId);
            if (user) {
              user.qrUnlocked = true;
              user.successfulSessions = totalSessions;
              user.qrUnlockedAt = Date.now();
              if (user.paidStatus === 'qr_grace_period') {
                user.paidStatus = 'qr_verified';
              }
            }
          }
        }
      } catch (error) {
        console.error('[Store] Failed to track session completion:', error);
      }
    } else {
      // Memory-only mode
      const user = await this.getUser(userId);
      if (user) {
        user.successfulSessions = (user.successfulSessions || 0) + 1;
        
        if (user.successfulSessions >= 4 && !user.qrUnlocked) {
          user.qrUnlocked = true;
          user.qrUnlockedAt = Date.now();
          if (user.paidStatus === 'qr_grace_period') {
            user.paidStatus = 'qr_verified';
          }
          console.log(`[Store] 🎉 QR code unlocked for user ${userId.substring(0, 8)}!`);
        }
      }
    }
  }
  
  /**
   * Get user's QR unlock status
   * ALWAYS queries database for accurate real-time count
   */
  async getQrUnlockStatus(userId: string): Promise<{ unlocked: boolean; sessionsCompleted: number; sessionsNeeded: number }> {
    // Query database directly for most accurate count (bypass cache)
    if (this.useDatabase) {
      try {
        const result = await query(
          'SELECT qr_unlocked, successful_sessions FROM users WHERE user_id = $1',
          [userId]
        );
        
        if (result.rows[0]) {
          return {
            unlocked: result.rows[0].qr_unlocked || false,
            sessionsCompleted: result.rows[0].successful_sessions || 0,
            sessionsNeeded: 4,
          };
        }
      } catch (error) {
        console.error('[Store] Failed to get QR status from database:', error);
      }
    }
    
    // Fallback to memory/cache
    const user = await this.getUser(userId);
    return {
      unlocked: user?.qrUnlocked || false,
      sessionsCompleted: user?.successfulSessions || 0,
      sessionsNeeded: 4,
    };
  }

  // ===== SINGLE SESSION ENFORCEMENT =====
  
  /**
   * Invalidate all active sessions for a user (except optionally one)
   * Used when user logs in from new device
   */
  async invalidateUserSessions(userId: string, exceptToken?: string): Promise<number> {
    console.log(`[Store] Invalidating all sessions for user ${userId.substring(0, 8)} except ${exceptToken?.substring(0, 8) || 'none'}`);
    
    let invalidatedCount = 0;
    
    if (this.useDatabase) {
      try {
        // Use different query depending on whether exceptToken is provided
        const result = exceptToken
          ? await query(
              `UPDATE sessions 
               SET is_active = FALSE, last_active_at = NOW()
               WHERE user_id = $1 AND is_active = TRUE AND session_token != $2
               RETURNING session_token`,
              [userId, exceptToken]
            )
          : await query(
              `UPDATE sessions 
               SET is_active = FALSE, last_active_at = NOW()
               WHERE user_id = $1 AND is_active = TRUE
               RETURNING session_token`,
              [userId]
            );
        
        invalidatedCount = result.rows.length;
        
        // Also clear from memory cache
        result.rows.forEach((row: any) => {
          this.sessions.delete(row.session_token);
          sessionCache.delete(row.session_token);
        });
        
        console.log(`[Store] Invalidated ${invalidatedCount} active sessions in database`);
      } catch (error) {
        console.error('[Store] Failed to invalidate sessions:', error);
      }
    } else {
      // Memory-only mode
      for (const [token, session] of this.sessions.entries()) {
        if (session.userId === userId && token !== exceptToken) {
          session.isActive = false;
          session.lastActiveAt = Date.now();
          invalidatedCount++;
        }
      }
    }
    
    return invalidatedCount;
  }

  /**
   * Check if a session is still active (not invalidated by new login)
   */
  async isSessionActive(sessionToken: string): Promise<boolean> {
    const session = await this.getSession(sessionToken);
    if (!session) return false;
    
    // Default to true if isActive not set (backward compatibility)
    return session.isActive !== false;
  }

  // ===== EVENT MODE METHODS =====

  /**
   * Get current event settings (singleton pattern - always 1 row)
   */
  async getEventSettings(): Promise<EventSettings> {
    if (this.useDatabase) {
      try {
        const result = await query('SELECT * FROM event_settings LIMIT 1');
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            id: row.id,
            eventModeEnabled: row.event_mode_enabled,
            eventStartTime: row.event_start_time,
            eventEndTime: row.event_end_time,
            timezone: row.timezone,
            eventDays: row.event_days || [],
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at).getTime(),
          };
        }
      } catch (error) {
        console.error('[Store] Failed to get event settings:', error);
      }
    }
    
    // Return default settings if database unavailable or no row exists
    return {
      eventModeEnabled: false,
      eventStartTime: '15:00:00',
      eventEndTime: '18:00:00',
      timezone: 'America/Los_Angeles',
      eventDays: [],
    };
  }

  /**
   * Update event settings (admin only)
   */
  async updateEventSettings(settings: Partial<EventSettings>): Promise<void> {
    if (this.useDatabase) {
      try {
        // Build dynamic UPDATE query
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;
        
        if (settings.eventModeEnabled !== undefined) {
          setClauses.push(`event_mode_enabled = $${paramIndex++}`);
          values.push(settings.eventModeEnabled);
        }
        if (settings.eventStartTime !== undefined) {
          setClauses.push(`event_start_time = $${paramIndex++}`);
          values.push(settings.eventStartTime);
        }
        if (settings.eventEndTime !== undefined) {
          setClauses.push(`event_end_time = $${paramIndex++}`);
          values.push(settings.eventEndTime);
        }
        if (settings.timezone !== undefined) {
          setClauses.push(`timezone = $${paramIndex++}`);
          values.push(settings.timezone);
        }
        if (settings.eventDays !== undefined) {
          setClauses.push(`event_days = $${paramIndex++}`);
          values.push(JSON.stringify(settings.eventDays));
        }
        
        if (setClauses.length > 0) {
          setClauses.push(`updated_at = NOW()`);
          
          await query(
            `UPDATE event_settings SET ${setClauses.join(', ')} WHERE id = 1`,
            values
          );
          
          console.log('[Store] Event settings updated:', settings);
        }
      } catch (error) {
        console.error('[Store] Failed to update event settings:', error);
        throw error;
      }
    } else {
      console.warn('[Store] Cannot update event settings - database not available');
      throw new Error('Database not available');
    }
  }

  /**
   * Save or update user's RSVP for an event date
   * Auto-resets to default time (3pm) if date changes
   */
  async saveEventRSVP(userId: string, preferredTime: string, eventDate: string): Promise<void> {
    if (this.useDatabase) {
      try {
        // Check if RSVP for this date already exists
        const existingResult = await query(
          'SELECT preferred_time, event_date FROM event_rsvps WHERE user_id = $1 AND event_date = $2',
          [userId, eventDate]
        );
        
        // If RSVP exists for same date, update it
        // If date changed or no RSVP, insert/update with new time
        await query(
          `INSERT INTO event_rsvps (user_id, preferred_time, event_date, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (user_id, event_date) DO UPDATE SET
             preferred_time = EXCLUDED.preferred_time,
             updated_at = NOW()`,
          [userId, preferredTime, eventDate]
        );
        
        console.log(`[Store] RSVP saved: User ${userId.substring(0, 8)} for ${eventDate} at ${preferredTime}`);
      } catch (error) {
        console.error('[Store] Failed to save RSVP:', error);
        throw error;
      }
    } else {
      console.warn('[Store] Cannot save RSVP - database not available');
      throw new Error('Database not available');
    }
  }

  /**
   * Get user's RSVP for a specific date
   */
  async getUserRSVP(userId: string, eventDate: string): Promise<EventRSVP | null> {
    if (this.useDatabase) {
      try {
        const result = await query(
          'SELECT * FROM event_rsvps WHERE user_id = $1 AND event_date = $2',
          [userId, eventDate]
        );
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            id: row.id,
            userId: row.user_id,
            preferredTime: row.preferred_time,
            eventDate: row.event_date,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: new Date(row.updated_at).getTime(),
          };
        }
      } catch (error) {
        console.error('[Store] Failed to get user RSVP:', error);
      }
    }
    
    return null;
  }

  /**
   * Get attendance data for a specific date
   * Returns count of users per time slot
   */
  async getEventAttendance(eventDate: string): Promise<Record<string, number>> {
    if (this.useDatabase) {
      try {
        // Get all RSVPs for this date, grouped by time
        const result = await query(
          `SELECT preferred_time, COUNT(*) as count
           FROM event_rsvps
           WHERE event_date = $1
           GROUP BY preferred_time
           ORDER BY preferred_time ASC`,
          [eventDate]
        );
        
        const attendance: Record<string, number> = {};
        result.rows.forEach(row => {
          // Format time as HH:MM (remove seconds)
          const time = row.preferred_time.substring(0, 5);
          attendance[time] = parseInt(row.count);
        });
        
        return attendance;
      } catch (error) {
        console.error('[Store] Failed to get event attendance:', error);
        return {};
      }
    }
    
    return {};
  }

  /**
   * Clean up old RSVPs (older than 7 days)
   * Should be called periodically
   */
  async cleanupOldRSVPs(): Promise<number> {
    if (this.useDatabase) {
      try {
        const result = await query(
          `DELETE FROM event_rsvps WHERE event_date < CURRENT_DATE - INTERVAL '7 days' RETURNING id`
        );
        const deletedCount = result.rows.length;
        
        if (deletedCount > 0) {
          console.log(`[Store] Cleaned up ${deletedCount} old RSVPs`);
        }
        
        return deletedCount;
      } catch (error) {
        console.error('[Store] Failed to cleanup old RSVPs:', error);
        return 0;
      }
    }
    
    return 0;
  }

  /**
   * Check if current time is within event window
   * Returns true if event is active now
   * FIXED: Proper timezone handling for both time and day
   */
  async isEventActive(): Promise<boolean> {
    const settings = await this.getEventSettings();
    
    if (!settings.eventModeEnabled) {
      return false; // Event mode is off
    }
    
    // Get current time in event timezone
    const now = new Date();
    
    // Format time with explicit timezone (returns "15:45:12" format)
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const currentTime = timeFormatter.format(now);
    
    // FIXED: Get day of week IN THE EVENT TIMEZONE (not server timezone)
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.timezone,
      weekday: 'short', // Returns 'Sun', 'Mon', etc.
    });
    
    const dayString = dayFormatter.format(now);
    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };
    const dayOfWeek = dayMap[dayString];
    
    // Check if current time is within event window
    const isWithinWindow = currentTime >= settings.eventStartTime && 
                          currentTime <= settings.eventEndTime;
    
    // Check if today is an event day (if eventDays is configured)
    if (settings.eventDays.length > 0) {
      const isEventDay = settings.eventDays.includes(dayOfWeek);
      
      console.log(`[Store] Event active check: time=${currentTime}, window=${settings.eventStartTime}-${settings.eventEndTime}, day=${dayString}(${dayOfWeek}), isDay=${isEventDay}, isTime=${isWithinWindow}`);
      
      return isWithinWindow && isEventDay;
    }
    
    console.log(`[Store] Event active check: time=${currentTime}, window=${settings.eventStartTime}-${settings.eventEndTime}, isWithin=${isWithinWindow}`);
    
    return isWithinWindow;
  }
}

export const store = new DataStore();

