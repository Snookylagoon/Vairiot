import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApprovalRules } from './ApprovalRules';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  ACTION_LABELS, useApprovalInbox, useCancelApproval, useDecideApproval, useMyApprovals, type ApprovalRequest, type ApprovalStatus,
} from '@/hooks/useApprovals';
import { useCurrency } from '@/hooks/useCurrency';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const SECTION = 'bg-white rounded-xl border border-gray-100 p-6 space-y-4';
const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATUS_VARIANT: Record<ApprovalStatus, 'yellow' | 'green' | 'red' | 'gray'> = {
  PENDING: 'yellow', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'gray', FAILED: 'red',
};
const STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: 'Awaiting approval', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Withdrawn', FAILED: 'Approved, could not be made',
};

const humanise = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
const shown = (v: unknown) => v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** What will change if it is approved: the request's payload, field by field. */
function Changes({ payload }: { payload: Record<string, unknown> }) {
  const rows = Object.entries(payload).filter(([k]) => !['assetId', 'reconciliationItemId', 'campaignId'].includes(k));
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-xs" aria-label="What will change">
      {rows.map(([k, v]) => (
        <div key={k} className="contents"><dt className="text-gray-400">{humanise(k)}</dt><dd className="text-gray-700 break-all">{shown(v)}</dd></div>
      ))}
    </dl>
  );
}

function RequestCard({ request }: { request: ApprovalRequest }) {
  const decide = useDecideApproval();
  const { fmt } = useCurrency();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <li className="rounded-lg border border-gray-100 p-4 space-y-3 text-sm" aria-label={`Request: ${request.summary}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-v-charcoal">{request.summary}</span>
        <Badge variant="yellow" label={ACTION_LABELS[request.action]} />
      </div>
      <p className="text-xs text-gray-500">
        Asked by {request.requestedByName ?? 'someone'} on {new Date(request.createdAt).toLocaleDateString('en-GB')}
        {request.amount !== null && <> · {request.action === 'CAPITALISE' ? 'cost' : 'carrying amount'} {fmt(request.amount)}</>}
        {request.approverRole && <> · for {request.approverRole}</>}
        {request.assetId && <> · <Link to={`/assets/${request.assetId}`} className="text-v-violet">the asset</Link></>}
      </p>
      <Changes payload={request.payload} />
      {request.canDecide && (rejecting ? (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Reason for rejecting" className={`${FIELD} flex-1 min-w-48`} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why it is rejected" />
          <Button size="sm" variant="danger" disabled={!reason.trim()} loading={decide.isPending}
            onClick={() => decide.mutate({ id: request.id, decision: 'reject', reason: reason.trim() })}>Reject</Button>
          <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: request.id, decision: 'approve' })}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>Reject…</Button>
        </div>
      ))}
    </li>
  );
}

function MyRequests() {
  const { data: mine = [] } = useMyApprovals();
  const cancel = useCancelApproval();
  if (mine.length === 0) return <p className="text-sm text-gray-400">You have not asked for anything.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Asked</th><th>Request</th><th>Status</th><th /></tr></thead>
      <tbody className="divide-y divide-gray-50">
        {mine.map(r => (
          <tr key={r.id} aria-label={`My request: ${r.summary}`}>
            <td className="py-1.5 whitespace-nowrap text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
            <td>
              {r.summary}
              {(r.reason || r.error) && <p className="text-xs text-gray-500">{r.decidedByName ? `${r.decidedByName}: ` : ''}{r.error ?? r.reason}</p>}
            </td>
            <td><Badge variant={STATUS_VARIANT[r.status]} label={r.status === 'PENDING' && r.approverRole ? `Awaiting ${r.approverRole}` : STATUS_LABEL[r.status]} /></td>
            <td className="text-right">
              {r.status === 'PENDING' && <Button size="sm" variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Withdraw</Button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Approvals (Phase 3, S3.1, stage 3.3, D22): what the user may decide — the
 * requests in their role, and depreciation runs and impairments prepared by
 * someone else, which are posted on their own pages (D17) — their own
 * requests, and, for company:manage, the rules.
 */
export function ApprovalsPage() {
  const user = useAuthStore(s => s.user);
  const decides = hasAnyPermission(user, 'approval:read', 'approval:decide', 'accounting:approve');
  const { data: inbox, isLoading } = useApprovalInbox(decides);
  const { fmt } = useCurrency();
  const ledger = (inbox?.runs.length ?? 0) + (inbox?.impairments.length ?? 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Disposals, transfers, write-offs, found assets and capitalisations covered by a rule wait here until someone in the rule&apos;s role approves them.
          Nothing changes until then, and a disposal or write-off is never approved by the person who asked for it.
        </p>
      </div>

      {decides && (
        <section className={SECTION}>
          <h2 className="font-semibold text-v-charcoal">For you to decide{inbox?.requests.length ? ` (${inbox.requests.length})` : ''}</h2>
          {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : !inbox?.requests.length ? <p className="text-sm text-gray-400">Nothing waiting.</p> : (
            <ul className="space-y-3">{inbox.requests.map(r => <RequestCard key={r.id} request={r} />)}</ul>
          )}
        </section>
      )}

      {ledger > 0 && (
        <section className={SECTION}>
          <h2 className="font-semibold text-v-charcoal">Ledger, to post ({ledger})</h2>
          <ul className="text-sm space-y-1.5">
            {inbox!.runs.map(r => (
              <li key={r.id}>Depreciation run for {MONTHS[r.period.month - 1]} {r.period.year}: {r.assetCount} assets, {fmt(r.totalCharge)} —{' '}
                <Link to="/accounting/periods" className="text-v-violet">post it on the Depreciation page</Link></li>
            ))}
            {inbox!.impairments.map(i => (
              <li key={i.id}>{i.kind === 'REVERSAL' ? 'Impairment reversal' : 'Impairment'} of {i.asset.assetNumber} {i.asset.name}: {fmt(Math.abs(Number(i.loss)))} —{' '}
                <Link to="/accounting/impairments" className="text-v-violet">post it on the Impairment page</Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className={SECTION}>
        <h2 className="font-semibold text-v-charcoal">My requests</h2>
        <MyRequests />
      </section>

      {hasAnyPermission(user, 'company:manage') && <ApprovalRules />}
    </div>
  );
}
