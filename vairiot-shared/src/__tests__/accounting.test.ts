import { FAIR_VALUE_ACQUISITIONS } from '../constants/accounting.constants.js';
import {
  assetAccountingSchema, assetClassSchema, assetClassUpdateSchema, componentLinkSchema, componentTemplateSchema,
  instantiateTemplateSchema, parentDisposalChoice, recognitionOverrideSchema,
  accountingPeriodSchema, assetUsageBulkSchema, assetUsageSchema, reverseRunSchema,
} from '../schemas/accounting.schemas.js';

describe('accounting contracts', () => {
  const base = { code: 'SGN', name: 'Road signs', ipsasClass: 'INFRASTRUCTURE', capitalisationThreshold: '500' };

  it('accepts a class and fills the defaults', () => {
    const c = assetClassSchema.parse(base);
    expect(c).toMatchObject({ capitalisationThreshold: 500, defaultDepreciationMethod: 'straight_line', defaultResidualPct: 0, active: true, toBeConfirmed: false });
  });

  it('refuses bad codes, classes, amounts and methods', () => {
    expect(assetClassSchema.safeParse({ ...base, code: 'sgn' }).success).toBe(false);
    expect(assetClassSchema.safeParse({ ...base, ipsasClass: 'ROADS' }).success).toBe(false);
    expect(assetClassSchema.safeParse({ ...base, capitalisationThreshold: -1 }).success).toBe(false);
    expect(assetClassSchema.safeParse({ ...base, defaultDepreciationMethod: 'sum_of_digits' }).success).toBe(false);
    expect(assetClassSchema.safeParse({ ...base, defaultResidualPct: 101 }).success).toBe(false);
  });

  it('allows a partial update', () => {
    expect(assetClassUpdateSchema.parse({ capitalisationThreshold: 750 })).toEqual({ capitalisationThreshold: 750 });
  });

  it('reads asset accounting fields', () => {
    const a = assetAccountingSchema.parse({ acquisitionType: 'DONATION', fairValueAtRecognition: '800', recognitionDate: '2026-10-01' });
    expect(a.fairValueAtRecognition).toBe(800);
    expect(a.recognitionDate).toBeInstanceOf(Date);
    expect(assetAccountingSchema.safeParse({ acquisitionType: 'GIFT' }).success).toBe(false);
    expect(FAIR_VALUE_ACQUISITIONS).toEqual(['DONATION', 'TRANSFER_IN']);
  });

  it('needs a reason to override and nothing to clear', () => {
    expect(recognitionOverrideSchema.safeParse({ status: 'EXPENSED', reason: 'Minor part' }).success).toBe(true);
    expect(recognitionOverrideSchema.safeParse({ status: 'EXPENSED' }).success).toBe(false);
    expect(recognitionOverrideSchema.safeParse({ status: 'PENDING_REVIEW', reason: 'Not allowed' }).success).toBe(false);
    expect(recognitionOverrideSchema.safeParse({ status: null }).success).toBe(true);
  });
});

describe('component contracts', () => {
  const line = { role: 'controller', name: 'Controller', costSharePct: 60 };

  it('accept a template whose shares stay within 100 %', () => {
    expect(componentTemplateSchema.parse({ code: 'JUNCTION', name: 'Junction', lines: [line, { ...line, costSharePct: 40 }] }).active).toBe(true);
    expect(componentTemplateSchema.safeParse({ code: 'JUNCTION', name: 'Junction', lines: [line, line] }).success).toBe(false);
    expect(componentTemplateSchema.safeParse({ code: 'JUNCTION', name: 'Junction', lines: [] }).success).toBe(false);
  });

  it('read an instantiation, a link and a disposal choice', () => {
    expect(instantiateTemplateSchema.parse({ name: 'J1', totalCost: '20000' }).totalCost).toBe(20000);
    expect(componentLinkSchema.parse({ parentAssetId: null })).toEqual({ parentAssetId: null });
    expect(componentLinkSchema.safeParse({ parentAssetId: 'p', componentRole: '' }).success).toBe(false);
    expect(parentDisposalChoice.safeParse('detach').success).toBe(true);
    expect(parentDisposalChoice.safeParse('sell').success).toBe(false);
  });
});

describe('period and run contracts', () => {
  it('read a period, usage and a reversal note', () => {
    expect(accountingPeriodSchema.parse({ year: '2026', month: '10' })).toEqual({ year: 2026, month: 10 });
    expect(accountingPeriodSchema.safeParse({ year: 2026, month: 13 }).success).toBe(false);
    expect(assetUsageSchema.parse({ units: '2500' }).units).toBe(2500);
    expect(assetUsageSchema.safeParse({ units: -1 }).success).toBe(false);
    expect(assetUsageBulkSchema.parse({ rows: [{ assetId: 'a1', units: '12.5' }] }).rows[0].units).toBe(12.5);
    expect(assetUsageBulkSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(assetUsageBulkSchema.safeParse({ rows: [{ assetId: 'a1', units: -3 }] }).success).toBe(false);
    expect(reverseRunSchema.parse({})).toEqual({});
  });
});
