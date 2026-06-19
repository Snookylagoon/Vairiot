import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { listCustomFields, createCustomField, updateCustomField, deleteCustomField } from '../../services/custom-field.service';

export const customFieldsRouter = Router();

customFieldsRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listCustomFields(req.user!.tenantId));
  }),
);

customFieldsRouter.post('/', requireAnyPermission('asset:write'),
  [
    body('name').notEmpty().withMessage('Field name is required'),
    body('label').notEmpty().withMessage('Field label is required'),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await createCustomField(req.user!.tenantId, req.body));
  }),
);

customFieldsRouter.patch('/:id', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateCustomField(req.user!.tenantId, req.params.id, req.body));
  }),
);

customFieldsRouter.delete('/:id', requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await deleteCustomField(req.user!.tenantId, req.params.id);
    res.status(204).send();
  }),
);
