import { Prisma } from '@prisma/client';

// Money arithmetic for the IPSAS ledger (D14, Phase 2). Amounts are
// Prisma.Decimal (decimal.js) end to end, never JavaScript numbers: a ledger
// in floating point drifts by fractions of a tetri that never reconcile.
// Rounding is half-up to two places, once per entry.

export type Money = Prisma.Decimal;
export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

const PLACES = 2;
export const ZERO: Money = new Prisma.Decimal(0);

/** A Decimal from any stored or submitted amount; null and undefined are zero. */
export function money(value: MoneyInput): Money {
  if (value === null || value === undefined || value === '') return ZERO;
  const d = new Prisma.Decimal(value);
  if (!d.isFinite()) throw new RangeError(`Not a finite amount: ${String(value)}`);
  return d;
}

/** Half-up to two decimal places: 0.125 → 0.13, −0.125 → −0.13. */
export function roundMoney(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

/** Exact sum, unrounded; round the result once where it becomes an entry. */
export function sumMoney(values: Iterable<MoneyInput>): Money {
  let total = ZERO;
  for (const v of values) total = total.plus(money(v));
  return total;
}

/** The larger of two amounts, e.g. a charge that must not go below zero. */
export function maxMoney(a: MoneyInput, b: MoneyInput): Money {
  return Prisma.Decimal.max(money(a), money(b));
}

/** The smaller of two amounts, e.g. a charge capped at what is left to depreciate. */
export function minMoney(a: MoneyInput, b: MoneyInput): Money {
  return Prisma.Decimal.min(money(a), money(b));
}

/**
 * Splits `total` into `parts` rounded amounts that add up to `total` exactly:
 * every part is total ÷ parts rounded half-up, and the last takes the
 * remainder. A straight-line life is `allocate(base, lifeMonths)`, so
 * accumulated depreciation equals the depreciable base to the tetri (D14).
 */
export function allocate(total: MoneyInput, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`parts must be a whole number ≥ 1, got ${parts}`);
  const exact = roundMoney(total);
  const share = roundMoney(exact.dividedBy(parts));
  const out = Array.from({ length: parts - 1 }, () => share);
  out.push(exact.minus(share.times(parts - 1)));
  return out;
}

/** Two-decimal string for JSON, CSV and the reports service. */
export function formatMoney(value: MoneyInput): string {
  return roundMoney(value).toFixed(PLACES);
}
