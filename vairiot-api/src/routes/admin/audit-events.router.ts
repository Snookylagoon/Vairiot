import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listAuditEvents, listAuditEventsForExport } from '../../services/audit-event.service';

export const auditEventsRouter = Router();
auditEventsRouter.use(authenticate);
auditEventsRouter.use(requirePermission('user:read', 'user:write', 'apikey:read', 'apikey:write'));

auditEventsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityType, limit, from, to, search } = req.query as Record<string, string>;
    res.json(await listAuditEvents(req.user!.tenantId, {
      entityType,
      limit: limit ? Number(limit) : undefined,
      from, to, search,
    }));
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

auditEventsRouter.get('/export.csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityType, from, to } = req.query as Record<string, string>;
    const events = await listAuditEventsForExport(req.user!.tenantId, { entityType, from, to });

    const header = 'Timestamp,Actor,Entity Type,Entity ID,Action\n';
    const rows = events.map(ev =>
      `"${ev.occurredAt.toISOString()}","${ev.actor?.name ?? ev.actorId ?? 'System'}","${ev.entityType}","${ev.entityId}","${ev.action}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(header + rows);
  } catch {
    res.status(500).json({ error: 'Failed to export audit events' });
  }
});
