import { FAIR_VALUE_ACQUISITIONS } from '../constants/accounting.constants.js';
import { assetAccountingSchema, assetClassSchema, assetClassUpdateSchema, recognitionOverrideSchema } from '../schemas/accounting.schemas.js';

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
