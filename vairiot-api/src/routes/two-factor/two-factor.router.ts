import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error-handler';
import {
  generateTwoFactorSetup,
  verifyAndEnableTwoFactor,
  disableTwoFactor,
  checkTwoFactorRequirement,
} from '../../services/two-factor.service';

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

twoFactorRouter.post('/disable', asyncHandler(async (req: Request, res: Response) => {
  await disableTwoFactor(req.user!.sub, req.user!.roles);
  res.json({ message: 'Two-factor authentication disabled' });
}));
