import { sumMoney } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { callReportService, getCompanyInfo, getTenantName, serializeRows, type ExportOpts } from '../report-export.service';

// The impairment register (Phase 2, S2.4 step 5, stage 2.12): every posted
// impairment, reversal of one and correction, in posting order, with the
// carrying amount it was measured against, the recoverable amount, the loss
// (negative for a reversal or a correction of a loss) and who posted it.
// Optionally one period (`year` and `month`) or one asset class.

export interface ImpairmentRegisterFilters { year?: string | number; month?: string | number; classCode?: string }

const label = (p: { year: number; month: number } | null) => (p ? `${p.year}-${String(p.month).padStart(2, '0')}` : '');

export async function impairmentRegister(tenantId: string, filters: ImpairmentRegisterFilters = {}) {
  const records = await prisma.impairment.findMany({
    where: {
      tenantId, status: { in: ['POSTED', 'REVERSED'] },
      ...(filters.year && filters.month && { period: { year: Number(filters.year), month: Number(filters.month) } }),
      ...(filters.classCode && { asset: { assetClass: { code: filters.classCode } } }),
    },
    include: {
      asset: { select: { assetNumber: true, name: true, assetClass: { select: { code: true } } } },
      period: { select: { year: true, month: true } },
    },
    orderBy: [{ period: { year: 'asc' } }, { period: { month: 'asc' } }, { postedAt: 'asc' }],
  });
  const ids = [...new Set(records.flatMap((r) => [r.postedBy, r.assessedBy]).filter((x): x is string => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, email: true } }))
    .map((u) => [u.id, u.name ?? u.email]));
  const rows = records.map((r) => ({
    id: r.id,
    period: label(r.period),
    assetNumber: r.asset.assetNumber,
    assetName: r.asset.name,
    classCode: r.asset.assetClass?.code ?? '',
    kind: r.correctionOfId ? 'CORRECTION' : r.kind,
    status: r.status,
    indicator: r.indicator,
    standard: r.standard ?? '',
    method: r.method ?? '',
    carryingAmount: r.carryingAmount?.toFixed(2) ?? '',
    recoverableAmount: r.recoverableAmount?.toFixed(2) ?? '',
    loss: r.loss?.toFixed(2) ?? '0.00',
    assessedBy: r.assessedBy ? users.get(r.assessedBy) ?? '' : '',
    postedBy: r.postedBy ? users.get(r.postedBy) ?? '' : '',
  }));
  const losses = sumMoney(rows.filter((r) => Number(r.loss) > 0).map((r) => r.loss));
  const reversals = sumMoney(rows.filter((r) => Number(r.loss) < 0).map((r) => r.loss));
  return { rows, totals: { count: rows.length, losses: losses.toFixed(2), reversals: reversals.toFixed(2), net: losses.plus(reversals).toFixed(2) } };
}

export async function exportImpairmentRegister(tenantId: string, opts: ExportOpts): Promise<Buffer> {
  const result = await impairmentRegister(tenantId, opts.filters ?? {});
  const [company, tenantName] = await Promise.all([getCompanyInfo(tenantId), getTenantName(tenantId)]);
  return callReportService(tenantId, {
    report_type: 'impairment-register',
    format: opts.format,
    rows: serializeRows(result.rows.map(({ id: _id, ...r }) => ({
      ...r, carryingAmount: r.carryingAmount === '' ? null : Number(r.carryingAmount),
      recoverableAmount: r.recoverableAmount === '' ? null : Number(r.recoverableAmount), loss: Number(r.loss),
    }))),
    totals: { count: result.totals.count, loss: Number(result.totals.net) },
    summary: { records: result.totals.count, losses: Number(result.totals.losses), reversals: Number(result.totals.reversals), net: Number(result.totals.net) },
    filters: opts.filters ?? {},
    company,
    tenant_name: tenantName,
  });
}
