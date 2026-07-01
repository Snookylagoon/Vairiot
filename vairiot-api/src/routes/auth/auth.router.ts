import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { login, loginWithTwoFactor, refreshTokens, changeOwnPassword, completeForcedPasswordChange } from '../../services/auth.service';
import { acceptInvite } from '../../services/user.service';
import { registerNewTenant } from '../../services/registration.service';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import { blacklistToken } from '../../lib/redis';
import { signAccessToken, signRefreshToken, verifyRefreshToken, verifySetupToken } from '../../lib/jwt';
import { loginLimiter } from '../../middleware/rate-limit';
import { generateTwoFactorSetup, verifyAndEnableTwoFactor } from '../../services/two-factor.service';
import { effectivePermissionsForUser } from '../../services/user-permissions.service';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { recordLoginAttempt } from '../../services/login-protection.service';
import { touchDeviceOnLogin } from '../../services/licence.service';
import { UnauthorizedError } from '../../lib/errors';

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
  [body('challengeToken').isString().notEmpty(), body('token').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const result = await loginWithTwoFactor(req.body.challengeToken, req.body.token, ipAddress, req.body.device);
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
  [body('token').notEmpty(), body('password').isLength({ min: 12 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await acceptInvite(req.body.token, req.body.password));
  }),
);

// Authenticated self-service: change your own password
authRouter.post('/change-password', authenticate,
  [body('currentPassword').isString().notEmpty(), body('newPassword').isString().isLength({ min: 12 })],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await changeOwnPassword(req.user!.sub, req.body.currentPassword, req.body.newPassword));
  }),
);

// Unauthenticated: complete a forced password change after the login challenge
authRouter.post('/change-password/forced', loginLimiter,
  [
    body('challengeToken').isString().notEmpty(),
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 12 }),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const result = await completeForcedPasswordChange(
      req.body.challengeToken,
      req.body.currentPassword,
      req.body.newPassword,
      ipAddress,
      req.body.device,
    );
    res.json(result);
  }),
);

// ── First-time 2FA enrolment (no access token yet — uses a short-lived setupToken) ──
authRouter.post('/2fa-setup/generate', loginLimiter,
  [body('setupToken').isString().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    let payload;
    try { payload = verifySetupToken(req.body.setupToken); }
    catch { throw new UnauthorizedError('2FA setup session expired — please sign in again'); }
    const setup = await generateTwoFactorSetup(payload.sub, payload.email);
    res.json(setup);
  }),
);

authRouter.post('/2fa-setup/verify', loginLimiter,
  [body('setupToken').isString().notEmpty(), body('token').isString().notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    let payload;
    try { payload = verifySetupToken(req.body.setupToken); }
    catch { throw new UnauthorizedError('2FA setup session expired — please sign in again'); }

    await verifyAndEnableTwoFactor(payload.sub, req.body.token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.active) throw new UnauthorizedError('User not found or inactive');

    const ipAddress = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    const roles       = user.roles.map((ur) => ur.role.name);
    const permissions = await effectivePermissionsForUser(user.id, user);
    const accessToken  = signAccessToken({ sub: user.id, tenantId: user.tenantId, email: user.email, roles, permissions });
    const refreshToken = signRefreshToken({ sub: user.id, tenantId: user.tenantId, type: 'refresh' });
    await recordLoginAttempt(user.tenantId, user.email, ipAddress, true, user.id, '2fa_setup_complete');
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((e) => logger.error('lastLoginAt', { error: e }));
    if (req.body.device) await touchDeviceOnLogin(user.tenantId, user.id, req.body.device);
    res.json({ accessToken, refreshToken, expiresIn: process.env.JWT_EXPIRY ?? '8h' });
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

  // If the caller has switched context into a sub-tenant, also load the parent
  // name so the UI can render "Return to <Parent>" on the impersonation banner.
  let originalTenantName: string | null = null;
  if (req.user!.originalTenantId && req.user!.originalTenantId !== req.user!.tenantId) {
    const parent = await prisma.tenant.findUnique({
      where: { id: req.user!.originalTenantId },
      select: { name: true, company: { select: { legalName: true } } },
    });
    originalTenantName = parent?.company?.legalName ?? parent?.name ?? req.user!.originalTenantId;
  }

  res.json({
    userId: req.user!.sub,
    email: req.user!.email,
    tenantId: req.user!.tenantId,
    tenantName: tenant?.company?.legalName ?? tenant?.name ?? req.user!.tenantId,
    originalTenantId: req.user!.originalTenantId ?? null,
    originalTenantName,
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
