import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listCustomFields, createCustomField, updateCustomField, deleteCustomField } from '../../services/custom-field.service';

export const customFieldsRouter = Router();
customFieldsRouter.use(authenticate);

customFieldsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listCustomFields(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch custom fields' }); }
});

customFieldsRouter.post('/', requirePermission('asset:write'),
  [
    body('name').notEmpty().withMessage('Field name is required'),
    body('label').notEmpty().withMessage('Field label is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try { res.status(201).json(await createCustomField(req.user!.tenantId, req.body)); }
    catch (e) {
      if (e instanceof Error && e.message === 'INVALID_TYPE') { res.status(400).json({ error: 'Invalid field type' }); return; }
      if (e instanceof Error && e.message === 'OPTIONS_REQUIRED') { res.status(400).json({ error: 'Select fields require options' }); return; }
      res.status(500).json({ error: 'Failed to create custom field' });
    }
  },
);

customFieldsRouter.patch('/:id', requirePermission('asset:write'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await updateCustomField(req.user!.tenantId, req.params.id, req.body)); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Custom field not found' }); return; }
    res.status(500).json({ error: 'Failed to update custom field' });
  }
});

customFieldsRouter.delete('/:id', requirePermission('asset:write'), async (req: Request, res: Response): Promise<void> => {
  try { await deleteCustomField(req.user!.tenantId, req.params.id); res.status(204).send(); }
  catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Custom field not found' }); return; }
    res.status(500).json({ error: 'Failed to delete custom field' });
  }
});
