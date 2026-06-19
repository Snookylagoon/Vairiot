import { Router, Request, Response } from 'express';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { listAuditEvents, listAuditEventsForExport } from '../../services/audit-event.service';

export const auditEventsRouter = Router();
auditEventsRouter.use(requireAnyPermission('user:read', 'user:write', 'apikey:read', 'apikey:write'));

auditEventsRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, limit, from, to, search, sortBy, sortOrder } = req.query as Record<string, string>;
    res.json(await listAuditEvents(req.user!.tenantId, {
      entityType,
      limit: limit ? Number(limit) : undefined,
      from, to, search, sortBy, sortOrder,
    }));
  }),
);

auditEventsRouter.get('/export.csv',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { entityType, from, to } = req.query as Record<string, string>;
    const events = await listAuditEventsForExport(req.user!.tenantId, { entityType, from, to });

    const header = 'Timestamp,Actor,Entity Type,Entity ID,Action\n';
    const rows = events.map(ev =>
      `"${ev.occurredAt.toISOString()}","${ev.actor?.name ?? ev.actorId ?? 'System'}","${ev.entityType}","${ev.entityId}","${ev.action}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(header + rows);
  }),
);
