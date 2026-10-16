import { Prisma } from '@prisma/client';
import { DEFAULT_CONDITION_SCALE, isConditionGrade, type ConditionScaleEntry } from 'vairiot-shared';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';

import { recordAssetEvent } from './asset-event.service';
import { recordAuditEvent } from './audit-event.service';

// Condition scale, photo rules and condition events (Phase 1 W5, stage 1.13).

const EntrySchema = z.object({
  grade: z.number().int().min(1).max(5),
  label: z.string().trim().min(1).max(60),
  criteria: z.string().trim().min(1).max(500),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be #rrggbb'),
  impairmentIndicator: z.boolean(),
  photoRequired: z.boolean(),
});
export const ScaleSchema = z.array(EntrySchema).length(5)
  .refine((rows) => new Set(rows.map((r) => r.grade)).size === 5, 'Give each grade 1–5 exactly once');

const entryOut = (r: { grade: number; label: string; criteria: string; colour: string; impairmentIndicator: boolean; photoRequired: boolean }) =>
  ({ grade: r.grade, label: r.label, criteria: r.criteria, colour: r.colour, impairmentIndicator: r.impairmentIndicator, photoRequired: r.photoRequired }) as ConditionScaleEntry;

async function checkCategory(tenantId: string, categoryId: string | null) {
  if (!categoryId) return;
  const c = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
  if (!c) throw new NotFoundError('Category not found');
}

/** The scale for a category: its own rows, else the tenant's, else the default. */
export async function getConditionScale(tenantId: string, categoryId: string | null = null) {
  if (categoryId) {
    const own = await prisma.conditionScaleEntry.findMany({ where: { tenantId, categoryId }, orderBy: { grade: 'desc' } });
    if (own.length === 5) return { source: 'category' as const, entries: own.map(entryOut) };
  }
  const tenant = await prisma.conditionScaleEntry.findMany({ where: { tenantId, categoryId: null }, orderBy: { grade: 'desc' } });
  if (tenant.length === 5) return { source: 'tenant' as const, entries: tenant.map(entryOut) };
  return { source: 'default' as const, entries: [...DEFAULT_CONDITION_SCALE] };
}

/** Replaces a whole scale; `entries: null` removes it (falls back to the next level). */
export async function putConditionScale(tenantId: string, actorId: string, categoryId: string | null, entries: unknown) {
  await checkCategory(tenantId, categoryId);
  let rows: z.infer<typeof ScaleSchema> | null = null;
  if (entries !== null) {
    const parsed = ScaleSchema.safeParse(entries);
    if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    rows = parsed.data;
  }
  await prisma.$transaction(async (tx) => {
    await tx.conditionScaleEntry.deleteMany({ where: { tenantId, categoryId } });
    if (rows) await tx.conditionScaleEntry.createMany({ data: rows.map((r) => ({ ...r, tenantId, categoryId })) });
  });
  recordAuditEvent({
    tenantId, actor: actorId, entityType: 'condition_scale', entityId: categoryId ?? tenantId,
    action: rows ? 'condition_scale_updated' : 'condition_scale_removed', after: (rows ?? []) as Prisma.InputJsonValue,
  });
  return getConditionScale(tenantId, categoryId);
}

export async function getPhotoRules(tenantId: string) {
  const rows = await prisma.photoRule.findMany({ where: { tenantId }, select: { categoryId: true, minPhotosAtInventory: true } });
  return {
    defaultMinPhotos: rows.find((r) => r.categoryId === null)?.minPhotosAtInventory ?? 0,
    categories: rows.filter((r) => r.categoryId).map((r) => ({ categoryId: r.categoryId!, minPhotosAtInventory: r.minPhotosAtInventory })),
  };
}

const RulesSchema = z.object({
  defaultMinPhotos: z.number().int().min(0).max(4),
  categories: z.array(z.object({ categoryId: z.string().min(1), minPhotosAtInventory: z.number().int().min(0).max(4) })).max(500),
});

/** Replaces the tenant's photo rules. */
export async function putPhotoRules(tenantId: string, actorId: string, body: unknown) {
  const parsed = RulesSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  const ids = parsed.data.categories.map((c) => c.categoryId);
  const known = await prisma.category.count({ where: { tenantId, id: { in: ids } } });
  if (known !== new Set(ids).size) throw new NotFoundError('Category not found');
  await prisma.$transaction(async (tx) => {
    await tx.photoRule.deleteMany({ where: { tenantId } });
    await tx.photoRule.createMany({ data: [
      { tenantId, categoryId: null, minPhotosAtInventory: parsed.data.defaultMinPhotos },
      ...parsed.data.categories.map((c) => ({ tenantId, ...c })),
    ] });
  });
  recordAuditEvent({ tenantId, actor: actorId, entityType: 'photo_rules', entityId: tenantId, action: 'photo_rules_updated', after: parsed.data });
  return getPhotoRules(tenantId);
}

/** CONDITION_ASSESSED on the asset ledger when the grade changes. */
export async function recordConditionEvent(
  tenantId: string, assetId: string, actorId: string,
  before: { conditionGrade?: number | null; condition?: string | null } | null,
  after: { conditionGrade?: number | null; condition?: string | null },
) {
  const from = before?.conditionGrade ?? null;
  const to = after.conditionGrade ?? null;
  if (!isConditionGrade(to) || from === to) return;
  await recordAssetEvent({
    tenantId, assetId, eventType: 'CONDITION_ASSESSED', actor: actorId, source: 'API',
    payload: { fromGrade: from, toGrade: to, fromCondition: before?.condition ?? null, toCondition: after.condition ?? null },
  });
}

export interface PhotoWarning {
  scanId: string;
  tagValue: string;
  reason: 'below_minimum' | 'grade_needs_photo';
  photos: number;
  required: number;
}

/**
 * Scans in a campaign (optionally one zone) that miss the photo rules:
 * fewer photos than the category's minimum, or a grade whose scale needs a
 * photo. Warnings only (S1.3 step 6): nothing is blocked.
 */
export async function photoWarnings(tenantId: string, campaignId: string, locationId?: string): Promise<PhotoWarning[]> {
  const [scans, rules] = await Promise.all([
    prisma.auditScanEvent.findMany({
      where: { tenantId, campaignId, ...(locationId && { locationId }) },
      select: { id: true, tagValue: true, assetId: true, conditionGrade: true, _count: { select: { photos: true } } },
    }),
    getPhotoRules(tenantId),
  ]);
  const assets = await prisma.asset.findMany({
    where: { tenantId, id: { in: scans.map((s) => s.assetId).filter((a): a is string => !!a) } },
    select: { id: true, categoryId: true },
  });
  const categoryOf = new Map(assets.map((a) => [a.id, a.categoryId]));
  const minFor = new Map(rules.categories.map((c) => [c.categoryId, c.minPhotosAtInventory]));
  const scales = new Map<string, ConditionScaleEntry[]>();
  const scaleFor = async (categoryId: string | null) => {
    const key = categoryId ?? '';
    if (!scales.has(key)) scales.set(key, (await getConditionScale(tenantId, categoryId)).entries);
    return scales.get(key)!;
  };

  const out: PhotoWarning[] = [];
  for (const s of scans) {
    const categoryId = s.assetId ? categoryOf.get(s.assetId) ?? null : null;
    const photos = s._count.photos;
    const min = (categoryId ? minFor.get(categoryId) : undefined) ?? rules.defaultMinPhotos;
    if (photos < min) out.push({ scanId: s.id, tagValue: s.tagValue, reason: 'below_minimum', photos, required: min });
    else if (s.conditionGrade && photos === 0
      && (await scaleFor(categoryId)).find((e) => e.grade === s.conditionGrade)?.photoRequired) {
      out.push({ scanId: s.id, tagValue: s.tagValue, reason: 'grade_needs_photo', photos, required: 1 });
    }
  }
  return out;
}
