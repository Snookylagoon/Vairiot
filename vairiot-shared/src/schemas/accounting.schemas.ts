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
