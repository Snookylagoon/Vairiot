import { useState } from 'react';

import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { isBusy, useDepreciationByClass, useOpenPeriod, usePeriodAction, usePeriods, type AccountingPeriod, type DepreciationRunSummary } from '@/hooks/useAccounting';
import { useCurrency } from '@/hooks/useCurrency';
import { UsageSection } from '@/pages/accounting/UsageSection';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';
const SECTION = 'bg-white rounded-xl border border-gray-100 p-6 space-y-4';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATUS = { OPEN: 'green', CLOSED: 'gray', LOCKED: 'red' } as const;
const SKIPS: Record<string, string> = {
  not_recognised: 'not recognised (expensed or waiting for Finance)', no_method: 'not depreciated', no_cost: 'no cost',
  not_started: 'not started yet', disposed: 'disposed', no_life: 'no useful life', no_units: 'no usage entered', fully_depreciated: 'fully depreciated',
};
const label = (p: { year: number; month: number }) => `${MONTHS[p.month - 1]} ${p.year}`;
const WORKING = { PREPARE: 'Preparing…', POST: 'Posting…', REVERSE: 'Reversing…' } as const;

function RunCard({ run, canApprove, canWrite, myId }: { run: DepreciationRunSummary; canApprove: boolean; canWrite: boolean; myId?: string }) {
  const action = usePeriodAction();
  const { fmt } = useCurrency();
  const [reversing, setReversing] = useState(false);
  const [notes, setNotes] = useState('');
  const mine = run.preparedBy === myId;
  const reversal = !!run.reversalOfRunId;
  // The worker does the work (stage 2.10); nothing else is offered meanwhile.
  const busy = isBusy(run);
  return (
    <div className="rounded-lg border border-gray-100 p-3 space-y-2 text-sm" aria-label={`Run ${run.status.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Badge variant={run.status === 'POSTED' ? 'green' : run.status === 'DRAFT' ? 'yellow' : 'gray'} label={reversal ? 'Reversal' : run.status.toLowerCase()} />
          {busy ? <span className="text-gray-500" role="status">{WORKING[run.pendingAction ?? 'PREPARE']}</span>
            : <span>{run.assetCount} assets · {fmt(run.totalCharge)}</span>}
        </span>
        {!busy && <span className="flex gap-2">
          {run.status === 'DRAFT' && canApprove && (
            <Button size="sm" disabled={mine} title={mine ? 'You prepared this run: another approver posts it' : undefined}
              loading={action.isPending} onClick={() => action.mutate({ path: `/runs/${run.id}/post`, done: 'Posted' })}>Post</Button>
          )}
          {run.status === 'DRAFT' && canWrite && (
            <Button size="sm" variant="secondary" onClick={() => action.mutate({ path: `/runs/${run.id}/discard`, done: 'Discarded' })}>Discard</Button>
          )}
          {run.status === 'POSTED' && !reversal && canApprove && !reversing && (
            <Button size="sm" variant="secondary" onClick={() => setReversing(true)}>Reverse</Button>
          )}
        </span>}
      </div>
      {run.jobState === 'FAILED' && run.jobError && <p className="text-xs text-red-600" role="alert">Not done: {run.jobError}</p>}
      {run.status === 'DRAFT' && mine && canApprove && <p className="text-xs text-gray-500">You prepared this run, so another approver posts it.</p>}
      {run.preview && run.status !== 'DISCARDED' && !reversal && (
        <div className="text-xs text-gray-600 space-y-1">
          {run.preview.byClass.map(c => <div key={c.classCode} className="flex justify-between max-w-sm"><span>{c.classCode} · {c.count} assets</span><span>{fmt(c.charge)}</span></div>)}
          {Object.entries(run.preview.skipped).length > 0 && (
            <p className="text-gray-400">Left out: {Object.entries(run.preview.skipped).map(([k, n]) => `${n} ${SKIPS[k] ?? k}`).join('; ')}</p>
          )}
        </div>
      )}
      {reversing && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Reason for the reversal" className={`${FIELD} flex-1 min-w-48`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why it is reversed" />
          <Button size="sm" variant="danger" loading={action.isPending}
            onClick={() => action.mutate({ path: `/runs/${run.id}/reverse`, body: notes.trim() ? { notes: notes.trim() } : {}, done: 'Reversed' }, { onSuccess: () => setReversing(false) })}>Reverse run</Button>
          <Button size="sm" variant="secondary" onClick={() => setReversing(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function PeriodRow({ period, canApprove, canWrite, myId }: { period: AccountingPeriod; canApprove: boolean; canWrite: boolean; myId?: string }) {
  const action = usePeriodAction();
  const runs = period.runs.filter(r => r.status !== 'DISCARDED');
  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium text-v-charcoal">{label(period)} <Badge variant={STATUS[period.status]} label={period.status.toLowerCase()} /></span>
        <span className="flex gap-2">
          {period.status === 'OPEN' && canWrite && !runs.some(r => r.status === 'DRAFT' || isBusy(r)) && (
            <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ path: `/periods/${period.id}/runs`, done: 'Prepared' })}>Prepare run</Button>
          )}
          {period.status === 'CLOSED' && canApprove && (
            <Button size="sm" variant="secondary" onClick={() => action.mutate({ path: `/periods/${period.id}/reopen`, done: 'Reopened' })}>Reopen</Button>
          )}
          {period.status !== 'LOCKED' && canApprove && (
            <Button size="sm" variant="secondary" onClick={() => { if (window.confirm(`Lock ${label(period)} for good? Nothing can be run or reversed in it afterwards.`)) action.mutate({ path: `/periods/${period.id}/lock`, done: 'Locked' }); }}>Lock</Button>
          )}
        </span>
      </div>
      {runs.map(r => <RunCard key={r.id} run={r} canApprove={canApprove} canWrite={canWrite} myId={myId} />)}
    </li>
  );
}

/**
 * Accounting periods and depreciation runs (Phase 2, stage 2.9, S2.3): open a
 * month, prepare a run and check its preview, post it (another approver,
 * D17), reverse it, reopen or lock the period; and posted depreciation by
 * asset class.
 */
export function PeriodsPage() {
  const { data: periods = [], isLoading } = usePeriods();
  const { data: byClass } = useDepreciationByClass();
  const openPeriod = useOpenPeriod();
  const { fmt } = useCurrency();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'accounting:write');
  const canApprove = hasAnyPermission(user, 'accounting:approve');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Periods and depreciation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monthly runs in month order: prepare a run, check it, and another approver posts it, which closes the month.
          A posted run is corrected by reversing it.
        </p>
      </div>

      <section className={SECTION}>
        {canWrite && (
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Month" className={FIELD} value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input aria-label="Year" type="number" className={`${FIELD} w-24`} value={year} onChange={e => setYear(Number(e.target.value))} />
            <Button size="sm" loading={openPeriod.isPending} onClick={() => openPeriod.mutate({ year, month })}>Open period</Button>
          </div>
        )}
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!isLoading && periods.length === 0 && <p className="text-sm text-gray-400">No periods yet.</p>}
        <ul className="divide-y divide-gray-50">
          {periods.map(p => <PeriodRow key={p.id} period={p} canApprove={canApprove} canWrite={canWrite} myId={user?.userId} />)}
        </ul>
      </section>

      <section className={SECTION}>
        <div>
          <h2 className="font-semibold text-v-charcoal">Usage for units of production</h2>
          <p className="text-xs text-gray-500">Units each asset delivered in the month; the run uses them.</p>
        </div>
        <UsageSection periods={periods} canWrite={canWrite} />
      </section>

      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-v-charcoal">By asset class{byClass?.period ? ` · ${label(byClass.period)}` : ''}</h2>
          <ReportExportButton reportType="depreciation-by-class" disabled={!byClass?.period} />
        </div>
        {!byClass?.period ? <p className="text-sm text-gray-400">Nothing posted yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Class</th><th className="text-right">Assets</th><th className="text-right">Charge</th><th className="text-right">Accumulated</th><th className="text-right">Impairment</th><th className="text-right">Carrying amount</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {byClass.rows.map(r => (
                <tr key={r.classCode}><td className="py-1.5"><span className="font-mono text-xs text-v-violet mr-2">{r.classCode}</span>{r.className}</td>
                  <td className="text-right">{r.assetCount}</td><td className="text-right">{fmt(r.periodCharge)}</td><td className="text-right">{fmt(r.accumulated)}</td><td className="text-right">{fmt(r.impaired ?? 0)}</td><td className="text-right">{fmt(r.carryingAmount)}</td></tr>
              ))}
            </tbody>
            <tfoot className="font-semibold border-t border-gray-200">
              <tr><td className="py-1.5">Total</td><td className="text-right">{byClass.totals.assetCount}</td><td className="text-right">{fmt(byClass.totals.periodCharge)}</td><td className="text-right">{fmt(byClass.totals.accumulated)}</td><td className="text-right">{fmt(byClass.totals.impaired ?? 0)}</td><td className="text-right">{fmt(byClass.totals.carryingAmount)}</td></tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}
