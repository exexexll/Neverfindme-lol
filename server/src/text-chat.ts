/**
 * Text Chat System - Backend Handlers
 * Phase 1b: Message storage, validation, and rate limiting
 */

import { query } from './database';
import { store } from './store';

/**
 * Rate Limit Check - 1.5 second cooldown between messages
 * Uses database for persistence across restarts and server instances
 */
export async function checkMessageRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const COOLDOWN_MS = 1500; // 1.5 seconds
  const now = Date.now();
  
  try {
    // Get last message time from database
    const result = await query(
      `SELECT last_message_at FROM message_rate_limits WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      const lastMessageAt = new Date(result.rows[0].last_message_at).getTime();
      const timeSinceLastMessage = now - lastMessageAt;
      
      if (timeSinceLastMessage < COOLDOWN_MS) {
        const retryAfter = Math.ceil((COOLDOWN_MS - timeSinceLastMessage) / 1000);
        return { allowed: false, retryAfter };
      }
    }
    
    // Update last message time in database
    await query(
      `INSERT INTO message_rate_limits (user_id, last_message_at, message_count_last_minute)
       VALUES ($1, NOW(), 1)
       ON CONFLICT (user_id) DO UPDATE 
       SET last_message_at = NOW(), updated_at = NOW()`,
      [userId]
    );
    
    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    console.error('[TextChat] Rate limit check failed (allowing message):', error);
    // Fail open - allow message if database error
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Sanitize message content - prevent XSS and spam
 */
export function sanitizeMessageContent(content: string): string {
  if (!content) return '';
  
  // Strip HTML tags
  let sanitized = content.replace(/<[^>]*>/g, '');
  
  // Limit length
  sanitized = sanitized.substring(0, 500);
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Validate message data
 */
export function validateMessage(messageType: string, content?: string, fileUrl?: string, gifUrl?: string, fileSizeBytes?: number): { valid: boolean; error?: string } {
  // Check message type
  if (!['text', 'image', 'file', 'gif', 'system'].includes(messageType)) {
    return { valid: false, error: 'Invalid message type' };
  }
  
  // Validate based on type
  if (messageType === 'text') {
    if (!content || content.trim().length === 0) {
      return { valid: false, error: 'Text message cannot be empty' };
    }
    if (content.length > 500) {
      return { valid: false, error: 'Message too long (max 500 characters)' };
    }
  }
  
  if (messageType === 'image' || messageType === 'file') {
    if (!fileUrl) {
      return { valid: false, error: 'File URL required' };
    }
    // Must be HTTPS from Cloudinary (our upload service)
    if (!fileUrl.startsWith('https://res.cloudinary.com/')) {
      return { valid: false, error: 'Invalid file URL (must be from Cloudinary)' };
    }
    // File size limit: 5MB
    if (messageType === 'file' && fileSizeBytes && fileSizeBytes > 5 * 1024 * 1024) {
      return { valid: false, error: 'File too large (max 5MB)' };
    }
  }
  
  if (messageType === 'gif') {
    if (!gifUrl) {
      return { valid: false, error: 'GIF URL required' };
    }
    // Strict Tenor URL validation (prevent spoofing)
    const tenorRegex = /^https:\/\/(media\.tenor\.com|tenor\.com)\/.+/i;
    if (!tenorRegex.test(gifUrl)) {
      return { valid: false, error: 'Invalid GIF URL (must be from tenor.com)' };
    }
  }
  
  return { valid: true };
}

/**
 * Save chat message to database
 */
export async function saveChatMessage(message: {
  sessionId: string;
  roomId: string;
  senderUserId: string;
  receiverUserId: string;
  messageType: string;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  gifUrl?: string;
  gifId?: string;
}): Promise<{ messageId: string; sentAt: Date }> {
  try {
    const result = await query(
      `INSERT INTO chat_messages 
       (session_id, room_id, sender_user_id, receiver_user_id, message_type, content, file_url, file_name, file_size_bytes, gif_url, gif_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING message_id, sent_at`,
      [
        message.sessionId,
        message.roomId,
        message.senderUserId,
        message.receiverUserId,
        message.messageType,
        message.content || null,
        message.fileUrl || null,
        message.fileName || null,
        message.fileSizeBytes || null,
        message.gifUrl || null,
        message.gifId || null,
      ]
    );
    
    console.log(`[TextChat] ✅ Message saved: ${message.messageType} from ${message.senderUserId.substring(0, 8)}`);
    
    return {
      messageId: result.rows[0].message_id,
      sentAt: result.rows[0].sent_at,
    };
  } catch (error) {
    console.error('[TextChat] Failed to save message:', error);
    throw new Error('Failed to save message');
  }
}

/**
 * Get chat messages for a room
 */
export async function getRoomMessages(roomId: string, limit: number = 100): Promise<any[]> {
  try {
    const result = await query(
      `SELECT 
        message_id,
        sender_user_id,
        message_type,
        content,
        file_url,
        file_name,
        gif_url,
        sent_at,
        read_at
       FROM chat_messages
       WHERE room_id = $1
       AND deleted = FALSE
       ORDER BY sent_at ASC
       LIMIT $2`,
      [roomId, limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('[TextChat] Failed to get messages:', error);
    return [];
  }
}

/**
 * Mark message as read
 */
export async function markMessageRead(messageId: string): Promise<void> {
  try {
    await query(
      `UPDATE chat_messages SET read_at = NOW() WHERE message_id = $1 AND read_at IS NULL`,
      [messageId]
    );
  } catch (error) {
    console.error('[TextChat] Failed to mark message as read:', error);
  }
}

/**
 * Delete message (soft delete)
 */
export async function deleteMessage(messageId: string, userId: string): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE chat_messages 
       SET deleted = TRUE 
       WHERE message_id = $1 
       AND sender_user_id = $2 
       AND deleted = FALSE
       RETURNING message_id`,
      [messageId, userId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('[TextChat] Failed to delete message:', error);
    return false;
  }
}

/**
 * Save chat recording (for reports)
 */
export async function saveChatRecording(recording: {
  sessionId: string;
  roomId: string;
  recordingUrl: string;
  recordingPublicId: string;
  fileSizeBytes: number;
  durationSeconds: number;
  chatMode: 'text' | 'video';
  startedAt: Date;
  endedAt: Date;
  reportId?: string;
}): Promise<string> {
  try {
    const result = await query(
      `INSERT INTO chat_recordings 
       (session_id, room_id, recording_url, recording_public_id, file_size_bytes, duration_seconds, chat_mode, started_at, ended_at, retained_for_report, report_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING recording_id`,
      [
        recording.sessionId,
        recording.roomId,
        recording.recordingUrl,
        recording.recordingPublicId,
        recording.fileSizeBytes,
        recording.durationSeconds,
        recording.chatMode,
        recording.startedAt,
        recording.endedAt,
        !!recording.reportId, // retained_for_report
        recording.reportId || null,
      ]
    );
    
    console.log(`[TextChat] ✅ Recording saved: ${recording.chatMode} mode, ${recording.durationSeconds}s`);
    
    return result.rows[0].recording_id;
  } catch (error) {
    console.error('[TextChat] Failed to save recording:', error);
    throw new Error('Failed to save recording');
  }
}

/**
 * Get room message count
 */
export async function getRoomMessageCount(roomId: string): Promise<number> {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM chat_messages WHERE room_id = $1 AND deleted = FALSE`,
      [roomId]
    );
    
    return parseInt(result.rows[0].count) || 0;
  } catch (error) {
    console.error('[TextChat] Failed to get message count:', error);
    return 0;
  }
}

