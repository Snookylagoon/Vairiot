import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requirePermission } from '../../middleware/authenticate';
import {
  listUsers, listRoles, inviteUser, setUserActive, setUserRole,
} from '../../services/user.service';

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/', requirePermission('user:read', 'user:write'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listUsers(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch users' }); }
});

usersRouter.get('/roles', requirePermission('user:read', 'user:write'), async (req: Request, res: Response): Promise<void> => {
  try { res.json(await listRoles(req.user!.tenantId)); }
  catch { res.status(500).json({ error: 'Failed to fetch roles' }); }
});

usersRouter.post('/', requirePermission('user:write'),
  [
    body('email').isEmail().normalizeEmail(),
    body('name').notEmpty(),
    body('password').isLength({ min: 8 }),
    body('roleId').optional().isString(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      res.status(201).json(await inviteUser(req.user!.tenantId, req.body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'EMAIL_EXISTS')    { res.status(409).json({ error: 'A user with that email already exists' }); return; }
      if (msg === 'ROLE_NOT_FOUND')  { res.status(404).json({ error: 'Role not found' }); return; }
      res.status(500).json({ error: 'Failed to create user' });
    }
  },
);

usersRouter.patch('/:userId/active', requirePermission('user:write'),
  [body('active').isBoolean()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      res.json(await setUserActive(req.user!.tenantId, req.params.userId, req.body.active));
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') { res.status(404).json({ error: 'User not found' }); return; }
      res.status(500).json({ error: 'Failed to update user' });
    }
  },
);

usersRouter.patch('/:userId/role', requirePermission('user:write'),
  [body('roleId').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    try {
      res.json(await setUserRole(req.user!.tenantId, req.params.userId, req.body.roleId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'NOT_FOUND')      { res.status(404).json({ error: 'User not found' }); return; }
      if (msg === 'ROLE_NOT_FOUND') { res.status(404).json({ error: 'Role not found' }); return; }
      res.status(500).json({ error: 'Failed to update role' });
    }
  },
);
