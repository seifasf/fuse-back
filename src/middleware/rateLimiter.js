import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Strict rate limiter for login requests to block automated brute-force attacks.
 * Only failed attempts count against the limit.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'development' ? 40 : 8,
  skipSuccessfulRequests: true, // Successful logins are not penalized
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many failed login attempts from this network. For security, please wait 15 minutes before trying again.',
  },
});

/**
 * Rate limiter for verifying the admin security key.
 * Only failed attempts count against the limit.
 */
export const adminKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'development' ? 30 : 6,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many security key verification attempts. Security lock engaged for 15 minutes.',
  },
});

/**
 * Rate limiter for user registration to prevent bot account floods.
 * Max 5 registrations per hour per IP.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Registration rate limit exceeded. Please try again later.',
  },
});
