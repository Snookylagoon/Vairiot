import { chargeFor, ledgerState, monthIn, unimpairedCarrying, type EngineAsset, type LedgerState, type Period } from '../depreciation/engine.js';
import { money } from '../depreciation/money.js';

// Golden figures (test plan §3.4), worked by hand: each method over a life,
// the residual floor, the last month taking the remainder (D14), and the
// start and disposal month conventions in the tenant's time zone (D15).

const TZ = 'Asia/Tbilisi';
const base: EngineAsset = {
  method: 'straight_line', recognitionStatus: 'RECOGNISED', capitalisedCost: '1000.00', residualValue: null,
  usefulLifeMonths: 84, depreciationStartDate: new Date('2026-01-15T08:00:00Z'),
};
const month = (i: number): Period => ({ year: 2026 + Math.floor(i / 12), month: (i % 12) + 1 });

/** Runs an asset month by month from January 2026, as posting would. */
function runLife(asset: EngineAsset, months: number, units?: (i: number) => string, impairAt?: { month: number; loss: string }) {
  let ledger: LedgerState = ledgerState([]);
  const charges: string[] = [];
  for (let i = 0; i < months; i++) {
    // An impairment posted into month i counts from the start of month i.
    if (impairAt && i === impairAt.month) ledger = { ...ledger, impaired: ledger.impaired.plus(impairAt.loss) };
    const r = chargeFor(asset, month(i), ledger, TZ, units?.(i));
    if (!r.ok) { charges.push(r.skip); continue; }
    charges.push(r.charge.toFixed(2));
    ledger = { ...ledger, accumulated: r.accumulated, monthsCharged: ledger.monthsCharged + 1, unitsBefore: ledger.unitsBefore.plus(units?.(i) ?? 0) };
  }
  return { charges, ledger };
}

describe('straight line', () => {
  it('GEL 1,000 over 84 months: 83 × 11.90 and 12.30 in the last month, exactly 1,000', () => {
    const { charges, ledger } = runLife(base, 86);
    expect(charges.slice(0, 83).every((c) => c === '11.90')).toBe(true);
    expect(charges[83]).toBe('12.30');
    expect(charges.slice(84)).toEqual(['fully_depreciated', 'fully_depreciated']);
    expect(ledger.accumulated.toFixed(2)).toBe('1000.00');
  });

  it('stops at the residual value', () => {
    const { charges, ledger } = runLife({ ...base, capitalisedCost: '1200', residualValue: '200', usefulLifeMonths: 10 }, 12);
    expect(charges.slice(0, 10)).toEqual(Array(10).fill('100.00'));
    expect(charges[10]).toBe('fully_depreciated');
    expect(ledger.accumulated.toFixed(2)).toBe('1000.00');
  });

  it('falls back to the cost components for assets costed before stage 2.3', () => {
    const r = chargeFor({ ...base, capitalisedCost: null, costParts: ['800', '200'], usefulLifeMonths: 10 }, month(0), ledgerState([]), TZ);
    expect(r.ok && r.charge.toFixed(2)).toBe('100.00');
  });
});

describe('reducing balance', () => {
  const rb: EngineAsset = { ...base, method: 'declining_balance', capitalisedCost: '10000', residualValue: '1000', usefulLifeMonths: 60 };

  it('doubles the straight-line rate when none is set: 40 % a year on a 5-year life', () => {
    const { charges } = runLife(rb, 2);
    expect(charges).toEqual(['333.33', '322.22']); // 10,000 × 40 % ÷ 12; 9,666.67 × 40 % ÷ 12
  });

  it('uses the asset’s own rate, and the last month of the life takes the rest to the residual', () => {
    const own = runLife({ ...rb, reducingBalanceRatePct: '24' }, 1);
    expect(own.charges).toEqual(['200.00']);
    const { charges, ledger } = runLife(rb, 61);
    expect(charges[60]).toBe('fully_depreciated');
    expect(ledger.accumulated.toFixed(2)).toBe('9000.00');
  });
});

describe('units of production', () => {
  const uop: EngineAsset = { ...base, method: 'units_of_production', capitalisedCost: '5000', expectedTotalUnits: '100000' };

  it('charges the units used: 2,500 of 100,000 units on GEL 5,000 is 125.00', () => {
    const r = chargeFor(uop, month(0), ledgerState([]), TZ, '2500');
    expect(r.ok && r.charge.toFixed(2)).toBe('125.00');
  });

  it('charges nothing without usage, and never more than is left', () => {
    expect(chargeFor(uop, month(0), ledgerState([]), TZ)).toEqual({ ok: false, skip: 'no_units' });
    const r = chargeFor(uop, month(0), ledgerState([money('4950')]), TZ, '5000');
    expect(r.ok && r.charge.toFixed(2)).toBe('50.00');
  });
});

describe('conventions', () => {
  it('reads months in the tenant’s time zone', () => {
    // 30 September 21:00 UTC is 1 October 01:00 in Tbilisi (UTC+4).
    expect(monthIn(new Date('2026-09-30T21:00:00Z'), TZ)).toEqual({ year: 2026, month: 10 });
    expect(monthIn(new Date('2026-09-30T21:00:00Z'), 'UTC')).toEqual({ year: 2026, month: 9 });
  });

  it('charges a full month in the start month and none before it', () => {
    const asset = { ...base, depreciationStartDate: new Date('2026-10-31T10:00:00Z') };
    expect(chargeFor(asset, { year: 2026, month: 9 }, ledgerState([]), TZ)).toEqual({ ok: false, skip: 'not_started' });
    const oct = chargeFor(asset, { year: 2026, month: 10 }, ledgerState([]), TZ);
    expect(oct.ok && oct.charge.toFixed(2)).toBe('11.90');
  });

  it('charges nothing in the month of disposal or after', () => {
    const asset = { ...base, disposalDate: new Date('2026-11-15T10:00:00Z') };
    expect(chargeFor(asset, { year: 2026, month: 10 }, ledgerState([]), TZ).ok).toBe(true);
    expect(chargeFor(asset, { year: 2026, month: 11 }, ledgerState([]), TZ)).toEqual({ ok: false, skip: 'disposed' });
  });

  it('depreciates only recognised assets with a method, a cost and a life', () => {
    const skip = (a: Partial<EngineAsset>) => {
      const r = chargeFor({ ...base, ...a }, month(0), ledgerState([]), TZ);
      return r.ok ? 'charged' : r.skip;
    };
    expect(skip({ recognitionStatus: 'EXPENSED' })).toBe('not_recognised');
    expect(skip({ recognitionStatus: 'PENDING_REVIEW' })).toBe('not_recognised');
    expect(skip({ method: 'none' })).toBe('no_method');
    expect(skip({ capitalisedCost: '0' })).toBe('no_cost');
    expect(skip({ usefulLifeMonths: null })).toBe('no_life');
    expect(skip({ depreciationStartDate: null })).toBe('not_started');
  });

  it('counts reversals out of the ledger state', () => {
    expect(ledgerState([money('11.90'), money('11.90')])).toMatchObject({ monthsCharged: 2 });
    expect(ledgerState([money('11.90')]).accumulated.toFixed(2)).toBe('11.90');
  });
});

describe('after an impairment (stage 2.11)', () => {
  it('straight line spreads the impaired carrying amount over the remaining life', () => {
    // GEL 1,000 over 84 months: 12 × 11.90 = 142.80, carrying 857.20; impaired by
    // 257.20 to 600.00; then each month what is left ÷ the months left, so the
    // rounding is spread: 48 × 8.33 and 24 × 8.34 over 72 months, 600.00 exactly.
    const { charges, ledger } = runLife(base, 86, undefined, { month: 12, loss: '257.20' });
    expect(charges.slice(0, 12).every((c) => c === '11.90')).toBe(true);
    const after = charges.slice(12, 84);
    expect([after.filter((c) => c === '8.33').length, after.filter((c) => c === '8.34').length]).toEqual([48, 24]);
    expect(charges[84]).toBe('fully_depreciated');
    expect(ledger.accumulated.plus(ledger.impaired).toFixed(2)).toBe('1000.00');
  });

  it('the opening carrying amount is net of the impairment', () => {
    const r = chargeFor(base, month(12), ledgerState(Array(12).fill('11.90'), ['257.20']), TZ);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect([r.openingNbv.toFixed(2), r.charge.toFixed(2), r.closingNbv.toFixed(2)]).toEqual(['600.00', '8.33', '591.67']);
  });

  it('units of production spreads what is left over the units left', () => {
    // GEL 10,000 over 100,000 units: 20,000 → 2,000; impaired by 2,000 to 6,000;
    // 16,000 of the 80,000 units left → 1,200.
    const uop: EngineAsset = { ...base, method: 'units_of_production', capitalisedCost: '10000', expectedTotalUnits: '100000' };
    const r = chargeFor(uop, month(1), ledgerState(['2000'], ['2000'], ['20000']), TZ, '16000');
    expect(r.ok && r.charge.toFixed(2)).toBe('1200.00');
  });

  it('reducing balance applies its rate to the impaired carrying amount', () => {
    const db: EngineAsset = { ...base, method: 'declining_balance', reducingBalanceRatePct: '20' };
    const r = chargeFor(db, month(0), ledgerState([], ['200']), TZ);
    expect(r.ok && r.charge.toFixed(2)).toBe('13.33'); // 800 × 20 % ÷ 12
  });

  it('stops at the residual when the impairment takes the carrying amount there', () => {
    const r = chargeFor({ ...base, residualValue: '100' }, month(1), ledgerState(['11.90'], ['888.10']), TZ);
    expect(r).toEqual({ ok: false, skip: 'fully_depreciated' });
  });

  it('a reversal back to nothing impaired returns to the original charge', () => {
    const r = chargeFor(base, month(13), ledgerState(Array(13).fill('11.90'), ['257.20', '-257.20']), TZ);
    expect(r.ok && r.charge.toFixed(2)).toBe('11.90');
  });

  it('replays the unimpaired carrying amount that caps a reversal', () => {
    const months = Array.from({ length: 24 }, (_, i) => ({ period: month(i) }));
    expect(unimpairedCarrying(base, months, TZ).toFixed(2)).toBe('714.40'); // 1,000 − 24 × 11.90
    const uop: EngineAsset = { ...base, method: 'units_of_production', capitalisedCost: '10000', expectedTotalUnits: '100000' };
    expect(unimpairedCarrying(uop, [{ period: month(0), units: '20000' }, { period: month(1), units: '16000' }], TZ).toFixed(2)).toBe('6400.00');
  });
});
