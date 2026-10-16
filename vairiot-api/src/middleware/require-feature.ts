import type { NextFunction, Request, Response } from 'express';
import type { ModuleKey } from 'vairiot-shared';

import { NotFoundError } from '../lib/errors';
import { tenantFeatureEnabled } from '../services/tenant-features.service';

/**
 * Route guard for a switchable module (standard §3.2): when the tenant has the
 * feature off, the route answers 404 as if it did not exist. Mount after
 * `authenticate`, which sets `req.user.tenantId`. Each guarded route is listed
 * in the module registry (vairiot-shared, D7), which the toggle-matrix test walks.
 */
export function requireFeature(flag: ModuleKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId || !(await tenantFeatureEnabled(tenantId, flag))) {
        next(new NotFoundError());
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
