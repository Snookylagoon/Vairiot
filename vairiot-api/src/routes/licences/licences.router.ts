import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error-handler';
import { requirePermission, requireRole } from '../../middleware/authorise';
import { Permission, RoleName } from 'vairiot-shared';
import {
  getLicenceStatus,
  confirmPaymentAndRenew,
  changeDuration,
  suspendLicence,
  revokeLicence,
  reactivateLicence,
  addDeviceSlot,
  registerDevice,
  listDevices,
  listLicences,
} from '../../services/licence.service';

export const licencesRouter = Router();

// ─── Tenant-facing: get own licence status ───────────────────────────────────

licencesRouter.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const result = await getLicenceStatus(req.user!.tenantId);
  res.json(result);
}));

// ─── Tenant-facing: list & register devices ──────────────────────────────────

licencesRouter.get('/devices', asyncHandler(async (req: Request, res: Response) => {
  const devices = await listDevices(req.user!.tenantId);
  res.json(devices);
}));

licencesRouter.post('/devices', asyncHandler(async (req: Request, res: Response) => {
  const { deviceName, deviceType, serialNumber, hardwareId, fingerprint } = req.body;
  if (!deviceName) { res.status(400).json({ error: 'deviceName is required' }); return; }
  const result = await registerDevice(
    req.user!.tenantId,
    { deviceName, deviceType, serialNumber, hardwareId, fingerprint, userId: req.user!.sub },
    req.user!.sub,
  );
  res.status(201).json(result);
}));

// ─── Licensing Authority routes ──────────────────────────────────────────────

const authorityOnly = requireRole(RoleName.LicensingAuthority, RoleName.PlatformSuperAdmin);

licencesRouter.get(
  '/all',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { status, tenantId, search, sortBy, sortOrder } = req.query;
    const licences = await listLicences({
      status: status as string | undefined,
      tenantId: tenantId as string | undefined,
      search: search as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as string | undefined,
    });
    res.json(licences);
  }),
);

licencesRouter.post(
  '/:id/renew',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { durationMonths } = req.body;
    const result = await confirmPaymentAndRenew(req.params.id, req.user!.sub, durationMonths);
    res.json(result);
  }),
);

licencesRouter.patch(
  '/:id/duration',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { durationMonths } = req.body;
    if (!durationMonths || typeof durationMonths !== 'number') {
      res.status(400).json({ error: 'durationMonths (number) is required' });
      return;
    }
    const result = await changeDuration(req.params.id, durationMonths, req.user!.sub);
    res.json(result);
  }),
);

licencesRouter.post(
  '/:id/suspend',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await suspendLicence(req.params.id, req.user!.sub, req.body.reason);
    res.json({ message: 'Licence suspended' });
  }),
);

licencesRouter.post(
  '/:id/revoke',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    await revokeLicence(req.params.id, req.user!.sub, req.body.reason);
    res.json({ message: 'Licence revoked' });
  }),
);

licencesRouter.post(
  '/:id/reactivate',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reactivateLicence(req.params.id, req.user!.sub);
    res.json(result);
  }),
);

licencesRouter.post(
  '/:id/device-slots',
  authorityOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await addDeviceSlot(req.params.id, req.user!.sub);
    res.status(201).json(result);
  }),
);
