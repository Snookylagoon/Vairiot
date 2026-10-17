import { z } from 'zod';

import { AcquisitionType, IpsasClass, RecognitionStatus } from '../constants/accounting.constants.js';
import { DepreciationMethod } from '../constants/asset.constants.js';

// Request contracts for the IPSAS ledger routes (D19), shared by the API,
// which validates with them, and the web console, which builds the bodies.

const values = <T extends Record<string, string>>(o: T) => Object.values(o) as [T[keyof T], ...T[keyof T][]];
const amount = z.coerce.number().finite().min(0).max(9_999_999_999.99);
const glAccount = z.string().trim().max(40).nullable().optional();

export const assetClassSchema = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Z0-9_-]+$/, 'Code: capital letters, digits, - and _'),
  name: z.string().trim().min(1).max(120),
  ipsasClass: z.enum(values(IpsasClass)),
  capitalisationThreshold: amount,
  defaultUsefulLifeMonths: z.coerce.number().int().min(1).max(1200).nullable().optional(),
  defaultDepreciationMethod: z.enum(values(DepreciationMethod)).default('straight_line'),
  defaultResidualPct: z.coerce.number().min(0).max(100).default(0),
  componentisationRequired: z.boolean().default(false),
  glAssetAccount: glAccount,
  glDepreciationAccount: glAccount,
  glAccumulatedDepreciationAccount: glAccount,
  glImpairmentAccount: glAccount,
  toBeConfirmed: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type AssetClassInput = z.infer<typeof assetClassSchema>;
export const assetClassUpdateSchema = assetClassSchema.partial();
export type AssetClassUpdateInput = z.infer<typeof assetClassUpdateSchema>;

/** The accounting fields an asset create or update may carry (ipsas on). */
export const assetAccountingSchema = z.object({
  assetClassId: z.string().min(1).nullable().optional(),
  acquisitionType: z.enum(values(AcquisitionType)).optional(),
  fairValueAtRecognition: amount.nullable().optional(),
  sourceEntity: z.string().trim().max(200).nullable().optional(),
  recognitionDate: z.coerce.date().nullable().optional(),
});
export type AssetAccountingInput = z.infer<typeof assetAccountingSchema>;

/** Finance's override of the threshold rule, or `status: null` to clear it. */
export const recognitionOverrideSchema = z.union([
  z.object({ status: z.enum([RecognitionStatus.Recognised, RecognitionStatus.Expensed]), reason: z.string().trim().min(5).max(500) }),
  z.object({ status: z.null() }),
]);
export type RecognitionOverrideInput = z.infer<typeof recognitionOverrideSchema>;

// ── Components (stage 2.5, S2.2) ───────────────────────────────────────────

const role = z.string().trim().min(1).max(40);

/** One part a template creates. Cost shares are of the total cost entered. */
export const componentTemplateLineSchema = z.object({
  role,
  name: z.string().trim().min(1).max(120),
  assetClassId: z.string().min(1).nullable().optional(),
  lifeMonths: z.coerce.number().int().min(1).max(1200).nullable().optional(),
  costSharePct: z.coerce.number().min(0).max(100),
});

export const componentTemplateSchema = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Z0-9_-]+$/, 'Code: capital letters, digits, - and _'),
  name: z.string().trim().min(1).max(120),
  assetClassId: z.string().min(1).nullable().optional(),
  lines: z.array(componentTemplateLineSchema).min(1).max(20)
    .refine((lines) => lines.reduce((t, l) => t + l.costSharePct, 0) <= 100.0001, 'Cost shares add up to more than 100 %'),
  toBeConfirmed: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type ComponentTemplateInput = z.infer<typeof componentTemplateSchema>;
export const componentTemplateUpdateSchema = componentTemplateSchema.partial();
export type ComponentTemplateUpdateInput = z.infer<typeof componentTemplateUpdateSchema>;

/**
 * Create a parent and its components from a template, or, with
 * `parentAssetId`, add the template's components to an existing asset.
 */
export const instantiateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentAssetId: z.string().min(1).nullable().optional(),
  totalCost: amount.nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  siteId: z.string().min(1).nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
  purchaseDate: z.coerce.date().nullable().optional(),
  depreciationStartDate: z.coerce.date().nullable().optional(),
});
export type InstantiateTemplateInput = z.infer<typeof instantiateTemplateSchema>;

/** Attach an asset to a parent as a component, move it, or (`parentAssetId: null`) detach it. */
export const componentLinkSchema = z.object({
  parentAssetId: z.string().min(1).nullable(),
  componentRole: role.nullable().optional(),
});
export type ComponentLinkInput = z.infer<typeof componentLinkSchema>;

/** What to do with a parent's components when it is disposed. */
export const parentDisposalChoice = z.enum(['dispose', 'detach']);
export type ParentDisposalChoice = z.infer<typeof parentDisposalChoice>;

// ── Periods and depreciation runs (stage 2.8, S2.3) ───────────────────────

export const accountingPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type AccountingPeriodInput = z.infer<typeof accountingPeriodSchema>;

/** Units an asset delivered in a period (units of production, D21). */
export const assetUsageSchema = z.object({ units: z.coerce.number().finite().min(0).max(1e14) });

export const reverseRunSchema = z.object({ notes: z.string().trim().max(500).optional() });

/** Usage for many assets in one period (stage 2.10, the bulk screen). */
export const assetUsageBulkSchema = z.object({
  rows: z.array(z.object({ assetId: z.string().min(1), units: z.coerce.number().finite().min(0).max(1e14) })).min(1).max(2000),
});
