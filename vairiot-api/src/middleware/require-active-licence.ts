import { NextFunction, Request, Response } from 'express';
import { PLATFORM_ROLES, type RoleName } from 'vairiot-shared';

import { prisma } from '../lib/prisma';

// Blocks write operations when the tenant's licence is expired or revoked.
// Expired licences still allow read access (data is never locked out).
// Platform-plane roles bypass this check.
export function requireActiveLicence() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const isPlatform = req.user.roles.some((r) =>
      PLATFORM_ROLES.includes(r as RoleName),
    );
    if (isPlatform) { next(); return; }

    const licence = await prisma.licence.findFirst({
      where: { tenantId: req.user.tenantId, status: { notIn: ['revoked'] } },
      orderBy: { createdAt: 'desc' },
      select: { status: true, expiresAt: true, gracePeriodDays: true },
    });

    if (!licence) {
      res.status(403).json({ error: 'No active licence found', code: 'NO_LICENCE' });
      return;
    }

    if (licence.status === 'suspended') {
      res.status(403).json({ error: 'Licence is suspended', code: 'LICENCE_SUSPENDED' });
      return;
    }

    // Check if past expiry + grace period
    if (licence.status === 'expired' && licence.expiresAt) {
      const graceEnd = new Date(licence.expiresAt);
      graceEnd.setDate(graceEnd.getDate() + (licence.gracePeriodDays ?? 14));
      if (new Date() > graceEnd) {
        res.status(403).json({
          error: 'Licence has expired. Data is read-only until renewed.',
          code: 'LICENCE_EXPIRED',
        });
        return;
      }
    }

    next();
  };
}
