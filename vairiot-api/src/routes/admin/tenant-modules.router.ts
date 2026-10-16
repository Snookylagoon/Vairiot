import type { Prisma } from '@prisma/client';
import { Router, type Response } from 'express';
import { isModuleKey, MODULES, type ModuleKey } from 'vairiot-shared';

import { NotFoundError, ValidationError } from '../../lib/errors';
import { parseFeatureFlags } from '../../lib/feature-flags';
import { prisma } from '../../lib/prisma';
import { requireRole } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { recordAuditEvent } from '../../services/audit-event.service';
import type { Request } from '../../types/http';

// A tenant's modules for the platform console (D7, stage 2.2): the registry
// with each module's state, and the switch. Switching is audited against the
// tenant. Mounted beside platformRouter at /admin/platform.
export const tenantModulesRouter = Router();

async function tenantFlags(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { featureFlags: true } });
  if (!tenant) throw new NotFoundError('Tenant not found');
  return parseFeatureFlags(tenant.featureFlags) as Record<string, unknown>;
}

const view = (flags: Record<string, unknown>) =>
  MODULES.map((m) => ({
    key: m.key, name: m.name, description: m.description, builtIn: m.builtIn, status: m.status,
    enabled: flags[m.key] === true,
  }));

tenantModulesRouter.get('/tenants/:id/modules', requireRole('Platform Super Admin', 'Licensing Authority'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(view(await tenantFlags(req.params.id)));
  }),
);

tenantModulesRouter.put('/tenants/:id/modules/:key', requireRole('Platform Super Admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id, key } = req.params;
    if (!isModuleKey(key)) throw new NotFoundError('Unknown module');
    if (typeof req.body.enabled !== 'boolean') throw new ValidationError('enabled must be true or false');
    const enabled: boolean = req.body.enabled;

    const before = await tenantFlags(id);
    const after = { ...before, [key as ModuleKey]: enabled };
    if (before[key] !== enabled) {
      await prisma.tenant.update({ where: { id }, data: { featureFlags: after as Prisma.InputJsonValue } });
      recordAuditEvent({
        tenantId: id, actor: req.user!.sub, entityType: 'tenant', entityId: id,
        action: enabled ? 'module_enabled' : 'module_disabled',
        before: { [key]: before[key] === true }, after: { [key]: enabled }, metadata: { module: key },
      });
    }
    res.json(view(after));
  }),
);
