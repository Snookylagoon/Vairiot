import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { login, refreshTokens } from '../../services/auth.service';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import { blacklistToken } from '../../lib/redis';
import { verifyRefreshToken } from '../../lib/jwt';
import { loginLimiter } from '../../middleware/rate-limit';

export const authRouter = Router();

authRouter.post('/login', loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 8 }), body('tenantId').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await login({ email: req.body.email, password: req.body.password, tenantId: req.body.tenantId }));
  }),
);

authRouter.post('/refresh',
  [body('refreshToken').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await refreshTokens(req.body.refreshToken));
  }),
);

authRouter.get('/me', authenticate, (req: Request, res: Response): void => {
  res.json({
    userId: req.user!.sub,
    email: req.user!.email,
    tenantId: req.user!.tenantId,
    roles: req.user!.roles,
    permissions: req.user!.permissions,
  });
});

authRouter.post('/logout', authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    if (user.jti && user.exp) {
      const ttl = user.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await blacklistToken(user.jti, ttl);
    }
    const { refreshToken } = req.body ?? {};
    if (refreshToken) {
      try {
        const rp = verifyRefreshToken(refreshToken);
        if (rp.jti && rp.exp) {
          const ttl = rp.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) await blacklistToken(rp.jti, ttl);
        }
      } catch { /* invalid refresh token — ignore */ }
    }
    res.json({ message: 'Logged out successfully' });
  }),
);
