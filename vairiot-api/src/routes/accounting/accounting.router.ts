import { Router, type Response } from 'express';

import { prisma } from '../../lib/prisma';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { requireFeature } from '../../middleware/require-feature';
import type { Request } from '../../types/http';

// The IPSAS ledger (Phase 2), behind the tenant's `ipsas` module: every route
// here answers 404 while it is off. Classes, periods, runs and impairment
// arrive in W2–W5; this stage mounts the guard and the ledger's settings.
export const accountingRouter = Router();

accountingRouter.use(requireFeature('ipsas'));

/**
 * The conventions every ledger figure follows (Phase 2 plan §2.2, D14, D15,
 * D17), with the tenant's currency and time zone that periods are kept in.
 */
accountingRouter.get('/settings', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const company = await prisma.company.findUnique({
      where: { tenantId: req.user!.tenantId }, select: { currency: true, timezone: true },
    });
    res.json({
      currency: company?.currency ?? 'USD',
      timezone: company?.timezone ?? 'UTC',
      measurement: 'cost',
      period: 'monthly',
      depreciationConvention: { startMonth: 'full', disposalMonth: 'none' },
      rounding: { mode: 'half_up', places: 2, remainder: 'last_month' },
      approval: { separateApprover: true },
    });
  }),
);
