import { Link } from 'react-router-dom';

import { useApprovals, useMyApprovals } from '@/hooks/useApprovals';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

/**
 * "Awaiting approval" on an asset (stage 3.3): the pending requests about it —
 * everyone's for those who see approvals, the user's own otherwise.
 */
export function AwaitingApproval({ assetId }: { assetId: string }) {
  const user = useAuthStore(s => s.user);
  const seesAll = hasAnyPermission(user, 'approval:read', 'approval:decide');
  const { data: all = [] } = useApprovals({ status: 'PENDING', assetId }, seesAll);
  const { data: mine = [] } = useMyApprovals('PENDING');
  const pending = seesAll ? all : mine.filter(r => r.assetId === assetId);
  if (pending.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
      <p className="font-semibold">Awaiting approval</p>
      <ul className="space-y-0.5">
        {pending.map(r => (
          <li key={r.id}>
            {r.summary} — asked by {r.requestedByName ?? 'someone'}{r.approverRole ? `, for ${r.approverRole}` : ''}.{' '}
            {r.canDecide ? <Link to="/approvals" className="underline">Decide</Link> : 'Nothing changes until it is approved.'}
          </li>
        ))}
      </ul>
    </div>
  );
}
