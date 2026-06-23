import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { requireRole } from '../../middleware/authorise';
import {
  getDashboardStats,
  listTenants,
  getTenantDetail,
  listAllUsers,
  adminResetPassword,
  unlockUser,
  setUserActiveStatus,
  softDeleteUser,
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
import {
  getSmtpConfig,
  upsertSmtpConfig,
  verifySmtp,
  sendTestEmail,
} from '../../services/smtp.service';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { minioClient, PHOTO_BUCKET } from '../../lib/minio';

export const platformRouter = Router();

platformRouter.use(requireRole('Platform Super Admin', 'Licensing Authority'));

const LOGO_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_MIMES.includes(file.mimetype.toLowerCase())) {
      cb(new Error('UNSUPPORTED_MEDIA'));
      return;
    }
    cb(null, true);
  },
});

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

platformRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    await softDeleteUser(req.params.id, req.user!.sub);
    res.json({ message: 'User deleted' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete user';
    const status = msg.toLowerCase().includes('your own') ? 400 : (msg.toLowerCase().includes('not found') ? 404 : 500);
    res.status(status).json({ error: msg });
  }
});

// ─── Tenant Company ────────────────────────────────────────────────────────

platformRouter.patch('/tenants/:id/company', async (req: Request, res: Response) => {
  const { legalName, tradingName, registrationNumber, addressLine1, addressLine2, city, stateProvince, postalCode, country, primaryContactName, primaryContactEmail, primaryContactPhone, currency } = req.body;

  const existing = await prisma.company.findUnique({ where: { tenantId: req.params.id } });

  const data: Record<string, unknown> = {};
  if (legalName !== undefined) data.legalName = legalName.trim();
  if (tradingName !== undefined) data.tradingName = tradingName?.trim() || null;
  if (registrationNumber !== undefined) data.registrationNumber = registrationNumber?.trim() || null;
  if (addressLine1 !== undefined) data.addressLine1 = addressLine1.trim();
  if (addressLine2 !== undefined) data.addressLine2 = addressLine2?.trim() || null;
  if (city !== undefined) data.city = city.trim();
  if (stateProvince !== undefined) data.stateProvince = stateProvince?.trim() || null;
  if (postalCode !== undefined) data.postalCode = postalCode?.trim() || null;
  if (country !== undefined) data.country = country.trim();
  if (primaryContactName !== undefined) data.primaryContactName = primaryContactName.trim();
  if (primaryContactEmail !== undefined) data.primaryContactEmail = primaryContactEmail.trim();
  if (primaryContactPhone !== undefined) data.primaryContactPhone = primaryContactPhone?.trim() || null;
  if (currency !== undefined) {
    const code = String(currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      res.status(400).json({ error: 'currency must be a 3-letter ISO 4217 code' });
      return;
    }
    data.currency = code;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  if (existing) {
    const company = await prisma.company.update({ where: { tenantId: req.params.id }, data });
    // Sync tenant name if legalName changed
    if (data.legalName) {
      await prisma.tenant.update({ where: { id: req.params.id }, data: { name: data.legalName as string } });
    }
    res.json(company);
  } else {
    const company = await prisma.company.create({
      data: {
        tenantId: req.params.id,
        legalName: (data.legalName as string) || '',
        addressLine1: (data.addressLine1 as string) || '',
        city: (data.city as string) || '',
        country: (data.country as string) || '',
        primaryContactName: (data.primaryContactName as string) || '',
        primaryContactEmail: (data.primaryContactEmail as string) || '',
        ...data,
      },
    });
    res.json(company);
  }
});

// ─── Tenant Logo ───────────────────────────────────────────────────────────

platformRouter.post('/tenants/:id/logo', logoUpload.single('logo'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "logo")' }); return; }

  const company = await prisma.company.findUnique({ where: { tenantId: req.params.id } });
  if (!company) { res.status(404).json({ error: 'Company not found — complete company registration first' }); return; }

  // Remove old logo if exists
  if (company.logoStorageKey) {
    await minioClient.removeObject(PHOTO_BUCKET, company.logoStorageKey).catch(() => {});
  }

  const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
  const storageKey = `${req.params.id}/logo/company-logo${ext}`;

  await minioClient.putObject(PHOTO_BUCKET, storageKey, req.file.buffer, req.file.buffer.length, {
    'Content-Type': req.file.mimetype,
  });

  await prisma.company.update({
    where: { tenantId: req.params.id },
    data: { logoStorageKey: storageKey },
  });

  res.json({ logoStorageKey: storageKey });
});

platformRouter.get('/tenants/:id/logo', async (req: Request, res: Response) => {
  const company = await prisma.company.findUnique({ where: { tenantId: req.params.id } });
  if (!company?.logoStorageKey) { res.status(404).json({ error: 'No logo uploaded' }); return; }

  const stream = await minioClient.getObject(PHOTO_BUCKET, company.logoStorageKey);
  const ext = company.logoStorageKey.split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=300');
  (stream as Readable).pipe(res);
});

platformRouter.delete('/tenants/:id/logo', async (req: Request, res: Response) => {
  const company = await prisma.company.findUnique({ where: { tenantId: req.params.id } });
  if (!company?.logoStorageKey) { res.status(404).json({ error: 'No logo uploaded' }); return; }

  await minioClient.removeObject(PHOTO_BUCKET, company.logoStorageKey).catch(() => {});
  await prisma.company.update({
    where: { tenantId: req.params.id },
    data: { logoStorageKey: null },
  });
  res.json({ message: 'Logo removed' });
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

platformRouter.post('/tenants/:id/sub-tenants', async (req: Request, res: Response) => {
  const { clientName, contactEmail, signatoryName, signatoryEmail, address, city, country, telephone } = req.body;
  if (!clientName?.trim()) { res.status(400).json({ error: 'clientName is required' }); return; }
  if (!signatoryName?.trim() || !signatoryEmail?.trim()) {
    res.status(400).json({ error: 'signatoryName and signatoryEmail are required' });
    return;
  }

  const parentTenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!parentTenant) { res.status(404).json({ error: 'Parent tenant not found' }); return; }
  if (parentTenant.parentTenantId) {
    res.status(400).json({ error: 'Cannot create sub-tenant under another sub-tenant' });
    return;
  }

  const subTenantName = clientName.trim();
  const existing = await prisma.tenant.findUnique({ where: { name: subTenantName } });
  if (existing) { res.status(409).json({ error: 'A sub-tenant with this name already exists' }); return; }

  const subTenant = await prisma.tenant.create({
    data: {
      name: subTenantName,
      parentTenantId: parentTenant.id,
      deploymentMode: parentTenant.deploymentMode,
      onboardingComplete: true,
      active: true,
      company: {
        create: {
          legalName: clientName.trim(),
          addressLine1: address?.trim() || '',
          city: city?.trim() || '',
          country: country?.trim() || '',
          primaryContactName: signatoryName.trim(),
          primaryContactEmail: contactEmail?.trim() || signatoryEmail.trim(),
          primaryContactPhone: telephone?.trim() || null,
        },
      },
    },
  });

  // Also persist as ClientCompany for the onboarding record
  await registerClient(req.params.id, req.user!.sub, {
    legalName: clientName,
    addressLine1: address?.trim() || '',
    city: city?.trim() || '',
    country: country?.trim() || '',
    primaryContactName: signatoryName,
    primaryContactEmail: contactEmail || signatoryEmail,
    authority: { name: signatoryName, email: signatoryEmail },
  });

  res.json(subTenant);
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

// ─── SMTP Config ────────────────────────────────────────────────────────────

platformRouter.get('/smtp', async (_req: Request, res: Response) => {
  res.json(await getSmtpConfig());
});

platformRouter.put('/smtp', async (req: Request, res: Response) => {
  const { host, port, secure, username, password, fromAddress, active } = req.body ?? {};
  if (!host?.trim()) { res.status(400).json({ error: 'host is required' }); return; }
  if (!fromAddress?.trim()) { res.status(400).json({ error: 'fromAddress is required' }); return; }
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    res.status(400).json({ error: 'port must be 1-65535' }); return;
  }
  const view = await upsertSmtpConfig(
    {
      host: host.trim(),
      port: portNum,
      secure: !!secure,
      username: username?.trim() || null,
      password: password === undefined ? null : password,
      fromAddress: fromAddress.trim(),
      active: active !== false,
    },
    req.user!.sub,
  );
  res.json(view);
});

platformRouter.post('/smtp/verify', async (_req: Request, res: Response) => {
  res.json(await verifySmtp());
});

platformRouter.post('/smtp/test', async (req: Request, res: Response) => {
  const to = (req.body?.to ?? '').trim();
  if (!to) { res.status(400).json({ error: 'to is required' }); return; }
  res.json(await sendTestEmail(to));
});
