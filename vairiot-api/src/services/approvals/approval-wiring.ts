import type { Prisma } from '@prisma/client';
import { parentDisposalChoice, type ParentDisposalChoice, type RecognitionOverrideInput } from 'vairiot-shared';

import { prisma } from '../../lib/prisma';
import { disposeAsset, getAsset, type DisposalInput } from '../asset.service';
import { assertAdjustmentAllowed, postAdjustment, type PostAdjustmentInput } from '../audit.service';
import { prepareParentDisposal } from '../component.service';
import { overrideRecognition } from '../recognition.service';
import { createTransfer, type TransferCreateInput } from '../transfer.service';

import { registerApplier, throughApproval } from './approval.service';

// Where the maker-checker sits (stage 3.2, D22): each route asks here instead
// of calling its service, and each action registers how an approved request
// is applied. The requester's own permission was checked when they asked, so
// the change is applied as theirs; the approver is recorded on the request
// and, where the record has the field, as its approvedBy.

const nameOf = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }).then((u) => u?.name || u?.email)) ?? userId;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const nbv = async (tenantId: string, assetId: string) => (await getAsset(tenantId, assetId)).depreciation?.netBookValue ?? 0;

// ── Disposal ────────────────────────────────────────────────────────────────

/** A disposal, with its parts disposed or detached as chosen (S2.2). */
export async function disposeWithParts(tenantId: string, actorId: string, assetId: string, body: DisposalInput & { components?: ParentDisposalChoice }) {
  await prepareParentDisposal(tenantId, assetId, body.components, (componentId) => disposeAsset(tenantId, componentId, actorId, {
    disposalDate: body.disposalDate, disposalMethod: body.disposalMethod, disposalValue: 0, disposalReason: 'Disposed with its parent',
  }), actorId);
  return disposeAsset(tenantId, assetId, actorId, body);
}

export async function requestDisposal(tenantId: string, actorId: string, assetId: string, body: DisposalInput & { components?: ParentDisposalChoice }) {
  const asset = await getAsset(tenantId, assetId);
  return throughApproval(tenantId, actorId, {
    action: 'DISPOSE', assetId, entityType: 'asset', entityId: assetId, payload: json(body), amount: await nbv(tenantId, assetId),
    summary: `Dispose of ${asset.assetNumber} ${asset.name} (${body.disposalMethod})`,
  }, () => disposeWithParts(tenantId, actorId, assetId, body));
}

registerApplier('DISPOSE', async (r, deciderId) => {
  const body = r.payload as unknown as DisposalInput & { components?: ParentDisposalChoice };
  const components = parentDisposalChoice.optional().parse(body.components);
  const asset = await disposeWithParts(r.tenantId, r.requestedBy, r.entityId, { ...body, components, approvedBy: await nameOf(deciderId) });
  return json({ assetId: asset.id });
});

// ── Transfer ────────────────────────────────────────────────────────────────

export async function requestTransfer(tenantId: string, actorId: string, input: TransferCreateInput) {
  const asset = await getAsset(tenantId, input.assetId);
  return throughApproval(tenantId, actorId, {
    action: 'TRANSFER', assetId: input.assetId, entityType: 'asset', entityId: input.assetId, payload: json(input), amount: null,
    summary: `Transfer ${asset.assetNumber} ${asset.name}${input.toCustodian ? ` to ${input.toCustodian}` : ''}`,
  }, () => createTransfer(tenantId, actorId, input));
}

registerApplier('TRANSFER', async (r, deciderId) => {
  const transfer = await createTransfer(r.tenantId, r.requestedBy, { ...(r.payload as unknown as TransferCreateInput), approvedBy: await nameOf(deciderId) });
  return json({ transferId: (transfer as { id: string }).id });
});

// ── Audit adjustments: write-off and register-new ───────────────────────────

const ADJUSTMENT_ACTIONS = { write_off: 'WRITE_OFF', register_new: 'REGISTER_NEW' } as const;

export async function requestAdjustment(tenantId: string, campaignId: string, actorId: string, input: PostAdjustmentInput) {
  const action = ADJUSTMENT_ACTIONS[input.adjustmentType as keyof typeof ADJUSTMENT_ACTIONS];
  if (!action) return { result: await postAdjustment(tenantId, campaignId, actorId, input), approval: undefined };
  const item = await assertAdjustmentAllowed(tenantId, campaignId, actorId, input.reconciliationItemId);
  const assetId = item.snapshotAsset?.assetId ?? null;
  const asset = assetId ? await getAsset(tenantId, assetId) : null;
  return throughApproval(tenantId, actorId, {
    action, assetId, entityType: 'reconciliation_item', entityId: input.reconciliationItemId, payload: json({ campaignId, ...input }),
    amount: action === 'WRITE_OFF' && assetId ? await nbv(tenantId, assetId) : null,
    summary: action === 'WRITE_OFF' ? `Write off ${asset ? `${asset.assetNumber} ${asset.name}` : 'an asset'}: ${input.justification}` : `Register a new asset found in the count: ${input.justification}`,
  }, () => postAdjustment(tenantId, campaignId, actorId, input));
}

for (const action of ['WRITE_OFF', 'REGISTER_NEW'] as const) {
  registerApplier(action, async (r) => {
    const { campaignId, ...input } = r.payload as unknown as PostAdjustmentInput & { campaignId: string };
    const adjustment = await postAdjustment(r.tenantId, campaignId, r.requestedBy, input);
    return json({ adjustmentId: adjustment.id });
  });
}

// ── Capitalisation: an expensed item recognised by override ─────────────────

export async function requestRecognitionOverride(tenantId: string, actorId: string, assetId: string, input: RecognitionOverrideInput) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, tenantId, deletedAt: null }, select: { assetNumber: true, name: true, recognitionStatus: true, capitalisedCost: true } });
  if (!asset || input.status !== 'RECOGNISED' || asset.recognitionStatus !== 'EXPENSED') {
    return { result: await overrideRecognition(tenantId, actorId, assetId, input), approval: undefined };
  }
  return throughApproval(tenantId, actorId, {
    action: 'CAPITALISE', assetId, entityType: 'asset', entityId: assetId, payload: json(input), amount: asset.capitalisedCost,
    summary: `Capitalise ${asset.assetNumber} ${asset.name}: ${input.reason}`,
  }, () => overrideRecognition(tenantId, actorId, assetId, input));
}

registerApplier('CAPITALISE', async (r) => {
  await overrideRecognition(r.tenantId, r.requestedBy, r.entityId, r.payload as unknown as RecognitionOverrideInput);
  return json({ assetId: r.entityId });
});
