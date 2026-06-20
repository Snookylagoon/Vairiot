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
import {
  getUserPermissionsView,
  setUserPermissionOverrides,
} from '../../services/user-permissions.service';
import {
  getOnboardingProgress,
  completeUserRegistration,
  registerCompany,
  registerClient,
  activateOnboardingLicence,
  completeOnboarding,
} from '../../services/onboarding.service';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

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

platformRouter.get('/users/:id/permissions', async (req: Request, res: Response) => {
  const view = await getUserPermissionsView(req.params.id);
  res.json(view);
});

platformRouter.put('/users/:id/permissions', async (req: Request, res: Response) => {
  const { overrides } = req.body ?? {};
  if (!Array.isArray(overrides)) {
    res.status(400).json({ error: 'overrides must be an array' });
    return;
  }
  const view = await setUserPermissionOverrides(req.params.id, req.user!.sub, overrides);
  res.json(view);
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

// ─── Tenant Onboarding (admin-driven) ───────────────────────────────────────

async function resolveTenantUser(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  const user = await prisma.user.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true },
  });
  return { tenant, user };
}

platformRouter.get('/tenants/:id/onboarding', async (req: Request, res: Response) => {
  const status = await getOnboardingProgress(req.params.id);
  const { user } = await resolveTenantUser(req.params.id);
  const company = await prisma.company.findUnique({ where: { tenantId: req.params.id } });
  const clientCompanies = await prisma.clientCompany.findMany({
    where: { tenantId: req.params.id },
    include: { authorities: { where: { isSignatory: true }, take: 1 } },
  });
  res.json({ status, user, company, clientCompanies });
});

platformRouter.post('/tenants/:id/onboarding/user', async (req: Request, res: Response) => {
  const { name, phone } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
  const { user } = await resolveTenantUser(req.params.id);
  if (!user) {
    res.status(400).json({ error: 'Tenant has no users yet — create a user first' });
    return;
  }
  const status = await completeUserRegistration(req.params.id, user.id, {
    name,
    email: user.email,
    phone,
  });
  res.json(status);
});

platformRouter.post('/tenants/:id/onboarding/company', async (req: Request, res: Response) => {
  const { companyName, registrationNumber, address, city, country } = req.body;
  const { user } = await resolveTenantUser(req.params.id);
  const contactName = user?.name ?? user?.email?.split('@')[0] ?? 'Platform Admin';
  const contactEmail = user?.email ?? req.user!.email;
  const status = await registerCompany(req.params.id, req.user!.sub, {
    legalName: companyName,
    registrationNumber: registrationNumber || undefined,
    addressLine1: address,
    city,
    country,
    primaryContactName: contactName,
    primaryContactEmail: contactEmail,
  });
  res.json(status);
});

platformRouter.post('/tenants/:id/onboarding/client', async (req: Request, res: Response) => {
  const { clientName, contactEmail, signatoryName, signatoryEmail } = req.body;
  const status = await registerClient(req.params.id, req.user!.sub, {
    legalName: clientName,
    addressLine1: '',
    city: '',
    country: '',
    primaryContactName: signatoryName,
    primaryContactEmail: contactEmail,
    authority: { name: signatoryName, email: signatoryEmail },
  });
  res.json(status);
});

platformRouter.post('/tenants/:id/onboarding/licence', async (req: Request, res: Response) => {
  const { tierName } = req.body;
  if (!tierName?.trim()) { res.status(400).json({ error: 'tierName is required' }); return; }
  const status = await activateOnboardingLicence(req.params.id, req.user!.sub, tierName);
  res.json(status);
});

platformRouter.post('/tenants/:id/onboarding/complete', async (req: Request, res: Response) => {
  const status = await completeOnboarding(req.params.id, req.user!.sub);
  res.json(status);
});
