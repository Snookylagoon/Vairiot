import { importMappingSchema, mappingFromProfile, suggestImportMapping } from '../import/fields.js';
import { mapRow, parseDate, parseDecimal } from '../import/parse.js';

// Stage 2.13: reading register rows for the staged import.

describe('parseDecimal', () => {
  it('reads either separator, spaces and currency marks', () => {
    expect(parseDecimal('1,234.50')).toBe(1234.5);
    expect(parseDecimal('1 234,50', ',')).toBe(1234.5);
    expect(parseDecimal('1.234,50 ₾', ',')).toBe(1234.5);
    expect(parseDecimal(99)).toBe(99);
    expect(parseDecimal('-12')).toBe(-12);
    expect(parseDecimal('n/a')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
    expect(parseDecimal(Number.NaN)).toBeNull();
    expect(parseDecimal(true)).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads Excel dates, ISO text and text in the given order', () => {
    expect(parseDate(new Date('2024-03-05T00:00:00Z'))).toBe('2024-03-05');
    expect(parseDate('2024-03-05')).toBe('2024-03-05');
    expect(parseDate('05.03.2024')).toBe('2024-03-05');
    expect(parseDate('03/05/2024', 'MDY')).toBe('2024-03-05');
    expect(parseDate('2024/03/05', 'YMD')).toBe('2024-03-05');
    expect(parseDate('05.03.24')).toBe('2024-03-05');
    expect(parseDate('05.03.99')).toBe('1999-03-05');
  });

  it('refuses dates that do not exist and text that is not a date', () => {
    expect(parseDate('31.02.2024')).toBeNull();
    expect(parseDate('soon')).toBeNull();
    expect(parseDate(45000)).toBeNull();
    expect(parseDate(new Date('x'))).toBeNull();
  });
});

describe('mapRow', () => {
  const mapping = importMappingSchema.parse({
    fields: { name: 'Name', purchaseCost: 'Cost', purchaseDate: 'Bought', usefulLifeMonths: 'Life', classCode: 'Class', financeRef: 'Ref' },
    transforms: { decimalSeparator: ',', lookups: { classCode: { Signs: 'SGN' } } },
  });

  it('types the mapped cells and applies lookup tables', () => {
    const r = mapRow({ Name: ' Sign ', Cost: '1 000,00', Bought: '10.08.2026', Life: '84', Class: 'Signs', Ref: 7001, Other: 'x' }, mapping);
    expect(r).toEqual({ values: { name: 'Sign', purchaseCost: 1000, purchaseDate: '2026-08-10', usefulLifeMonths: 84, classCode: 'SGN', financeRef: '7001' }, messages: [] });
  });

  it('reports what cannot be read and leaves empty cells out', () => {
    const r = mapRow({ Name: 'Sign', Cost: 'lots', Bought: 'soon', Life: '7,5', Class: '' }, mapping);
    expect(r.values).toEqual({ name: 'Sign' });
    expect(r.messages.map((m) => m.field)).toEqual(['purchaseCost', 'purchaseDate', 'usefulLifeMonths']);
    expect(r.messages[2].message).toMatch(/whole number/);
  });
});

describe('mapping contracts', () => {
  it('defaults the transforms and refuses unknown fields', () => {
    expect(importMappingSchema.parse({ fields: { name: 'A' } }).transforms).toEqual({ dateFormat: 'DMY', decimalSeparator: '.', lookups: {} });
    expect(importMappingSchema.safeParse({ fields: { colour: 'A' } }).success).toBe(false);
  });

  it('starts from the profiler’s suggestion', () => {
    const m = mappingFromProfile({
      mappings: [
        { column: 'Наименование', field: 'name', importable: true }, { column: 'Inv No', field: 'legacyAssetNumber', importable: false },
        { column: 'Room', field: 'locationName', importable: false }, { column: '???', field: null, importable: false },
      ],
    });
    expect(m.fields).toEqual({ name: 'Наименование', legacyAssetNumber: 'Inv No' });
    expect(() => mappingFromProfile({ nope: 1 })).toThrow();
  });
});

describe('suggestImportMapping', () => {
  it('maps the register export’s own headers, and common names in three languages', () => {
    expect(suggestImportMapping(['Asset Number', 'Name', 'Condition Grade', 'Asset Class', 'Finance Reference', 'Latitude', 'Longitude', 'Created'])).toEqual({
      name: 'Name', conditionGrade: 'Condition Grade', classCode: 'Asset Class', financeRef: 'Finance Reference', latitude: 'Latitude', longitude: 'Longitude', legacyAssetNumber: 'Asset Number',
    });
    expect(suggestImportMapping(['დასახელება', 'Стоимость', 'Inv. No', 'Cost (GEL)'])).toEqual({ name: 'დასახელება', purchaseCost: 'Стоимость', legacyAssetNumber: 'Inv. No' });
  });

  it('falls back to a header that starts with a synonym, using each column once', () => {
    expect(suggestImportMapping(['Purchase cost GEL', 'Site name', 'Site'])).toEqual({ purchaseCost: 'Purchase cost GEL', siteName: 'Site' });
  });
});
