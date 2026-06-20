import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import {
  listUsers, listRoles, inviteUser, setUserActive, setUserRole, resendInvite,
} from '../../services/user.service';
import {
  getUserPermissionsView, setUserPermissionOverrides,
} from '../../services/user-permissions.service';

export const usersRouter = Router();

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
    body('roleId').optional().isString(),
  ],
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) { res.status(400).json({ errors: errs.array() }); return; }
    res.status(201).json(await inviteUser(req.user!.tenantId, req.user!.sub, req.body));
  }),
);

usersRouter.post('/:userId/resend-invite', requireAnyPermission('user:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await resendInvite(req.user!.tenantId, req.user!.sub, req.params.userId));
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

usersRouter.get('/:userId/permissions', requireAnyPermission('user:read', 'user:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const view = await getUserPermissionsView(req.params.userId, req.user!.tenantId);
    res.json(view);
  }),
);

usersRouter.put('/:userId/permissions', requireAnyPermission('user:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { overrides } = req.body ?? {};
    if (!Array.isArray(overrides)) { res.status(400).json({ error: 'overrides must be an array' }); return; }
    const view = await setUserPermissionOverrides(req.params.userId, req.user!.sub, overrides, req.user!.tenantId);
    res.json(view);
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
