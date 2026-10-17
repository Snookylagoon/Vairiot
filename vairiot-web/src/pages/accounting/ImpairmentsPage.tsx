import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePeriods } from '@/hooks/useAccounting';
import { useCurrency } from '@/hooks/useCurrency';
import {
  INDICATORS, METHODS, STANDARDS, useAssessImpairment, useImpairmentAction, useImpairmentRegister, useImpairments, type Impairment,
} from '@/hooks/useImpairments';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';
const SECTION = 'bg-white rounded-xl border border-gray-100 p-6 space-y-4';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** An open month to post into: the latest is offered first, since later months may not have posted depreciation. */
function PeriodPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { data: periods = [] } = usePeriods();
  const open = periods.filter(p => p.status === 'OPEN');
  if (open.length === 0) return <span className="text-xs text-gray-400">Open a month on the Depreciation page first.</span>;
  return (
    <select aria-label={label} className={FIELD} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Month…</option>
      {open.map(p => <option key={p.id} value={p.id}>{MONTHS[p.month - 1]} {p.year}</option>)}
    </select>
  );
}

function DraftCard({ draft, canWrite, canApprove, myId }: { draft: Impairment; canWrite: boolean; canApprove: boolean; myId?: string }) {
  const assess = useAssessImpairment(draft.id);
  const action = useImpairmentAction();
  const { fmt } = useCurrency();
  const [standard, setStandard] = useState(draft.standard ?? 'IPSAS_21');
  const [method, setMethod] = useState(draft.method ?? 'DRC');
  const [recoverable, setRecoverable] = useState(draft.recoverableAmount ?? '');
  const [notes, setNotes] = useState(draft.assessmentNotes ?? '');
  const [periodId, setPeriodId] = useState('');
  const assessed = draft.loss !== null;
  const mine = draft.assessedBy === myId;
  const noLoss = assessed && Number(draft.loss) === 0;

  return (
    <li className="rounded-lg border border-gray-100 p-4 space-y-3 text-sm" aria-label={`Impairment of ${draft.asset.assetNumber}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <Link to={`/assets/${draft.asset.id}`} className="font-mono text-xs text-v-violet mr-2">{draft.asset.assetNumber}</Link>
          <span className="font-medium text-v-charcoal">{draft.asset.name}</span>
        </span>
        <Badge variant="yellow" label={INDICATORS[draft.indicator] ?? draft.indicator} />
      </div>
      {draft.indicatorNotes && <p className="text-xs text-gray-500">{draft.indicatorNotes}</p>}

      {canWrite && (
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="Standard" className={FIELD} value={standard} onChange={e => setStandard(e.target.value)}>
            {Object.entries(STANDARDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Measurement method" className={FIELD} value={method} onChange={e => setMethod(e.target.value)}>
            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input aria-label="Recoverable amount" type="number" min="0" step="0.01" placeholder="Recoverable amount" className={`${FIELD} w-40`}
            value={recoverable} onChange={e => setRecoverable(e.target.value)} />
          <input aria-label="Assessment notes" placeholder="How it was measured" className={`${FIELD} flex-1 min-w-48`} value={notes} onChange={e => setNotes(e.target.value)} />
          <Button size="sm" variant="secondary" disabled={recoverable === '' || !(Number(recoverable) >= 0)} loading={assess.isPending}
            onClick={() => assess.mutate({ standard, method, recoverableAmount: Number(recoverable), ...(notes.trim() && { assessmentNotes: notes.trim() }) })}>
            {assessed ? 'Assess again' : 'Save assessment'}
          </Button>
        </div>
      )}

      {assessed && (
        <p className="text-xs text-gray-600" role="status">
          Carrying {fmt(draft.carryingAmount)}, recoverable {fmt(draft.recoverableAmount)}:{' '}
          {noLoss ? 'not impaired — dismiss it' : draft.kind === 'REVERSAL'
            ? <strong>reversal of {fmt(-Number(draft.loss))}</strong> : <strong>impairment loss of {fmt(draft.loss)}</strong>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canApprove && assessed && !noLoss && (
          <>
            <PeriodPicker value={periodId} onChange={setPeriodId} label="Post into" />
            <Button size="sm" disabled={!periodId || mine} title={mine ? 'You assessed this: another approver posts it' : undefined} loading={action.isPending}
              onClick={() => action.mutate({ id: draft.id, action: 'post', body: { periodId }, done: 'Posted' })}>Post</Button>
          </>
        )}
        {canWrite && <Button size="sm" variant="secondary" onClick={() => action.mutate({ id: draft.id, action: 'dismiss', done: 'Dismissed' })}>Dismiss</Button>}
      </div>
      {canApprove && mine && <p className="text-xs text-gray-500">You assessed this, so another approver posts it.</p>}
    </li>
  );
}

function PostedRow({ record, canApprove }: { record: Impairment; canApprove: boolean }) {
  const action = useImpairmentAction();
  const { fmt } = useCurrency();
  const [correcting, setCorrecting] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [notes, setNotes] = useState('');
  const kind = record.correctionOfId ? 'Correction' : record.kind === 'REVERSAL' ? 'Reversal' : 'Impairment';
  return (
    <>
      <tr className={record.status === 'REVERSED' ? 'text-gray-400 line-through' : ''}>
        <td className="py-1.5">{record.period ? `${MONTHS[record.period.month - 1].slice(0, 3)} ${record.period.year}` : '—'}</td>
        <td><Link to={`/assets/${record.asset.id}`} className="font-mono text-xs text-v-violet mr-2">{record.asset.assetNumber}</Link>{record.asset.name}</td>
        <td>{kind}</td>
        <td>{record.method ? METHODS[record.method] : '—'}</td>
        <td className="text-right">{fmt(record.carryingAmount)}</td>
        <td className="text-right">{fmt(record.loss)}</td>
        <td className="text-right">
          {canApprove && record.status === 'POSTED' && !record.correctionOfId && !correcting && (
            <Button size="sm" variant="secondary" onClick={() => setCorrecting(true)}>Correct</Button>
          )}
        </td>
      </tr>
      {correcting && (
        <tr><td colSpan={7} className="py-2">
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker value={periodId} onChange={setPeriodId} label="Correct in" />
            <input aria-label="Reason for the correction" className={`${FIELD} flex-1 min-w-48`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why it is corrected" />
            <Button size="sm" variant="danger" disabled={!periodId} loading={action.isPending}
              onClick={() => action.mutate({ id: record.id, action: 'correct', body: { periodId, ...(notes.trim() && { notes: notes.trim() }) }, done: 'Corrected' }, { onSuccess: () => setCorrecting(false) })}>Post correction</Button>
            <Button size="sm" variant="secondary" onClick={() => setCorrecting(false)}>Cancel</Button>
          </div>
        </td></tr>
      )}
    </>
  );
}

/**
 * Impairment (Phase 2, S2.4, stage 2.12): drafts raised by a grade that
 * indicates impairment or by hand, assessed with the standard, the method and
 * the recoverable amount, and posted into an open month by another approver
 * (D17); posted records with their corrections; and the register's totals.
 */
export function ImpairmentsPage() {
  const { data: drafts = [], isLoading } = useImpairments({ status: 'DRAFT' });
  const { data: all = [] } = useImpairments();
  const { data: register } = useImpairmentRegister();
  const { fmt } = useCurrency();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'accounting:write');
  const canApprove = hasAnyPermission(user, 'accounting:approve');
  const posted = all.filter(i => i.status === 'POSTED' || i.status === 'REVERSED');

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Impairment</h1>
        <p className="text-sm text-gray-500 mt-1">
          An asset whose grade drops to one that indicates impairment comes here to be assessed; any asset can be raised from its page.
          Another approver posts the assessment into an open month, and that month&apos;s depreciation is the first on the new carrying amount.
        </p>
      </div>

      <section className={SECTION}>
        <h2 className="font-semibold text-v-charcoal">Waiting for assessment{drafts.length > 0 ? ` (${drafts.length})` : ''}</h2>
        {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : drafts.length === 0 ? <p className="text-sm text-gray-400">Nothing waiting.</p> : (
          <ul className="space-y-3">{drafts.map(d => <DraftCard key={d.id} draft={d} canWrite={canWrite} canApprove={canApprove} myId={user?.userId} />)}</ul>
        )}
      </section>

      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-v-charcoal">Posted</h2>
          <ReportExportButton reportType="impairment-register" disabled={posted.length === 0} />
        </div>
        {posted.length === 0 ? <p className="text-sm text-gray-400">Nothing posted yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Month</th><th>Asset</th><th>Kind</th><th>Method</th><th className="text-right">Carrying</th><th className="text-right">Loss</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-50">{posted.map(r => <PostedRow key={r.id} record={r} canApprove={canApprove} />)}</tbody>
            {register && (
              <tfoot className="border-t border-gray-200 text-xs text-gray-600">
                <tr><td colSpan={5} className="py-1.5 text-right">Losses {fmt(register.totals.losses)} · reversals {fmt(register.totals.reversals)} · net</td>
                  <td className="text-right font-semibold text-sm text-v-charcoal">{fmt(register.totals.net)}</td><td /></tr>
              </tfoot>
            )}
          </table>
        )}
      </section>
    </div>
  );
}
