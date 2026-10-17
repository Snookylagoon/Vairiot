import { Router, type Response } from 'express';
import { approvalDecisionSchema, approvalRulesSchema } from 'vairiot-shared';

import { ValidationError } from '../../lib/errors';
import { requireAnyPermission } from '../../middleware/authorise';
import { asyncHandler } from '../../middleware/error-handler';
import { cancel, decide, listRules, setRules } from '../../services/approvals/approval.service';
import '../../services/approvals/approval-wiring'; // registers how each action is applied
import { inbox, listApprovals } from '../../services/approvals/inbox.service';
import type { Request } from '../../types/http';

// Maker-checker approvals (Phase 3, S3.1, stage 3.2, D22). Requests are made
// by the actions' own routes (dispose, transfer, adjustments, recognition)
// when a rule covers them; here they are listed and decided.
export const approvalsRouter = Router();

const viewer = (req: Request) => ({ userId: req.user!.sub, permissions: req.user!.permissions ?? [] });

approvalsRouter.get('/', requireAnyPermission('approval:read', 'approval:decide'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await listApprovals(req.user!.tenantId, viewer(req), { status: req.query.status as string, assetId: req.query.assetId as string, mine: req.query.mine === 'true' }));
  }));

/** Whatever the user may decide now, the ledger's post steps included, with the count for the header badge. */
approvalsRouter.get('/inbox', requireAnyPermission('approval:read', 'approval:decide', 'accounting:approve'),
  asyncHandler(async (req: Request, res: Response) => { res.json(await inbox(req.user!.tenantId, viewer(req))); }));

/** Requests anyone made, for the requester's own view ("awaiting approval"). */
approvalsRouter.get('/mine', asyncHandler(async (req: Request, res: Response) => {
  res.json(await listApprovals(req.user!.tenantId, viewer(req), { mine: true, status: req.query.status as string }));
}));

const decision = (kind: 'APPROVE' | 'REJECT') => asyncHandler(async (req: Request, res: Response) => {
  const r = approvalDecisionSchema.safeParse({ decision: kind, reason: req.body?.reason });
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message).join('; '));
  res.json(await decide(req.user!.tenantId, req.user!.sub, req.user!.permissions ?? [], req.params.id, r.data));
});
approvalsRouter.post('/:id/approve', requireAnyPermission('approval:decide'), decision('APPROVE'));
approvalsRouter.post('/:id/reject', requireAnyPermission('approval:decide'), decision('REJECT'));

approvalsRouter.post('/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
  res.json(await cancel(req.user!.tenantId, req.user!.sub, req.params.id));
}));

approvalsRouter.get('/rules', requireAnyPermission('approval:read', 'approval:decide', 'company:manage'),
  asyncHandler(async (req: Request, res: Response) => { res.json(await listRules(req.user!.tenantId)); }));

approvalsRouter.put('/rules', requireAnyPermission('company:manage'),
  asyncHandler(async (req: Request, res: Response) => {
    const r = approvalRulesSchema.safeParse(req.body);
    if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
    res.json(await setRules(req.user!.tenantId, req.user!.sub, r.data));
  }));
