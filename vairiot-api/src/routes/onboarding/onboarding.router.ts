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
  const { name, phone } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
  const email = req.user!.email;
  const status = await completeUserRegistration(
    req.user!.tenantId,
    req.user!.sub,
    { name, email, phone },
  );
  res.json(status);
}));

onboardingRouter.get('/company', asyncHandler(async (req: Request, res: Response) => {
  const { prisma } = await import('../../lib/prisma');
  const company = await prisma.company.findUnique({ where: { tenantId: req.user!.tenantId } });
  if (!company) { res.json(null); return; }
  res.json(company);
}));

onboardingRouter.post('/company', asyncHandler(async (req: Request, res: Response) => {
  const { companyName, registrationNumber, address, city, country } = req.body;
  // Look up the user's name for primary contact
  const user = await import('../../lib/prisma').then(m => m.prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } }));
  const status = await registerCompany(req.user!.tenantId, req.user!.sub, {
    legalName: companyName,
    registrationNumber: registrationNumber || undefined,
    addressLine1: address,
    city,
    country,
    primaryContactName: user?.name ?? req.user!.email.split('@')[0],
    primaryContactEmail: req.user!.email,
  });
  res.json(status);
}));

onboardingRouter.post('/client', asyncHandler(async (req: Request, res: Response) => {
  const { clientName, contactEmail, signatoryName, signatoryEmail } = req.body;
  const status = await registerClient(req.user!.tenantId, req.user!.sub, {
    legalName: clientName,
    addressLine1: '',
    city: '',
    country: '',
    primaryContactName: signatoryName,
    primaryContactEmail: contactEmail,
    authority: {
      name: signatoryName,
      email: signatoryEmail,
    },
  });
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
