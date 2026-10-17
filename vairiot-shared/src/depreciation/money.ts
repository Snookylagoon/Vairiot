import { Decimal } from 'decimal.js';

// Decimal money for the depreciation engine (D14), shared by the API and the
// worker. decimal.js is the library Prisma.Decimal is built on; a Prisma
// Decimal is read through its string form, so either can be passed in.

export type Money = Decimal;
export type MoneyInput = Decimal | { toString(): string } | number | string | null | undefined;

export const ZERO: Money = new Decimal(0);

/** A Decimal from any stored or submitted amount; null, undefined and '' are zero. */
export function money(value: MoneyInput): Money {
  if (value === null || value === undefined || value === '') return ZERO;
  const d = new Decimal(typeof value === 'object' ? value.toString() : value);
  if (!d.isFinite()) throw new RangeError(`Not a finite amount: ${String(value)}`);
  return d;
}

export const isBlank = (value: MoneyInput) => value === null || value === undefined || value === '';

/** Half-up to two places: 0.125 → 0.13. */
export function roundMoney(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: Iterable<MoneyInput>): Money {
  let total = ZERO;
  for (const v of values) total = total.plus(money(v));
  return total;
}

export const maxMoney = (a: MoneyInput, b: MoneyInput): Money => Decimal.max(money(a), money(b));
export const minMoney = (a: MoneyInput, b: MoneyInput): Money => Decimal.min(money(a), money(b));
