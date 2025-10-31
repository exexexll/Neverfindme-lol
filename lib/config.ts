/**
 * Centralized Configuration
 * All environment variables in one place
 * Import this in any file that needs API_BASE
 */

// API Base URL (backend server)
// Production fallback to Railway (not localhost)
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 
                        (typeof window !== 'undefined' ? 'https://napalmsky-production.up.railway.app' : 'http://localhost:3001');

// Socket URL (for real-time connections)
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 
                          (typeof window !== 'undefined' ? 'https://napalmsky-production.up.railway.app' : 'http://localhost:3001');

// Stripe Public Key
export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_KEY || '';

// Environment
export const IS_PRODUCTION = process.env.NEXT_PUBLIC_ENV === 'production';
export const IS_DEVELOPMENT = !IS_PRODUCTION;

// Feature flags (for gradual rollouts)
export const FEATURES = {
  referralSystem: true,
  testMode: IS_DEVELOPMENT,
  analytics: IS_PRODUCTION,
};

// Log configuration on startup
if (typeof window !== 'undefined' && IS_DEVELOPMENT) {
  console.log('[Config] Environment:', {
    API_BASE,
    SOCKET_URL,
    IS_PRODUCTION,
    FEATURES
  });
}


// Force fresh Vercel build - Wed Oct 15 01:59:58 PDT 2025
