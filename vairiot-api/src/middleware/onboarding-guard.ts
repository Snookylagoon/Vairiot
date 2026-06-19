import { NextFunction, Request, Response } from 'express';
import { PLATFORM_ROLES, type RoleName } from 'vairiot-shared';
import { prisma } from '../lib/prisma';

// Steps in required order. client_registration is optional (checked separately).
const REQUIRED_STEPS = [
  'user_registration',
  'company_registration',
  'licence_activation',
] as const;

// Blocks all protected routes until onboarding is complete.
// Platform-plane roles bypass this gate — they manage infrastructure,
// not tenant-level onboarding.
export function requireOnboardingComplete() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const isPlatform = req.user.roles.some((r) =>
      PLATFORM_ROLES.includes(r as RoleName),
    );
    if (isPlatform) { next(); return; }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { onboardingComplete: true },
    });

    if (tenant?.onboardingComplete) { next(); return; }

    // Find the first incomplete step to guide the client
    const progress = await prisma.onboardingProgress.findMany({
      where: { tenantId: req.user.tenantId },
      select: { step: true, completed: true },
    });
    const completedSteps = new Set(
      progress.filter((p) => p.completed).map((p) => p.step),
    );
    const nextStep = REQUIRED_STEPS.find((s) => !completedSteps.has(s)) ?? REQUIRED_STEPS[0];

    res.status(403).json({
      error: 'Onboarding is not yet complete',
      code: 'ONBOARDING_INCOMPLETE',
      nextStep,
    });
  };
}
