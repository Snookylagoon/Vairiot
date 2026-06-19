import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/authorise';
import {
  getDashboardStats,
  listTenants,
  getTenantDetail,
  listAllUsers,
  adminResetPassword,
  unlockUser,
  setUserActiveStatus,
} from '../../services/platform-admin.service';

export const platformRouter = Router();

platformRouter.use(requireRole('Platform Super Admin', 'Licensing Authority'));

// ─── Dashboard ──────────────────────────────────────────────────────────────

platformRouter.get('/stats', async (_req: Request, res: Response) => {
  const stats = await getDashboardStats();
  res.json(stats);
});

// ─── Tenants ────────────────────────────────────────────────────────────────

platformRouter.get('/tenants', async (req: Request, res: Response) => {
  const tenants = await listTenants({
    search: req.query.search as string | undefined,
    deploymentMode: req.query.deploymentMode as string | undefined,
    onboardingComplete: req.query.onboardingComplete as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: req.query.sortOrder as string | undefined,
  });
  res.json(tenants);
});

platformRouter.get('/tenants/:id', async (req: Request, res: Response) => {
  const tenant = await getTenantDetail(req.params.id);
  res.json(tenant);
});

// ─── Users (cross-tenant) ───────────────────────────────────────────────────

platformRouter.get('/users', async (req: Request, res: Response) => {
  const users = await listAllUsers({
    search: req.query.search as string | undefined,
    tenantId: req.query.tenantId as string | undefined,
    role: req.query.role as string | undefined,
    active: req.query.active as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: req.query.sortOrder as string | undefined,
  });
  res.json(users);
});

platformRouter.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  const result = await adminResetPassword(req.params.id, req.user!.sub);
  res.json(result);
});

platformRouter.patch('/users/:id/unlock', async (req: Request, res: Response) => {
  await unlockUser(req.params.id, req.user!.sub);
  res.json({ message: 'User unlocked' });
});

platformRouter.patch('/users/:id/active', async (req: Request, res: Response) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active must be a boolean' });
    return;
  }
  await setUserActiveStatus(req.params.id, active, req.user!.sub);
  res.json({ message: active ? 'User enabled' : 'User disabled' });
});
