import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listMaintenanceEvents, getMaintenanceEvent, createMaintenanceEvent,
  updateMaintenanceEvent, deleteMaintenanceEvent,
} from '../../services/maintenance.service';

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate);

maintenanceRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { assetId, status, page, pageSize } = req.query as Record<string, string>;
    res.json(await listMaintenanceEvents(req.user!.tenantId, {
      assetId, status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }));
  }),
);

maintenanceRouter.get('/:id',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const evt = await getMaintenanceEvent(req.user!.tenantId, req.params.id);
    if (!evt) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(evt);
  }),
);

maintenanceRouter.post('/', requireAnyPermission('asset:write'),
  [
    body('assetId').isString().notEmpty(),
    body('maintenanceType').isString().notEmpty(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createMaintenanceEvent(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

maintenanceRouter.patch('/:id', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateMaintenanceEvent(req.user!.tenantId, req.params.id, req.body));
  }),
);

maintenanceRouter.delete('/:id', requireAnyPermission('asset:delete'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await deleteMaintenanceEvent(req.user!.tenantId, req.params.id));
  }),
);
