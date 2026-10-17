import { isBlank, maxMoney, minMoney, money, roundMoney, sumMoney, ZERO, type Money, type MoneyInput } from './money.js';

// The depreciation engine (Phase 2, S2.3): one asset's charge for one month,
// from what the ledger has already posted. Pure: no database, no clock. In
// vairiot-shared since stage 2.10, so the worker that runs depreciation and
// the API that checks requests use the same rules.
//
// Conventions (Phase 2 plan §2.2, D14, D15):
// - monthly periods in the tenant's time zone; a full month's charge in the
//   month of `depreciationStartDate`, none in the month of disposal or after;
// - only RECOGNISED assets depreciate (EXPENSED and PENDING_REVIEW do not);
// - each charge is rounded half-up to 2 places and never takes the carrying
//   amount below the residual value; the last month of a life takes whatever
//   is left, so a life's charges add up to the depreciable base exactly;
// - a posted impairment (S2.4, stage 2.11) lowers the carrying amount from the
//   start of the period it is posted into; straight line and units of production then spread what
//   is left above the residual over the remaining months or units.

export type Method = 'straight_line' | 'declining_balance' | 'units_of_production';

export interface EngineAsset {
  method: string | null;
  recognitionStatus: string | null;
  capitalisedCost: MoneyInput;
  /** Used when capitalisedCost is empty (assets costed before stage 2.3). */
  costParts?: MoneyInput[];
  residualValue: MoneyInput;
  usefulLifeMonths: number | null;
  depreciationStartDate: Date | null;
  disposalDate?: Date | null;
  reducingBalanceRatePct?: MoneyInput;
  expectedTotalUnits?: MoneyInput;
}

/** What the ledger already holds for the asset: posted charges, net of reversals. */
export interface LedgerState {
  accumulated: Money;
  monthsCharged: number;
  /** Net impairment posted up to this period (losses less reversals). */
  impaired: Money;
  /** Units used in earlier periods, for units of production after an impairment. */
  unitsBefore: Money;
}

export interface Period { year: number; month: number }

export type Skip = 'not_recognised' | 'no_method' | 'no_cost' | 'not_started' | 'disposed' | 'no_life' | 'no_units' | 'fully_depreciated';

export type Charge =
  | { ok: true; method: Method; openingNbv: Money; charge: Money; closingNbv: Money; accumulated: Money }
  | { ok: false; skip: Skip };

/** Year and month of an instant as seen in a time zone. */
export function monthIn(date: Date, timeZone: string): Period {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  return { year: Number(parts.find((p) => p.type === 'year')!.value), month: Number(parts.find((p) => p.type === 'month')!.value) };
}

const index = (p: Period) => p.year * 12 + (p.month - 1);

export function costOf(asset: Pick<EngineAsset, 'capitalisedCost' | 'costParts'>): Money {
  if (!isBlank(asset.capitalisedCost)) return money(asset.capitalisedCost);
  return sumMoney(asset.costParts ?? []);
}

/** The annual reducing-balance rate in %: the asset's own, else double the straight-line rate. */
export function reducingRatePct(asset: Pick<EngineAsset, 'reducingBalanceRatePct' | 'usefulLifeMonths'>): Money | null {
  if (!isBlank(asset.reducingBalanceRatePct)) return money(asset.reducingBalanceRatePct);
  return asset.usefulLifeMonths ? money(200).times(12).dividedBy(asset.usefulLifeMonths) : null;
}

/**
 * The charge for `period`. `units` is the asset's usage that month, for
 * units of production. Returns why there is none, when there is none.
 */
export function chargeFor(asset: EngineAsset, period: Period, ledger: LedgerState, timeZone: string, units?: MoneyInput): Charge {
  if (asset.recognitionStatus !== 'RECOGNISED') return { ok: false, skip: 'not_recognised' };
  const method = asset.method ?? 'straight_line';
  if (method === 'none' || !['straight_line', 'declining_balance', 'units_of_production'].includes(method)) return { ok: false, skip: 'no_method' };
  const cost = costOf(asset);
  if (!cost.greaterThan(0)) return { ok: false, skip: 'no_cost' };
  if (!asset.depreciationStartDate || index(monthIn(asset.depreciationStartDate, timeZone)) > index(period)) return { ok: false, skip: 'not_started' };
  if (asset.disposalDate && index(monthIn(asset.disposalDate, timeZone)) <= index(period)) return { ok: false, skip: 'disposed' };

  const residual = maxMoney(asset.residualValue, ZERO);
  const opening = cost.minus(ledger.accumulated).minus(ledger.impaired);
  const remaining = opening.minus(residual);
  if (!remaining.greaterThan(0)) return { ok: false, skip: 'fully_depreciated' };
  const lastMonth = asset.usefulLifeMonths !== null && ledger.monthsCharged + 1 >= asset.usefulLifeMonths;
  const impaired = !ledger.impaired.isZero();

  let charge: Money;
  if (method === 'straight_line') {
    if (!asset.usefulLifeMonths) return { ok: false, skip: 'no_life' };
    charge = lastMonth ? remaining
      : impaired ? roundMoney(remaining.dividedBy(asset.usefulLifeMonths - ledger.monthsCharged))
        : roundMoney(cost.minus(residual).dividedBy(asset.usefulLifeMonths));
  } else if (method === 'declining_balance') {
    const rate = reducingRatePct(asset);
    if (!rate) return { ok: false, skip: 'no_life' };
    charge = lastMonth ? remaining : roundMoney(opening.times(rate).dividedBy(100).dividedBy(12));
  } else {
    const expected = asset.expectedTotalUnits;
    if (isBlank(expected) || !money(expected).greaterThan(0) || !money(units ?? 0).greaterThan(0)) {
      return { ok: false, skip: 'no_units' };
    }
    const unitsLeft = money(expected).minus(ledger.unitsBefore);
    charge = !impaired ? roundMoney(cost.minus(residual).times(money(units)).dividedBy(money(expected)))
      : unitsLeft.greaterThan(0) ? roundMoney(remaining.times(money(units)).dividedBy(unitsLeft)) : remaining;
  }
  charge = minMoney(charge, remaining);
  if (!charge.greaterThan(0)) return { ok: false, skip: 'fully_depreciated' };
  return {
    ok: true, method: method as Method, openingNbv: opening, charge,
    closingNbv: opening.minus(charge), accumulated: ledger.accumulated.plus(charge),
  };
}

/**
 * Ledger state from posted entries' charges (reversals already excluded by
 * the caller), net posted impairment from earlier periods, and earlier usage.
 */
export function ledgerState(charges: MoneyInput[], impairments: MoneyInput[] = [], unitsBefore: MoneyInput[] = []): LedgerState {
  return {
    accumulated: sumMoney(charges), monthsCharged: charges.filter((c) => money(c).greaterThan(0)).length,
    impaired: sumMoney(impairments), unitsBefore: sumMoney(unitsBefore),
  };
}

/**
 * The carrying amount the asset would have had with no impairment (IPSAS 21.68,
 * 26.106): its charges replayed over the months it was charged, each with
 * that month's usage. A reversal of impairment may not take the carrying
 * amount above it.
 */
export function unimpairedCarrying(asset: EngineAsset, months: Array<{ period: Period; units?: MoneyInput }>, timeZone: string): Money {
  const charges: Money[] = [];
  const units: MoneyInput[] = [];
  for (const m of months) {
    const c = chargeFor(asset, m.period, ledgerState(charges, [], units), timeZone, m.units);
    if (c.ok) charges.push(c.charge);
    if (!isBlank(m.units)) units.push(m.units);
  }
  return costOf(asset).minus(sumMoney(charges));
}
