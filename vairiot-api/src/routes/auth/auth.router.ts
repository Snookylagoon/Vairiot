import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { login, refreshTokens } from '../../services/auth.service';
import { authenticate } from '../../middleware/authenticate';
import { blacklistToken } from '../../lib/redis';
import { verifyRefreshToken } from '../../lib/jwt';
import { loginLimiter } from '../../middleware/rate-limit';
export const authRouter = Router();
authRouter.post('/login', loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 8 }), body('tenantId').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      res.status(200).json(await login({ email: req.body.email, password: req.body.password, tenantId: req.body.tenantId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_CREDENTIALS') { res.status(401).json({ error: 'Invalid email or password' }); return; }
      if (msg === 'SSO_ONLY') { res.status(400).json({ error: 'This account uses single sign-on.' }); return; }
      res.status(500).json({ error: 'Login failed' });
    }
  },
);
authRouter.post('/refresh',
  [body('refreshToken').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(200).json(await refreshTokens(req.body.refreshToken)); }
    catch { res.status(401).json({ error: 'Invalid or expired refresh token' }); }
  },
);
authRouter.get('/me', authenticate, (req: Request, res: Response): void => {
  res.status(200).json({ userId: req.user!.sub, email: req.user!.email, tenantId: req.user!.tenantId, roles: req.user!.roles, permissions: req.user!.permissions });
});
authRouter.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
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
  res.status(200).json({ message: 'Logged out successfully' });
});
