import { Router, type Response } from 'express';
import {
  assetClassSchema, assetClassUpdateSchema, componentLinkSchema, componentTemplateSchema, componentTemplateUpdateSchema,
  accountingPeriodSchema, assetUsageBulkSchema, assetUsageSchema, impairmentAssessmentSchema, impairmentCreateSchema, impairmentPeriodSchema,
  instantiateTemplateSchema, recognitionOverrideSchema, reverseRunSchema,
} from 'vairiot-shared';
import type { z } from 'zod';

import { ValidationError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { requireFeature } from '../../middleware/require-feature';
import { createAssetClass, listAssetClasses, updateAssetClass } from '../../services/asset-class.service';
import {
  createComponentTemplate, instantiateComponentTemplate, listComponentTemplates, updateComponentTemplate,
} from '../../services/component-template.service';
import { getComponentGroup, setComponentParent } from '../../services/component.service';
import {
  assetDepreciationHistory, discardRun, listPeriods, listUsage, openPeriod, postRun, prepareRun, reverseRun, setPeriodStatus, setUsage, setUsageBulk,
} from '../../services/depreciation/runs.service';
import {
  assessImpairment, correctImpairment, dismissImpairment, listImpairments, postImpairment, raiseImpairment,
} from '../../services/impairment.service';
import { listPendingReview, overrideRecognition, setCategoryClass } from '../../services/recognition.service';
import { depreciationByClass } from '../../services/reports/depreciation-by-class';
import { impairmentRegister } from '../../services/reports/impairment-register';
import type { Request } from '../../types/http';

// The IPSAS ledger (Phase 2), behind the tenant's `ipsas` module: every route
// here answers 404 while it is off. Classes, periods, runs and impairment
// arrive in W2–W5: the guard and settings at stage 2.2, classes and
// recognition at stage 2.3.
export const accountingRouter = Router();

accountingRouter.use(requireFeature('ipsas'));

/**
 * The conventions every ledger figure follows (Phase 2 plan §2.2, D14, D15,
 * D17), with the tenant's currency and time zone that periods are kept in.
 */
accountingRouter.get('/settings', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const company = await prisma.company.findUnique({
      where: { tenantId: req.user!.tenantId }, select: { currency: true, timezone: true },
    });
    res.json({
      currency: company?.currency ?? 'USD',
      timezone: company?.timezone ?? 'UTC',
      measurement: 'cost',
      period: 'monthly',
      depreciationConvention: { startMonth: 'full', disposalMonth: 'none' },
      rounding: { mode: 'half_up', places: 2, remainder: 'last_month' },
      approval: { separateApprover: true },
    });
  }),
);

/** Validates a body against a shared contract (D19); 400 with every issue. */
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

// ── Asset classes (S2.1) ──────────────────────────────────────────────────────

accountingRouter.get('/classes', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listAssetClasses(req.user!.tenantId));
  }),
);

accountingRouter.post('/classes', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await createAssetClass(req.user!.tenantId, req.user!.sub, parse(assetClassSchema, req.body)));
  }),
);

accountingRouter.patch('/classes/:id', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateAssetClass(req.user!.tenantId, req.user!.sub, req.params.id, parse(assetClassUpdateSchema, req.body)));
  }),
);

accountingRouter.put('/categories/:id/class', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.body?.assetClassId;
    if (id !== null && typeof id !== 'string') throw new ValidationError('assetClassId must be a class id or null');
    res.json(await setCategoryClass(req.user!.tenantId, req.user!.sub, req.params.id, id));
  }),
);

// ── Recognition (S2.1, D20) ───────────────────────────────────────────────────

accountingRouter.get('/assets/pending-review', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listPendingReview(req.user!.tenantId));
  }),
);

accountingRouter.put('/assets/:id/recognition', requireAnyPermission('accounting:approve'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await overrideRecognition(req.user!.tenantId, req.user!.sub, req.params.id, parse(recognitionOverrideSchema, req.body)));
  }),
);

// ── Components (S2.2) ─────────────────────────────────────────────────────────

accountingRouter.get('/assets/:id/components', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await getComponentGroup(req.user!.tenantId, req.params.id));
  }),
);

accountingRouter.put('/assets/:id/parent', requireAnyPermission('accounting:write'), requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await setComponentParent(req.user!.tenantId, req.user!.sub, req.params.id, parse(componentLinkSchema, req.body)));
  }),
);

accountingRouter.get('/component-templates', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listComponentTemplates(req.user!.tenantId));
  }),
);

accountingRouter.post('/component-templates', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await createComponentTemplate(req.user!.tenantId, req.user!.sub, parse(componentTemplateSchema, req.body)));
  }),
);

accountingRouter.patch('/component-templates/:id', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await updateComponentTemplate(req.user!.tenantId, req.user!.sub, req.params.id, parse(componentTemplateUpdateSchema, req.body)));
  }),
);

/** Creates an asset and its components from a template; needs asset:write too. */
accountingRouter.post('/component-templates/:id/assets', requireAnyPermission('accounting:write'), requireAnyPermission('asset:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await instantiateComponentTemplate(req.user!.tenantId, req.user!.sub, req.params.id, parse(instantiateTemplateSchema, req.body)));
  }),
);

// ── Periods and depreciation runs (S2.3) ─────────────────────────────────────
// Prepare and discard need accounting:write; post, reverse, reopen and lock
// need accounting:approve, and the preparer cannot post (D17). Prepare, post
// and reverse answer 202: the worker does the work (stage 2.10).

accountingRouter.get('/periods', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listPeriods(req.user!.tenantId));
  }),
);

accountingRouter.post('/periods', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { year, month } = parse(accountingPeriodSchema, req.body);
    res.status(201).json(await openPeriod(req.user!.tenantId, req.user!.sub, year, month));
  }),
);

accountingRouter.post('/periods/:id/runs', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(202).json(await prepareRun(req.user!.tenantId, req.user!.sub, req.params.id));
  }),
);

for (const [action, to] of [['reopen', 'OPEN'], ['lock', 'LOCKED']] as const) {
  accountingRouter.post(`/periods/:id/${action}`, requireAnyPermission('accounting:approve'),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      res.json(await setPeriodStatus(req.user!.tenantId, req.user!.sub, req.params.id, to));
    }),
  );
}

accountingRouter.put('/periods/:id/usage/:assetId', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { units } = parse(assetUsageSchema, req.body);
    res.json(await setUsage(req.user!.tenantId, req.user!.sub, req.params.id, req.params.assetId, units));
  }),
);

// Usage for every units-of-production asset in a period (stage 2.10).
accountingRouter.get('/periods/:id/usage', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listUsage(req.user!.tenantId, req.params.id));
  }),
);

accountingRouter.put('/periods/:id/usage', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await setUsageBulk(req.user!.tenantId, req.user!.sub, req.params.id, parse(assetUsageBulkSchema, req.body).rows));
  }),
);

accountingRouter.post('/runs/:id/post', requireAnyPermission('accounting:approve'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(202).json(await postRun(req.user!.tenantId, req.user!.sub, req.params.id));
  }),
);

accountingRouter.post('/runs/:id/discard', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await discardRun(req.user!.tenantId, req.params.id));
  }),
);

accountingRouter.post('/runs/:id/reverse', requireAnyPermission('accounting:approve'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(202).json(await reverseRun(req.user!.tenantId, req.user!.sub, req.params.id, parse(reverseRunSchema, req.body ?? {}).notes));
  }),
);

accountingRouter.get('/assets/:id/depreciation', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await assetDepreciationHistory(req.user!.tenantId, req.params.id));
  }),
);

/** Posted depreciation by class for a period (default: the latest posted); also exportable as `depreciation-by-class`. */
accountingRouter.get('/depreciation-by-class', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await depreciationByClass(req.user!.tenantId, { year: req.query.year as string, month: req.query.month as string }));
  }),
);

// ── Impairment (S2.4, stage 2.11) ────────────────────────────────────────────

accountingRouter.get('/impairments', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await listImpairments(req.user!.tenantId, { status: req.query.status as string | undefined, assetId: req.query.assetId as string | undefined }));
  }),
);

accountingRouter.post('/impairments', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await raiseImpairment(req.user!.tenantId, req.user!.sub, parse(impairmentCreateSchema, req.body)));
  }),
);

accountingRouter.put('/impairments/:id/assessment', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await assessImpairment(req.user!.tenantId, req.user!.sub, req.params.id, parse(impairmentAssessmentSchema, req.body)));
  }),
);

accountingRouter.post('/impairments/:id/dismiss', requireAnyPermission('accounting:write'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await dismissImpairment(req.user!.tenantId, req.user!.sub, req.params.id, parse(reverseRunSchema, req.body ?? {}).notes));
  }),
);

accountingRouter.post('/impairments/:id/post', requireAnyPermission('accounting:approve'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await postImpairment(req.user!.tenantId, req.user!.sub, req.params.id, parse(impairmentPeriodSchema, req.body).periodId));
  }),
);

accountingRouter.post('/impairments/:id/correct', requireAnyPermission('accounting:approve'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = parse(impairmentPeriodSchema, req.body);
    res.status(201).json(await correctImpairment(req.user!.tenantId, req.user!.sub, req.params.id, body.periodId, body.notes));
  }),
);

/** Posted impairments, reversals and corrections, optionally for one period or class; also exportable as `impairment-register`. */
accountingRouter.get('/impairment-register', requireAnyPermission('accounting:read'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json(await impairmentRegister(req.user!.tenantId, req.query as Record<string, string>));
  }),
);
