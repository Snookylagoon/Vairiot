// Minimal RFC-4180 CSV serialiser — no deps. Handles commas, quotes, newlines.
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T; header: string }[]): string {
  const head = columns.map(c => cell(c.header)).join(',');
  const body = rows.map(r => columns.map(c => cell(r[c.key])).join(',')).join('\r\n');
  return head + '\r\n' + body + (body ? '\r\n' : '');
}
