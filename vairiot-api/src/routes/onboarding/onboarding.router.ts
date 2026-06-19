import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error-handler';
import {
  getOnboardingProgress,
  completeUserRegistration,
  registerCompany,
  registerClient,
  activateOnboardingLicence,
  completeOnboarding,
} from '../../services/onboarding.service';

export const onboardingRouter = Router();

onboardingRouter.get('/progress', asyncHandler(async (req: Request, res: Response) => {
  const status = await getOnboardingProgress(req.user!.tenantId);
  res.json(status);
}));

onboardingRouter.post('/user', asyncHandler(async (req: Request, res: Response) => {
  const { name, email, phone } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
  if (!email?.trim()) { res.status(400).json({ error: 'Email is required' }); return; }
  const status = await completeUserRegistration(
    req.user!.tenantId,
    req.user!.sub,
    { name, email, phone },
  );
  res.json(status);
}));

onboardingRouter.post('/company', asyncHandler(async (req: Request, res: Response) => {
  const status = await registerCompany(req.user!.tenantId, req.user!.sub, req.body);
  res.json(status);
}));

onboardingRouter.post('/client', asyncHandler(async (req: Request, res: Response) => {
  const status = await registerClient(req.user!.tenantId, req.user!.sub, req.body);
  res.json(status);
}));

onboardingRouter.post('/licence', asyncHandler(async (req: Request, res: Response) => {
  const { tierName } = req.body;
  if (!tierName?.trim()) { res.status(400).json({ error: 'tierName is required (FREE, TIER_2, or TIER_3)' }); return; }
  const status = await activateOnboardingLicence(req.user!.tenantId, req.user!.sub, tierName);
  res.json(status);
}));

onboardingRouter.post('/complete', asyncHandler(async (req: Request, res: Response) => {
  const status = await completeOnboarding(req.user!.tenantId, req.user!.sub);
  res.json(status);
}));
