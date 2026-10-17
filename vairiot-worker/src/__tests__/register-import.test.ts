import type { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { importMappingSchema } from 'vairiot-shared';

import { FileRefused, readRegister } from '../import/read-file';
import { checkRow, processRegisterImport, type ImportDeps } from '../import/register-import';

// The worker's side of a staged import (stage 2.13): reading files and
// checking rows. The API's tests run the whole flow against the database.

async function xlsx(rows: unknown[][], sheets = 1): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (let s = 1; s < sheets; s++) wb.addWorksheet(`Notes ${s}`).addRow(['notes']);
  const ws = wb.addWorksheet('Register');
  for (const r of rows) ws.addRow(r);
  ws.getCell('A5').value = { richText: [{ text: 'Rich ' }, { text: 'text' }] };
  ws.getCell('B5').value = { formula: '1+1', result: 2 };
  ws.getCell('C5').value = { text: 'link', hyperlink: 'https://example.org' };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('readRegister', () => {
  it('reads the largest sheet, finds the header row and names blank and repeated headers', async () => {
    const f = await readRegister(await xlsx([['Register 2026'], ['Name', '', 'Name', 'Bought'], ['Desk', 'x', 'y', new Date('2026-01-02T00:00:00Z')], []], 2), 'r.xlsx');
    expect(f).toMatchObject({ sheetName: 'Register', headerRow: 2, columns: ['Name', 'Column 2', 'Name (2)', 'Bought'] });
    expect(f.rows[0]).toEqual({ rowNumber: 3, raw: { Name: 'Desk', 'Column 2': 'x', 'Name (2)': 'y', Bought: new Date('2026-01-02T00:00:00Z') } });
    expect(f.rows[1]).toEqual({ rowNumber: 5, raw: { Name: 'Rich text', 'Column 2': 2, 'Name (2)': 'link', Bought: null } });
  });

  it('reads comma and semicolon CSV with a byte-order mark', async () => {
    expect((await readRegister(Buffer.from('﻿Name,Cost\nDesk,10\n'), 'r.csv')).rows[0].raw).toEqual({ Name: 'Desk', Cost: 10 });
    expect((await readRegister(Buffer.from('Name;Cost\nDesk;10,5\n'), 'r.CSV')).columns).toEqual(['Name', 'Cost']);
  });

  it('refuses .xls, other types, unreadable and empty files', async () => {
    await expect(readRegister(Buffer.from('x'), 'r.xls')).rejects.toThrow(/save it as .xlsx/);
    await expect(readRegister(Buffer.from('x'), 'r.txt')).rejects.toThrow(FileRefused);
    await expect(readRegister(Buffer.from('x'), 'r.xlsx')).rejects.toThrow('could not be read');
    const empty = new ExcelJS.Workbook(); empty.addWorksheet('Empty');
    await expect(readRegister(Buffer.from(await empty.xlsx.writeBuffer()), 'r.xlsx')).rejects.toThrow('no rows');
  });
});

describe('checkRow', () => {
  const mapping = importMappingSchema.parse({ fields: { name: 'N', financeRef: 'R', serialNumber: 'S', classCode: 'C', purchaseCost: 'P', condition: 'K', status: 'T', usefulLifeMonths: 'L', categoryName: 'G', legacyAssetNumber: 'I' } });
  const l = {
    ipsas: true, classes: new Map([['SGN', { id: 'c1', code: 'SGN', capitalisationThreshold: '500' as never }]]), sites: new Map(), categories: new Map([['signs', 'g1']]),
    byRef: new Map([['F-OLD', ['a1']], ['F-TWICE', ['a2', 'a3']]]), serials: new Set(['s-old']),
  };
  const seen = () => ({ financeRef: new Map(), serialNumber: new Map(), legacyAssetNumber: new Map() });

  it('accepts a clean row and resolves its lookups', () => {
    const r = checkRow({ N: 'Sign', C: 'sgn', P: 600, G: 'Signs', K: 'Good', T: 'Active', L: 84 }, mapping, 'CREATE', l, seen(), 2);
    expect(r).toMatchObject({ status: 'VALID', refs: { assetClassId: 'c1', categoryId: 'g1' } });
  });

  it('warns below the threshold and on a serial already on the register', () => {
    const r = checkRow({ N: 'Sign', C: 'SGN', P: 100, S: 'S-OLD' }, mapping, 'CREATE', l, seen(), 2);
    expect(r.status).toBe('WARNING');
    expect(r.messages.map((m) => m.field)).toEqual(['serialNumber', 'purchaseCost']);
  });

  it('refuses unknown values, a finance reference already used and repeats in the file', () => {
    const s = seen();
    checkRow({ N: 'A', I: 'INV-1', S: 'S1' }, mapping, 'CREATE', l, s, 2);
    const r = checkRow({ N: 'B', I: 'inv-1', S: 's1', R: 'F-OLD', G: 'Lamps', K: 'Shiny', T: 'Lost', L: 0 }, mapping, 'CREATE', l, s, 3);
    expect(r.status).toBe('ERROR');
    expect(r.messages.map((m) => m.message)).toEqual([
      'An asset with finance reference F-OLD is already on the register: import it in update mode',
      'Same serial number as row 2', 'Same legacy asset number as row 2',
      'Unknown category Lamps', 'Unknown condition Shiny', 'Unknown status Lost', 'The useful life must be 1 to 1,200 months',
    ]);
  });

  it('in update mode, needs exactly one asset with the finance reference', () => {
    expect(checkRow({ R: 'F-OLD' }, mapping, 'UPDATE', l, seen(), 2)).toMatchObject({ status: 'VALID', refs: { assetId: 'a1' } });
    expect(checkRow({ R: 'F-TWICE' }, mapping, 'UPDATE', l, seen(), 2).messages[0].message).toBe('2 assets have finance reference F-TWICE');
    expect(checkRow({ N: 'x' }, mapping, 'UPDATE', l, seen(), 2).messages[0].message).toMatch(/required in update mode/);
  });

  it('ignores the class, with a warning, when the organisation does not use classes', () => {
    expect(checkRow({ N: 'A', C: 'SGN' }, mapping, 'CREATE', { ...l, ipsas: false }, seen(), 2).messages[0].message).toMatch(/not used/);
  });
});

describe('processRegisterImport', () => {
  const fake = (batch: Record<string, unknown> | null) => {
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      importBatch: { findFirst: jest.fn().mockResolvedValue(batch), update: jest.fn(async ({ data }) => { updates.push(data); }) },
      importRow: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const deps: ImportDeps = { db: db as unknown as PrismaClient, readObject: jest.fn(), api: { commitStart: jest.fn(), commitChunk: jest.fn() } };
    return { deps, updates };
  };

  it('skips a batch that is not at the step asked for', async () => {
    const { deps, updates } = fake({ id: 'b', status: 'PARSED' });
    await processRegisterImport(deps, { tenantId: 't', batchId: 'b', step: 'parse' });
    expect(updates).toEqual([]);
  });

  it('records a mapping that names no column as FAILED', async () => {
    const { deps, updates } = fake({ id: 'b', status: 'VALIDATING', mode: 'CREATE', columns: ['Name'], mapping: { fields: { name: 'Nom' } } });
    await processRegisterImport(deps, { tenantId: 't', batchId: 'b', step: 'validate' });
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED', jobError: 'The file has no column "Nom"' });
  });

  it('rethrows an unexpected error after recording it', async () => {
    const { deps, updates } = fake({ id: 'b', status: 'PARSING', storageKey: 'k', fileName: 'r.xlsx' });
    (deps.readObject as jest.Mock).mockRejectedValue(new Error('storage down'));
    await expect(processRegisterImport(deps, { tenantId: 't', batchId: 'b', step: 'parse' })).rejects.toThrow('storage down');
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED', jobError: 'storage down' });
  });
});
