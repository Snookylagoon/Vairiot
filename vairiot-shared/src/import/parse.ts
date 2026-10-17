import { IMPORT_FIELDS, LOOKUP_FIELDS, type ImportField, type ImportMapping } from './fields.js';

// Reading one row against a mapping (stage 2.13): cells to typed values, with
// a message for each value that cannot be read. Pure, so the worker validates
// with it and the tests can exercise it without a file.

export type Cell = string | number | boolean | Date | null | undefined;
export interface RowMessage { level: 'error' | 'warning'; field?: ImportField; message: string }
export type MappedValue = string | number;

/** Text as a decimal with the given separator ("1 234,50" → 1234.5); null when it is not one. */
export function parseDecimal(value: Cell, separator: '.' | ',' = '.'): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let t = value.trim().replace(/[\s\u00a0']/g, '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  t = separator === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
};

/** A cell as an ISO date (YYYY-MM-DD): an Excel date, ISO text, or text in the given order. */
export function parseDate(value: Cell, order: 'DMY' | 'MDY' | 'YMD' = 'DMY'): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value !== 'string') return null;
  const t = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (isoMatch) return iso(+isoMatch[1], +isoMatch[2], +isoMatch[3]);
  const parts = t.split(/[./\-\s]+/).map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isInteger(p))) return null;
  const [a, b] = parts;
  let c = parts[2];
  if (order === 'YMD') return iso(a, b, c);
  if (c < 100) c += c < 50 ? 2000 : 1900;
  return order === 'DMY' ? iso(c, b, a) : iso(c, a, b);
}

const text = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? '' : String(v).trim());

/**
 * The row's mapped values and what could not be read. `raw` is keyed by the
 * file's headers. Empty cells are left out; lookup tables are applied first.
 */
export function mapRow(raw: Record<string, Cell>, mapping: ImportMapping): { values: Partial<Record<ImportField, MappedValue>>; messages: RowMessage[] } {
  const values: Partial<Record<ImportField, MappedValue>> = {};
  const messages: RowMessage[] = [];
  const { dateFormat, decimalSeparator, lookups } = mapping.transforms;
  for (const [field, column] of Object.entries(mapping.fields) as Array<[ImportField, string]>) {
    const cell = raw[column];
    if (text(cell) === '') continue;
    const type = IMPORT_FIELDS[field];
    if (type === 'text') {
      const s = text(cell);
      const table = (LOOKUP_FIELDS as readonly string[]).includes(field) ? lookups[field as (typeof LOOKUP_FIELDS)[number]] : undefined;
      values[field] = table?.[s] ?? s;
    } else if (type === 'date') {
      const d = parseDate(cell, dateFormat);
      if (d) values[field] = d; else messages.push({ level: 'error', field, message: `${column}: "${text(cell)}" is not a date` });
    } else {
      const n = parseDecimal(cell, decimalSeparator);
      if (n === null) messages.push({ level: 'error', field, message: `${column}: "${text(cell)}" is not a number` });
      else if (type === 'integer' && !Number.isInteger(n)) messages.push({ level: 'error', field, message: `${column}: "${text(cell)}" is not a whole number` });
      else values[field] = n;
    }
  }
  return { values, messages };
}
