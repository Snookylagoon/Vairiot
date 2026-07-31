import { Router, Request, Response } from 'express';
import multer from 'multer';

import { minioClient, PHOTO_BUCKET } from '../../lib/minio';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../middleware/error-handler';
import {
  getOnboardingProgress,
  completeUserRegistration,
  registerCompany,
  registerClient,
  activateOnboardingLicence,
  completeOnboarding,
} from '../../services/onboarding.service';

export const onboardingRouter = Router();

onboardingRouter.get('/progress', asyncHandler(async (req: Request, res: Response) => {
  const status = await getOnboardingProgress(req.user!.tenantId);
  res.json(status);
}));

onboardingRouter.post('/user', asyncHandler(async (req: Request, res: Response) => {
  const { name, phone } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return; }
  const email = req.user!.email;
  const status = await completeUserRegistration(
    req.user!.tenantId,
    req.user!.sub,
    { name, email, phone },
  );
  res.json(status);
}));

onboardingRouter.get('/company', asyncHandler(async (req: Request, res: Response) => {
  const { prisma } = await import('../../lib/prisma');
  const company = await prisma.company.findUnique({ where: { tenantId: req.user!.tenantId } });
  if (!company) { res.json(null); return; }
  res.json(company);
}));

onboardingRouter.post('/company', asyncHandler(async (req: Request, res: Response) => {
  const { companyName, registrationNumber, address, city, country } = req.body;
  // Look up the user's name for primary contact
  const user = await import('../../lib/prisma').then(m => m.prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } }));
  const status = await registerCompany(req.user!.tenantId, req.user!.sub, {
    legalName: companyName,
    registrationNumber: registrationNumber || undefined,
    addressLine1: address,
    city,
    country,
    primaryContactName: user?.name ?? req.user!.email.split('@')[0],
    primaryContactEmail: req.user!.email,
  });
  res.json(status);
}));

/* ── Own-company logo (used on labels, reports) ────────────────────────── */

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

onboardingRouter.get('/company/logo', asyncHandler(async (req: Request, res: Response) => {
  const company = await prisma.company.findUnique({ where: { tenantId: req.user!.tenantId } });
  if (!company?.logoStorageKey) { res.status(404).json({ error: 'No logo uploaded' }); return; }
  try {
    const stream = await minioClient.getObject(PHOTO_BUCKET, company.logoStorageKey);
    const ext = company.logoStorageKey.split('.').pop();
    res.setHeader('Content-Type', ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: 'No logo uploaded' });
  }
}));

onboardingRouter.post('/company/logo', logoUpload.single('logo'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded (field name "logo")' }); return; }
    const company = await prisma.company.findUnique({ where: { tenantId: req.user!.tenantId } });
    if (!company) { res.status(400).json({ error: 'Company details must be set before uploading a logo' }); return; }

    if (company.logoStorageKey) {
      await minioClient.removeObject(PHOTO_BUCKET, company.logoStorageKey).catch(() => {});
    }
    const ext = req.file.mimetype === 'image/png' ? '.png'
              : req.file.mimetype === 'image/webp' ? '.webp'
              : '.jpg';
    const storageKey = `${req.user!.tenantId}/logo/company-logo${ext}`;
    await minioClient.putObject(PHOTO_BUCKET, storageKey, req.file.buffer, req.file.buffer.length, {
      'Content-Type': req.file.mimetype,
    });
    await prisma.company.update({
      where: { tenantId: req.user!.tenantId },
      data: { logoStorageKey: storageKey },
    });
    res.json({ logoStorageKey: storageKey });
  }),
);

onboardingRouter.delete('/company/logo', asyncHandler(async (req: Request, res: Response) => {
  const company = await prisma.company.findUnique({ where: { tenantId: req.user!.tenantId } });
  if (!company?.logoStorageKey) { res.status(404).json({ error: 'No logo uploaded' }); return; }
  await minioClient.removeObject(PHOTO_BUCKET, company.logoStorageKey).catch(() => {});
  await prisma.company.update({
    where: { tenantId: req.user!.tenantId },
    data: { logoStorageKey: null },
  });
  res.json({ ok: true });
}));

onboardingRouter.post('/client', asyncHandler(async (req: Request, res: Response) => {
  const { clientName, contactEmail, signatoryName, signatoryEmail } = req.body;
  const status = await registerClient(req.user!.tenantId, req.user!.sub, {
    legalName: clientName,
    addressLine1: '',
    city: '',
    country: '',
    primaryContactName: signatoryName,
    primaryContactEmail: contactEmail,
    authority: {
      name: signatoryName,
      email: signatoryEmail,
    },
  });
  res.json(status);
}));

onboardingRouter.post('/licence', asyncHandler(async (req: Request, res: Response) => {
  const { tierName } = req.body;
  if (!tierName?.trim()) { res.status(400).json({ error: 'tierName is required (FREE, TIER_2, or TIER_3)' }); return; }
  const status = await activateOnboardingLicence(req.user!.tenantId, req.user!.sub, tierName);
  res.json(status);
}));

onboardingRouter.post('/complete', asyncHandler(async (req: Request, res: Response) => {
  const status = await completeOnboarding(req.user!.tenantId, req.user!.sub);
  res.json(status);
}));
