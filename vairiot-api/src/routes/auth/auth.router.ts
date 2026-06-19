import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { login, loginWithTwoFactor, refreshTokens } from '../../services/auth.service';
import { acceptInvite } from '../../services/user.service';
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
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const result = await login({ email: req.body.email, password: req.body.password, tenantId: req.body.tenantId }, ipAddress);
    res.json(result);
  }),
);

authRouter.post('/login/2fa', loginLimiter,
  [body('userId').notEmpty(), body('token').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const result = await loginWithTwoFactor(req.body.userId, req.body.token, ipAddress);
    res.json(result);
  }),
);

authRouter.post('/accept-invite',
  [body('token').notEmpty(), body('password').isLength({ min: 8 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await acceptInvite(req.body.token, req.body.password));
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
