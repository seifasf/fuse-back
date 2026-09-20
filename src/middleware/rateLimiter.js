import rateLimit from 'express-rate-limit';

/** Light brute-force guard  -  does not slow successful logins. */
export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many failed login attempts. Please wait a few minutes.',
  },
});

export const adminKeyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many attempts. Please wait a few minutes.',
  },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Registration rate limit exceeded. Please try again later.',
  },
});

/** Public contact form  -  stop spam floods without blocking real guests. */
export const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many messages sent. Please wait a few minutes and try again.',
  },
});
