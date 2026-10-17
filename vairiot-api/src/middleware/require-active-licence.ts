import { NextFunction, Response } from 'express';
import { PLATFORM_ROLES, type RoleName } from 'vairiot-shared';

import { prisma } from '../lib/prisma';
import { withoutTenantScope } from '../lib/tenant-context';
import { getRootTenantId } from '../services/licence.service';
import type { Request } from '../types/http';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DAY_MS = 24 * 60 * 60 * 1000;

// Blocks write operations when the tenant's licence is suspended, or expired
// beyond its grace period. Reads always pass: data is never locked out.
// Platform-plane roles bypass this check.
//
// Mounted on the gated router in app.ts (KFR-040). Until then it was defined
// but never used, and it would have blocked reads too and looked for the
// licence on the sub-tenant, where it never is (licences sit on the root
// tenant). `exemptPrefixes` are paths that must keep working on an expired
// licence: the licence and device endpoints (renewal, heartbeat) and the
// tenant-context switch, which is a POST but only changes the view.
export function requireActiveLicence(options: { exemptPrefixes?: string[] } = {}) {
  const exempt = options.exemptPrefixes ?? [];
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (READ_METHODS.has(req.method)) { next(); return; }
    if (exempt.some((p) => req.path === p || req.path.startsWith(`${p}/`))) { next(); return; }
    if (!req.user) { res.status(401).json({ error: 'Authorisation required' }); return; }

    const isPlatform = req.user.roles.some((r) =>
      PLATFORM_ROLES.includes(r as RoleName),
    );
    if (isPlatform) { next(); return; }

    try {
      const rootTenantId = await getRootTenantId(req.user.tenantId);
      // A sub-tenant writes under its parent's licence: a deliberate read across tenants (RLS, D5).
      const licence = await withoutTenantScope(() => prisma.licence.findFirst({
        where: { tenantId: rootTenantId, status: { notIn: ['revoked'] } },
        orderBy: { createdAt: 'desc' },
        select: { status: true, expiresAt: true, gracePeriodDays: true },
      }));

      if (!licence) {
        res.status(403).json({ error: 'No active licence found', code: 'NO_LICENCE' });
        return;
      }

      if (licence.status === 'suspended') {
        res.status(403).json({ error: 'Licence is suspended', code: 'LICENCE_SUSPENDED' });
        return;
      }

      // Judge expiry by date, not the stored status: the status is only
      // recomputed when someone reads /licences/status, so it can be stale.
      if (licence.expiresAt) {
        const graceEnd = licence.expiresAt.getTime() + (licence.gracePeriodDays ?? 14) * DAY_MS;
        if (Date.now() > graceEnd) {
          res.status(403).json({
            error: 'Licence has expired. Data is read-only until renewed.',
            code: 'LICENCE_EXPIRED',
          });
          return;
        }
      }

      next();
    } catch (e) {
      next(e);
    }
  };
}
