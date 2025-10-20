// Core types for the application

export type Gender = 'female' | 'male' | 'nonbinary' | 'unspecified';
export type AccountType = 'guest' | 'permanent';
export type BanStatus = 'none' | 'temporary' | 'permanent' | 'vindicated';
export type ReviewStatus = 'pending' | 'reviewed_ban' | 'reviewed_vindicate';

export interface User {
  userId: string;
  name: string;
  gender: Gender;
  accountType: AccountType;
  email?: string;
  password_hash?: string; // bcrypt hashed password (cost factor: 12)
  selfieUrl?: string;
  videoUrl?: string;
  socials?: Record<string, string>; // Normalized social handles
  createdAt: number;
  // Metrics for Block 6
  timerTotalSeconds?: number;
  sessionCount?: number;
  lastSessions?: Array<{ at: number; duration: number }>;
  streakDays?: number;
  // Referral system
  referralCode?: string; // Unique code for this user
  referredBy?: string; // User ID of who referred them
  referrals?: string[]; // Array of user IDs this user has referred
  // Introduction system (matchmaker)
  introducedTo?: string; // User ID they were introduced to (target)
  introducedViaCode?: string; // Referral code used for introduction
  introducedBy?: string; // User ID of person who made the intro (creator)
  // Ban system
  banStatus?: BanStatus;
  bannedAt?: number;
  bannedReason?: string;
  reviewStatus?: ReviewStatus;
  // Paywall system
  paidStatus?: 'unpaid' | 'paid' | 'qr_verified' | 'qr_grace_period';
  paidAt?: number;
  paymentId?: string; // Stripe payment intent ID
  inviteCodeUsed?: string; // QR/invite code used for free access
  myInviteCode?: string; // User's own invite code (5 uses)
  inviteCodeUsesRemaining?: number; // How many uses left on their code
  qrUnlocked?: boolean; // QR code unlocked after 4 sessions
  successfulSessions?: number; // Count of completed video calls
  qrUnlockedAt?: number; // When QR was unlocked
  // Event mode VIP access
  canAccessOutsideEvents?: boolean; // VIP users can bypass event restrictions
  // Email/phone verification (Phase 2)
  email_verified?: boolean;
  verification_code?: string | null;
  verification_code_expires_at?: number | null;
  verification_attempts?: number;
  phone_number?: string;
  phone_verified?: boolean;
}

export interface Report {
  reportId: string;
  reportedUserId: string;
  reportedUserName: string;
  reportedUserSelfie?: string;
  reportedUserVideo?: string;
  reporterUserId: string;
  reporterName: string;
  reporterIp: string;
  reason?: string;
  timestamp: number;
  roomId?: string;
}

export interface BanRecord {
  userId: string;
  userName: string;
  userSelfie?: string;
  userVideo?: string;
  banStatus: BanStatus;
  bannedAt: number;
  bannedReason: string;
  reportCount: number;
  reviewStatus: ReviewStatus;
  reviewedAt?: number;
  reviewedBy?: string;
  ipAddresses: string[];
}

export interface IPBan {
  ipAddress: string;
  bannedAt: number;
  userId: string;
  reason: string;
}

export interface ReferralNotification {
  id: string;
  forUserId: string; // Who should receive this notification (target)
  referredUserId: string; // The user who signed up (new person)
  referredName: string;
  introducedBy: string; // Who made the introduction (creator)
  introducedByName: string;
  timestamp: number;
  read: boolean;
}

export interface Session {
  sessionToken: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  ipAddress?: string;
  deviceInfo?: string; // Browser/device fingerprint
  isActive?: boolean; // For single-session enforcement
  lastActiveAt?: number; // Track last activity
}

export interface SessionCompletion {
  id?: number;
  userId: string;
  partnerId: string;
  roomId: string;
  durationSeconds: number;
  completedAt: number;
}

export interface InviteCode {
  code: string; // The actual code string (QR code content)
  createdBy: string; // userId who created it
  createdByName: string;
  createdAt: number;
  type: 'user' | 'admin'; // user codes have 5 uses, admin codes unlimited
  maxUses: number; // 5 for user, -1 for admin (unlimited)
  usesRemaining: number; // Decrements on each use
  usedBy: string[]; // Array of userIds who used this code
  isActive: boolean; // Can be deactivated by admin
}

export interface RateLimitRecord {
  ipAddress: string;
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
}

// ===== Event Mode Types =====

export interface EventSettings {
  id?: number;
  eventModeEnabled: boolean;
  eventStartTime: string; // TIME format '15:00:00'
  eventEndTime: string;   // TIME format '18:00:00'
  timezone: string;       // e.g., 'America/Los_Angeles'
  eventDays: number[];    // Array of day indices [0-6] where 0=Sunday
  eventTitle?: string;    // Custom title for event-wait page (default: "Event Mode Active")
  eventBannerText?: string; // Custom text for banner notification (default: "Event Mode")
  createdAt?: number;
  updatedAt?: number;
}

export interface EventRSVP {
  id?: number;
  userId: string;
  preferredTime: string; // TIME format '15:00:00'
  eventDate: string;     // DATE format 'YYYY-MM-DD'
  createdAt?: number;
  updatedAt?: number;
}

export interface EventAttendance {
  [timeSlot: string]: number; // e.g., { '15:00': 12, '15:30': 18 }
}

