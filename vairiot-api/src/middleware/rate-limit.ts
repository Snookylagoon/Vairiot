import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
  skipSuccessfulRequests: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  validate: { trustProxy: false, xForwardedForHeader: false },
});
