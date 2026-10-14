import { Router, Response } from 'express';


import { asyncHandler } from '../../middleware/error-handler';
import { loginLimiter } from '../../middleware/rate-limit';
import {
  generateTwoFactorSetup,
  verifyAndEnableTwoFactor,
  disableTwoFactor,
  checkTwoFactorRequirement,
} from '../../services/two-factor.service';
import type { Request } from '../../types/http';

export const twoFactorRouter = Router();

twoFactorRouter.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const status = await checkTwoFactorRequirement(req.user!.sub, req.user!.roles);
  res.json(status);
}));

twoFactorRouter.post('/setup', asyncHandler(async (req: Request, res: Response) => {
  const setup = await generateTwoFactorSetup(req.user!.sub, req.user!.email);
  res.json(setup);
}));

twoFactorRouter.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token?.trim()) { res.status(400).json({ error: 'Verification code is required' }); return; }
  await verifyAndEnableTwoFactor(req.user!.sub, token);
  res.json({ message: 'Two-factor authentication enabled' });
}));

// Every route here acts only on the signed-in user, so no permission applies.
// Disabling, though, used to need nothing but an access token: anyone holding a
// stolen token could switch 2FA off. It now needs a current authenticator or
// backup code, and is rate-limited like login (KFR-041).
twoFactorRouter.post('/disable', loginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
  await disableTwoFactor(req.user!.sub, req.user!.roles, token);
  res.json({ message: 'Two-factor authentication disabled' });
}));
