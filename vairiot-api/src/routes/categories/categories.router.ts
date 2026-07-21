import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../../services/category.service';

export const categoriesRouter = Router();

categoriesRouter.get('/',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listCategories(req.user!.tenantId));
  }),
);

categoriesRouter.post('/', requireAnyPermission('category:write'),
  [body('name').notEmpty().withMessage('Name required')],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    const cat = await createCategory(req.user!.tenantId, { name: req.body.name, description: req.body.description, parentId: req.body.parentId });
    res.status(201).json(cat);
  }),
);

categoriesRouter.patch('/:id', requireAnyPermission('category:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateCategory(req.user!.tenantId, req.params.id, req.body));
  }),
);

categoriesRouter.delete('/:id', requireAnyPermission('category:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await deleteCategory(req.user!.tenantId, req.params.id);
    res.status(204).send();
  }),
);
