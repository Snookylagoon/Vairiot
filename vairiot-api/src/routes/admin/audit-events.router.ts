import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listAuditEvents } from '../../services/audit-event.service';

export const auditEventsRouter = Router();
auditEventsRouter.use(authenticate);
auditEventsRouter.use(requirePermission('user:read', 'user:write', 'apikey:read', 'apikey:write'));

auditEventsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
    const limit      = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await listAuditEvents(req.user!.tenantId, { entityType, limit }));
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});
