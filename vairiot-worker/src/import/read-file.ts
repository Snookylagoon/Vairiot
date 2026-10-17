import { Readable } from 'node:stream';

import ExcelJS from 'exceljs';
import type { Cell } from 'vairiot-shared';

// Reading an uploaded register (stage 2.13, D18): .xlsx or .csv through
// exceljs. The sheet with the most rows is read; the header row is the first
// of the top 20 with the most text cells, as the profiler finds it. Blank
// headers become "Column N" and repeats "Name (2)"; empty rows are skipped.

export interface ParsedFile {
  sheetName: string;
  headerRow: number;
  columns: string[];
  rows: Array<{ rowNumber: number; raw: Record<string, Cell> }>;
}

export class FileRefused extends Error {}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if ('error' in v) return null;
  }
  return String(v);
}

function headersOf(values: Cell[]): string[] {
  const seen = new Map<string, number>();
  return values.map((v, i) => {
    const base = v === null || v === undefined || String(v).trim() === '' ? `Column ${i + 1}` : String(v).trim();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export async function readRegister(buffer: Buffer, fileName: string): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xls')) throw new FileRefused('Old .xls files are not read: save it as .xlsx and upload again');
  if (lower.endsWith('.csv')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    await workbook.csv.read(Readable.from([text]), { parserOptions: { delimiter: text.split('\n')[0].includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',' } });
  } else if (lower.endsWith('.xlsx')) {
    try { await workbook.xlsx.load(buffer as unknown as ArrayBuffer); } catch { throw new FileRefused('The file could not be read as .xlsx'); }
  } else {
    throw new FileRefused('Upload an .xlsx or .csv file');
  }
  const sheet = [...workbook.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
  if (!sheet || sheet.actualRowCount === 0) throw new FileRefused('The file has no rows');

  const width = sheet.actualColumnCount || sheet.columnCount;
  const rowCells = (n: number) => Array.from({ length: width }, (_, i) => cellValue(sheet.getRow(n).getCell(i + 1).value));
  let headerRow = 1;
  let best = -1;
  for (let n = 1; n <= Math.min(20, sheet.rowCount); n++) {
    const textCells = rowCells(n).filter((c) => typeof c === 'string' && c.trim() !== '').length;
    if (textCells > best) { best = textCells; headerRow = n; }
  }
  const columns = headersOf(rowCells(headerRow));
  const rows: ParsedFile['rows'] = [];
  for (let n = headerRow + 1; n <= sheet.rowCount; n++) {
    const cells = rowCells(n);
    if (cells.every((c) => c === null || String(c).trim() === '')) continue;
    rows.push({ rowNumber: n, raw: Object.fromEntries(columns.map((h, i) => [h, cells[i] ?? null])) });
  }
  return { sheetName: sheet.name, headerRow, columns, rows };
}
