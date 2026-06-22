import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { login, loginWithTwoFactor, refreshTokens } from '../../services/auth.service';
import { acceptInvite } from '../../services/user.service';
import { registerNewTenant } from '../../services/registration.service';
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
    const result = await login(
      { email: req.body.email, password: req.body.password, tenantId: req.body.tenantId },
      ipAddress,
      req.body.device,
    );
    res.json(result);
  }),
);

authRouter.post('/login/2fa', loginLimiter,
  [body('userId').notEmpty(), body('token').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const result = await loginWithTwoFactor(req.body.userId, req.body.token, ipAddress, req.body.device);
    res.json(result);
  }),
);

authRouter.post('/register', loginLimiter,
  [
    body('organisationName').trim().notEmpty().withMessage('Organisation name is required'),
    body('name').trim().notEmpty().withMessage('Your name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 12 }).withMessage('Password must be at least 12 characters'),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const result = await registerNewTenant({
      organisationName: req.body.organisationName,
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
    });
    res.status(201).json(result);
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

authRouter.get('/me', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { prisma } = await import('../../lib/prisma');
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: { name: true, featureFlags: true, company: { select: { legalName: true, currency: true } } },
  });
  const flags = (tenant?.featureFlags && typeof tenant.featureFlags === 'object' && !Array.isArray(tenant.featureFlags))
    ? tenant.featureFlags as Record<string, boolean>
    : {};
  res.json({
    userId: req.user!.sub,
    email: req.user!.email,
    tenantId: req.user!.tenantId,
    tenantName: tenant?.company?.legalName ?? tenant?.name ?? req.user!.tenantId,
    currency: tenant?.company?.currency ?? 'USD',
    roles: req.user!.roles,
    permissions: req.user!.permissions,
    featureFlags: flags,
  });
}));

// Tenant-scoped currency setting — any authenticated user of the tenant may set it.
authRouter.patch('/currency', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const code = String(req.body?.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    res.status(400).json({ error: 'currency must be a 3-letter ISO 4217 code' });
    return;
  }
  const { prisma } = await import('../../lib/prisma');
  const tenantId = req.user!.tenantId;
  const existing = await prisma.company.findUnique({ where: { tenantId } });
  if (existing) {
    await prisma.company.update({ where: { tenantId }, data: { currency: code } });
  } else {
    // Company not yet registered — store currency on a stub so it persists; legalName placeholder uses tenant name.
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    await prisma.company.create({
      data: {
        tenantId,
        legalName: tenant?.name ?? tenantId,
        addressLine1: '',
        city: '',
        country: '',
        primaryContactName: '',
        primaryContactEmail: '',
        currency: code,
      },
    });
  }
  res.json({ currency: code });
}));

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
