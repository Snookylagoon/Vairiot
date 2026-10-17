import { Prisma } from '@prisma/client';
import {
  componentTemplateLineSchema,
  type ComponentTemplateInput, type ComponentTemplateUpdateInput, type InstantiateTemplateInput,
} from 'vairiot-shared';
import { z } from 'zod';

import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { enforceAssetCap } from './asset-cap.service';
import { createAsset } from './asset.service';
import { recordAuditEvent } from './audit-event.service';
import { getComponentGroup, recomputeGroupRecognition, splitTemplateCost } from './component.service';

// Component templates (Phase 2, S2.2): "Signalised junction" → the parent and
// its controller, poles, heads and detectors, each with its class, life and
// share of the cost.

const linesSchema = z.array(componentTemplateLineSchema);

function duplicateCode(err: unknown, code: string | undefined): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new ConflictError(`A component template with code ${code} already exists`, 'DUPLICATE_CODE');
  }
  throw err;
}

/** Every class a template names must be one of the tenant's. */
async function checkClasses(tenantId: string, input: { assetClassId?: string | null; lines?: { assetClassId?: string | null }[] }) {
  const ids = [input.assetClassId, ...(input.lines ?? []).map((l) => l.assetClassId)].filter((x): x is string => !!x);
  if (ids.length === 0) return;
  const found = await prisma.assetClass.count({ where: { tenantId, id: { in: [...new Set(ids)] } } });
  if (found !== new Set(ids).size) throw new ValidationError('A template names an unknown asset class');
}

export async function listComponentTemplates(tenantId: string) {
  return prisma.componentTemplate.findMany({ where: { tenantId }, orderBy: { code: 'asc' }, include: { assetClass: { select: { code: true, name: true } } } });
}

export async function createComponentTemplate(tenantId: string, actorId: string, input: ComponentTemplateInput) {
  await checkClasses(tenantId, input);
  const created = await prisma.componentTemplate.create({
    data: { ...input, lines: input.lines as Prisma.InputJsonValue, tenantId },
  }).catch((e) => duplicateCode(e, input.code));
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'component_template', entityId: created.id, action: 'created', after: created as unknown as Prisma.InputJsonValue });
  return created;
}

export async function updateComponentTemplate(tenantId: string, actorId: string, id: string, input: ComponentTemplateUpdateInput) {
  const before = await prisma.componentTemplate.findFirst({ where: { id, tenantId } });
  if (!before) throw new NotFoundError('Component template not found');
  await checkClasses(tenantId, input);
  const updated = await prisma.componentTemplate.update({
    where: { id },
    data: { ...input, ...(input.lines && { lines: input.lines as Prisma.InputJsonValue }) },
  }).catch((e) => duplicateCode(e, input.code));
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'component_template', entityId: id, action: 'updated',
    before: before as unknown as Prisma.InputJsonValue, after: updated as unknown as Prisma.InputJsonValue,
  });
  return updated;
}

/**
 * Creates the parent and one component per line, each through the normal
 * asset create (numbers, GS1 reference, ledger event, recognition). Not one
 * database transaction — each create allocates its own reference — so
 * everything that could refuse it is checked first: the template, its classes
 * and the licence cap for the whole set.
 */
export async function instantiateComponentTemplate(tenantId: string, actorId: string, templateId: string, input: InstantiateTemplateInput) {
  const tpl = await prisma.componentTemplate.findFirst({ where: { id: templateId, tenantId, active: true } });
  if (!tpl) throw new NotFoundError('Component template not found');
  const lines = linesSchema.parse(tpl.lines);
  await checkClasses(tenantId, { assetClassId: tpl.assetClassId, lines });
  // Onto an existing asset: only the parts, named after it; its own cost stays.
  const existing = input.parentAssetId
    ? await prisma.asset.findFirst({ where: { id: input.parentAssetId, tenantId, deletedAt: null } })
    : null;
  if (input.parentAssetId && !existing) throw new NotFoundError('Asset not found');
  if (existing?.parentAssetId) throw new ValidationError('A component cannot have components');
  await enforceAssetCap(tenantId, lines.length + (existing ? 0 : 1));

  const cost = splitTemplateCost(input.totalCost, lines);
  const shared = {
    categoryId: input.categoryId ?? undefined,
    purchaseDate: input.purchaseDate?.toISOString(),
    depreciationStartDate: input.depreciationStartDate?.toISOString(),
  };
  const parent = existing ?? await createAsset(tenantId, actorId, {
    ...shared, name: input.name, siteId: input.siteId ?? undefined, locationId: input.locationId ?? undefined,
    assetClassId: tpl.assetClassId, purchaseCost: cost.parent === null ? undefined : Number(cost.parent.toFixed(2)),
  });
  for (const [i, line] of lines.entries()) {
    await createAsset(tenantId, actorId, {
      ...shared, name: `${existing?.name ?? input.name} — ${line.name}`,
      parentAssetId: parent.id, componentRole: line.role,
      assetClassId: line.assetClassId ?? tpl.assetClassId,
      usefulLifeMonths: line.lifeMonths ?? undefined,
      purchaseCost: cost.parts[i] === null ? undefined : Number(cost.parts[i]!.toFixed(2)),
    });
  }
  await recomputeGroupRecognition(tenantId, parent.id);
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'asset', entityId: parent.id, action: 'created_from_template',
    after: { templateId: tpl.id, templateCode: tpl.code, components: lines.length },
  });
  return getComponentGroup(tenantId, parent.id);
}
