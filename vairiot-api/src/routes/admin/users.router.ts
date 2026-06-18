import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireAnyPermission } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listUsers, listRoles, inviteUser, setUserActive, setUserRole,
} from '../../services/user.service';

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/', requireAnyPermission('user:read', 'user:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listUsers(req.user!.tenantId));
  }),
);

usersRouter.get('/roles', requireAnyPermission('user:read', 'user:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listRoles(req.user!.tenantId));
  }),
);

usersRouter.post('/', requireAnyPermission('user:write'),
  [
    body('email').isEmail().normalizeEmail(),
    body('name').notEmpty(),
    body('password').isLength({ min: 8 }),
    body('roleId').optional().isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await inviteUser(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

usersRouter.patch('/:userId/active', requireAnyPermission('user:write'),
  [body('active').isBoolean()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await setUserActive(req.user!.tenantId, req.user!.sub, req.params.userId, req.body.active));
  }),
);

usersRouter.patch('/:userId/role', requireAnyPermission('user:write'),
  [body('roleId').notEmpty()],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.json(await setUserRole(req.user!.tenantId, req.user!.sub, req.params.userId, req.body.roleId));
  }),
);
