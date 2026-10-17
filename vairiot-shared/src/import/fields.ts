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

/** A row's cells corrected in the review step, by column header (stage 2.14). */
export const importRowEditSchema = z.object({
  cells: z.record(z.string().min(1).max(200), z.union([z.string().max(2000), z.number(), z.null()]))
    .refine((c) => Object.keys(c).length > 0 && Object.keys(c).length <= 200, 'Between 1 and 200 cells'),
});

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

// Header words for each field, for the wizard's first guess (stage 2.14): the
// register export's own headers first, then common English, Georgian and
// Russian ones (scripts/profile-register.py keeps the fuller list).
const SYNONYMS: Record<ImportField, string[]> = {
  name: ['name', 'asset name', 'item', 'დასახელება', 'наименование'],
  description: ['description', 'details', 'აღწერა', 'описание'],
  categoryName: ['category', 'type', 'group', 'კატეგორია', 'категория'],
  classCode: ['asset class', 'class code', 'class', 'კლასი', 'класс'],
  siteName: ['site', 'facility', 'building', 'depot', 'ობიექტი', 'объект'],
  serialNumber: ['serial number', 'serial no', 'serial', 'სერიული ნომერი', 'серийный номер', 'заводской номер'],
  modelNumber: ['model number', 'model', 'მოდელი', 'модель'],
  manufacturer: ['manufacturer', 'make', 'brand', 'მწარმოებელი', 'производитель'],
  barcode: ['manufacturer ean', 'barcode', 'ean', 'შტრიხკოდი', 'штрихкод'],
  rfidTag: ['rfid tag', 'rfid', 'epc'],
  purchaseCost: ['purchase cost', 'cost', 'acquisition cost', 'value', 'price', 'ღირებულება', 'стоимость'],
  purchaseDate: ['purchase date', 'acquisition date', 'date acquired', 'შეძენის თარიღი', 'дата приобретения'],
  supplier: ['supplier', 'vendor', 'მომწოდებელი', 'поставщик'],
  warrantyExpiry: ['warranty expiry', 'warranty', 'საგარანტიო', 'гарантия'],
  condition: ['condition', 'state', 'მდგომარეობა', 'состояние'],
  conditionGrade: ['condition grade', 'grade', 'condition score'],
  status: ['status', 'სტატუსი', 'статус'],
  notes: ['notes', 'remarks', 'comment', 'შენიშვნა', 'примечание'],
  purchaseOrderNumber: ['po number', 'purchase order', 'order number'],
  invoiceNumber: ['invoice number', 'invoice', 'ინვოისი', 'накладная'],
  residualValue: ['residual value', 'salvage value', 'ნარჩენი ღირებულება'],
  usefulLifeMonths: ['useful life months', 'useful life', 'life months', 'სასარგებლო ვადა'],
  depreciationMethod: ['depreciation method', 'ცვეთის მეთოდი', 'метод амортизации'],
  depreciationStartDate: ['depreciation start date', 'depreciation start', 'in service date'],
  latitude: ['latitude', 'lat', 'განედი', 'широта'],
  longitude: ['longitude', 'lon', 'lng', 'long', 'გრძედი', 'долгота'],
  custodian: ['custodian', 'responsible person', 'responsible', 'პასუხისმგებელი', 'ответственный'],
  financeRef: ['finance reference', 'finance ref', 'accounting code', 'gl reference'],
  legacyAssetNumber: ['legacy asset number', 'legacy number', 'inventory number', 'inventory no', 'inv no', 'asset number', 'ინვენტარის ნომერი', 'инвентарный номер'],
};

const normalise = (t: string) => t.normalize('NFKC').toLowerCase().replace(/\(.*?\)|№|#/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * A first mapping from the file's headers: exact matches first, then a header
 * that starts with a synonym; each field and each column used once.
 */
export function suggestImportMapping(columns: string[]): Partial<Record<ImportField, string>> {
  const out: Partial<Record<ImportField, string>> = {};
  const taken = new Set<string>();
  for (const exact of [true, false]) {
    for (const field of IMPORT_FIELD_NAMES) {
      if (out[field]) continue;
      const hit = columns.find((c) => !taken.has(c) && SYNONYMS[field].some((w) => (exact ? normalise(c) === w : normalise(c).startsWith(`${w} `))));
      if (hit) { out[field] = hit; taken.add(hit); }
    }
  }
  return out;
}
