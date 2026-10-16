import { Prisma } from '@prisma/client';

import { allocate, formatMoney, maxMoney, minMoney, money, roundMoney, sumMoney, ZERO } from '../../lib/money';

// D14: ledger arithmetic in decimals, half-up to two places per entry, and the
// last share of a split takes the remainder.

describe('money', () => {
  it('reads stored and submitted amounts, null as zero', () => {
    expect(money(null).equals(ZERO)).toBe(true);
    expect(money('').equals(ZERO)).toBe(true);
    expect(money('1234.50').toFixed(2)).toBe('1234.50');
    expect(money(new Prisma.Decimal('7.1')).toFixed(1)).toBe('7.1');
    expect(() => money(Number.NaN)).toThrow(RangeError);
    expect(() => money(Infinity)).toThrow(RangeError);
  });

  it('rounds half-up, away from zero on a tie', () => {
    expect(formatMoney('0.125')).toBe('0.13');
    expect(formatMoney('0.124999')).toBe('0.12');
    expect(formatMoney('-0.125')).toBe('-0.13');
    expect(formatMoney('2.675')).toBe('2.68');   // 2.67 in binary floating point
    expect(roundMoney(1.005).toFixed(2)).toBe('1.01');
  });

  it('adds exactly where floating point drifts', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2]).equals(money('0.3'))).toBe(true);
    expect(sumMoney(Array.from({ length: 1000 }, () => '0.01')).toFixed(2)).toBe('10.00');
  });

  it('caps and floors', () => {
    expect(maxMoney('-5', 0).equals(ZERO)).toBe(true);
    expect(minMoney('120.00', '99.99').toFixed(2)).toBe('99.99');
  });
});

describe('allocate', () => {
  it('splits a depreciable base over a life to the tetri', () => {
    // GEL 1,000 over 84 months (a road sign): 83 × 11.90 and 12.30 last.
    const months = allocate('1000.00', 84);
    expect(months).toHaveLength(84);
    expect(months[0].toFixed(2)).toBe('11.90');
    expect(months[83].toFixed(2)).toBe('12.30');
    expect(sumMoney(months).toFixed(2)).toBe('1000.00');
  });

  it('gives the remainder to the last part, which may be smaller', () => {
    const parts = allocate('100.00', 3);
    expect(parts.map((p) => p.toFixed(2))).toEqual(['33.33', '33.33', '33.34']);
    const down = allocate('0.05', 3);
    expect(down.map((p) => p.toFixed(2))).toEqual(['0.02', '0.02', '0.01']);
    expect(sumMoney(down).toFixed(2)).toBe('0.05');
  });

  it('keeps every split exact across many sizes', () => {
    for (const total of ['0.01', '9.99', '1234.56', '987654.32']) {
      for (const n of [1, 7, 12, 60, 120, 240]) {
        expect(sumMoney(allocate(total, n)).toFixed(2)).toBe(roundMoney(total).toFixed(2));
      }
    }
  });

  it('refuses a split into no parts', () => {
    expect(() => allocate('10', 0)).toThrow(RangeError);
    expect(() => allocate('10', 1.5)).toThrow(RangeError);
  });
});
