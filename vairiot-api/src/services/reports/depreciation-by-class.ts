import { sumMoney, ZERO, type Money } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { callReportService, getCompanyInfo, getTenantName, serializeRows } from '../report-export.service';

// Depreciation by asset class (Phase 2, S2.3 step 7): for one posted period,
// each class's charge that month, its accumulated depreciation to the end of
// it and its carrying amount. From posted entries only; reversed runs and
// their reversals do not count. Defaults to the latest posted period. The
// carrying amount is net of impairment posted up to the period (stage 2.11).

export interface DepreciationByClassFilters { year?: string | number; month?: string | number }

export async function depreciationByClass(tenantId: string, filters: DepreciationByClassFilters = {}) {
  const effective = { status: 'POSTED' as const, reversalOfRunId: null };
  const period = filters.year && filters.month
    ? await prisma.accountingPeriod.findUnique({ where: { tenantId_year_month: { tenantId, year: Number(filters.year), month: Number(filters.month) } } })
    : (await prisma.depreciationRun.findFirst({ where: { tenantId, ...effective }, orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }], include: { period: true } }))?.period ?? null;
  if (!period) return { period: null, rows: [], totals: { assetCount: 0, periodCharge: '0.00', accumulated: '0.00', impaired: '0.00', cost: '0.00', carryingAmount: '0.00' } };

  const upTo = { OR: [{ year: { lt: period.year } }, { year: period.year, month: { lte: period.month } }] };
  const impairments = await prisma.impairment.findMany({ where: { tenantId, status: { in: ['POSTED', 'REVERSED'] }, period: upTo }, select: { assetId: true, loss: true } });
  const impairedBy = new Map<string, Money>();
  for (const i of impairments) impairedBy.set(i.assetId, (impairedBy.get(i.assetId) ?? ZERO).plus(i.loss ?? 0));
  const entries = await prisma.depreciationEntry.findMany({
    where: { tenantId, run: effective, period: upTo },
    select: {
      assetId: true, charge: true, periodId: true,
      asset: { select: { capitalisedCost: true, assetClass: { select: { code: true, name: true } } } },
    },
  });
  const classes = new Map<string, { name: string; assets: Map<string, Money>; inPeriod: Set<string>; charge: Money; accumulated: Money }>();
  for (const e of entries) {
    const code = e.asset.assetClass?.code ?? '—';
    const c = classes.get(code) ?? { name: e.asset.assetClass?.name ?? 'No class', assets: new Map(), inPeriod: new Set(), charge: ZERO, accumulated: ZERO };
    c.assets.set(e.assetId, sumMoney([e.asset.capitalisedCost]));
    c.accumulated = c.accumulated.plus(e.charge);
    if (e.periodId === period.id) { c.charge = c.charge.plus(e.charge); c.inPeriod.add(e.assetId); }
    classes.set(code, c);
  }
  const rows = [...classes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([classCode, c]) => {
    const cost = sumMoney(c.assets.values());
    const impaired = sumMoney([...c.assets.keys()].map((id) => impairedBy.get(id) ?? ZERO));
    return {
      classCode, className: c.name, assetCount: c.inPeriod.size,
      periodCharge: c.charge.toFixed(2), accumulated: c.accumulated.toFixed(2), impaired: impaired.toFixed(2),
      cost: cost.toFixed(2), carryingAmount: cost.minus(c.accumulated).minus(impaired).toFixed(2),
    };
  });
  const total = (k: 'periodCharge' | 'accumulated' | 'impaired' | 'cost' | 'carryingAmount') => sumMoney(rows.map((r) => r[k])).toFixed(2);
  return {
    period: { year: period.year, month: period.month },
    rows,
    totals: { assetCount: rows.reduce((t, r) => t + r.assetCount, 0), periodCharge: total('periodCharge'), accumulated: total('accumulated'), impaired: total('impaired'), cost: total('cost'), carryingAmount: total('carryingAmount') },
  };
}

export async function exportDepreciationByClass(tenantId: string, opts: { format: string; filters?: Record<string, string> }): Promise<Buffer> {
  const result = await depreciationByClass(tenantId, opts.filters ?? {});
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);
  const label = result.period ? `${result.period.year}-${String(result.period.month).padStart(2, '0')}` : 'no posted period';
  return callReportService(tenantId, {
    report_type: 'depreciation-by-class',
    format: opts.format,
    rows: serializeRows(result.rows.map((r) => ({ ...r, periodCharge: Number(r.periodCharge), accumulated: Number(r.accumulated), impaired: Number(r.impaired), cost: Number(r.cost), carryingAmount: Number(r.carryingAmount) }))),
    totals: { count: result.rows.length, ...Object.fromEntries(Object.entries(result.totals).map(([k, v]) => [k, Number(v)])) },
    summary: { period: label, totalCharge: Number(result.totals.periodCharge), totalCarrying: Number(result.totals.carryingAmount) },
    filters: { ...(opts.filters ?? {}), period: label },
    company,
    tenant_name: tenantName,
  });
}
