import { z } from 'zod';

// The staged register import (Phase 2, S2.5, stage 2.13): the fields a file's
// columns map to, the mapping contract (D19), and reading a profiler mapping
// (scripts/profile-register.py) as a starting point.

export type ImportFieldType = 'text' | 'decimal' | 'integer' | 'date';

export const IMPORT_FIELDS = {
  name: 'text', description: 'text', categoryName: 'text', classCode: 'text', siteName: 'text',
  serialNumber: 'text', modelNumber: 'text', manufacturer: 'text', barcode: 'text', rfidTag: 'text',
  purchaseCost: 'decimal', purchaseDate: 'date', supplier: 'text', warrantyExpiry: 'date',
  condition: 'text', conditionGrade: 'integer', status: 'text', notes: 'text',
  purchaseOrderNumber: 'text', invoiceNumber: 'text', residualValue: 'decimal', usefulLifeMonths: 'integer',
  depreciationMethod: 'text', depreciationStartDate: 'date', latitude: 'decimal', longitude: 'decimal', custodian: 'text',
  /** The finance system's reference: FINANCE_REF, and the key in update mode. */
  financeRef: 'text',
  /** The number on the old register: LEGACY_TAG. Vairiot allocates its own. */
  legacyAssetNumber: 'text',
} as const satisfies Record<string, ImportFieldType>;

export type ImportField = keyof typeof IMPORT_FIELDS;
export const IMPORT_FIELD_NAMES = Object.keys(IMPORT_FIELDS) as [ImportField, ...ImportField[]];

/** Fields whose values are looked up, and may be translated by a lookup table first. */
export const LOOKUP_FIELDS = ['classCode', 'siteName', 'categoryName', 'condition'] as const;

export const importMappingSchema = z.object({
  /** Target field → the file's column header. */
  fields: z.record(z.enum(IMPORT_FIELD_NAMES), z.string().min(1).max(200)),
  transforms: z.object({
    /** How day-first, month-first or year-first text dates are read; Excel dates need none. */
    dateFormat: z.enum(['DMY', 'MDY', 'YMD']).default('DMY'),
    decimalSeparator: z.enum(['.', ',']).default('.'),
    /** Per field, the file's value → the register's (e.g. "Signs" → "SGN"). */
    lookups: z.record(z.enum(LOOKUP_FIELDS), z.record(z.string(), z.string())).default({}),
  }).default({}),
});
export type ImportMapping = z.infer<typeof importMappingSchema>;
export type ImportMappingInput = z.input<typeof importMappingSchema>;

export const importMappingSaveSchema = z.object({ name: z.string().trim().min(1).max(100), mapping: importMappingSchema });

export const importModeSchema = z.enum(['CREATE', 'UPDATE']);

/** The profiler's JSON: `mappings` of `{ column, field, importable }`. */
const profileSchema = z.object({
  mappings: z.array(z.object({ column: z.string(), field: z.string().nullable() })),
});

/**
 * A mapping from the profiler's suggestion: every column it matched to a field
 * the importer takes (now including the legacy asset number). Locations are
 * not imported yet, so `locationName` is left out.
 */
export function mappingFromProfile(doc: unknown): ImportMapping {
  const profile = profileSchema.parse(doc);
  const fields: Partial<Record<ImportField, string>> = {};
  for (const m of profile.mappings) {
    if (m.field && m.field in IMPORT_FIELDS && !fields[m.field as ImportField]) fields[m.field as ImportField] = m.column;
  }
  return importMappingSchema.parse({ fields });
}
