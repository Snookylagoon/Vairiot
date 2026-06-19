import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a minute.' },
  skipSuccessfulRequests: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10000 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  validate: { trustProxy: false, xForwardedForHeader: false },
});
