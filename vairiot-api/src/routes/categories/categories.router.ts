import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../../services/category.service';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);

categoriesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listCategories(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch categories' }); }
});

categoriesRouter.post('/', requirePermission('category:write'),
  [body('name').notEmpty().withMessage('Name required')],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      const cat = await createCategory(req.user!.tenantId, { name: req.body.name, description: req.body.description, parentId: req.body.parentId });
      res.status(201).json(cat);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Unique')) { res.status(409).json({ error: 'Category name already exists' }); return; }
      res.status(500).json({ error: 'Failed to create category' });
    }
  },
);

categoriesRouter.patch('/:id', requirePermission('category:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await updateCategory(req.user!.tenantId, req.params.id, req.body));
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'Category not found' }); return; }
    res.status(500).json({ error: 'Failed to update category' });
  }
});

categoriesRouter.delete('/:id', requirePermission('category:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteCategory(req.user!.tenantId, req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_FOUND')  { res.status(404).json({ error: 'Category not found' }); return; }
    if (e instanceof Error && e.message === 'HAS_ASSETS') { res.status(409).json({ error: 'Category has assets assigned — reassign them first' }); return; }
    res.status(500).json({ error: 'Failed to delete category' });
  }
});
