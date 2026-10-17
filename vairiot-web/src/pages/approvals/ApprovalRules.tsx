import { useEffect, useState } from 'react';
import { APPROVAL_ACTIONS, NEVER_SELF_APPROVED, type ApprovalActionKey } from 'vairiot-shared';

import { Button } from '@/components/ui/Button';
import { useRoles } from '@/hooks/useAdmin';
import { ACTION_LABELS, useApprovalRules, useSaveApprovalRules, type ApprovalRule } from '@/hooks/useApprovals';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';

/**
 * The approval rules (stage 3.3): per action, the amount from which approval
 * is needed and the role that decides. The tier with the highest amount at or
 * below the item's applies; an action with no rule needs no approval.
 */
export function ApprovalRules() {
  const { data: saved } = useApprovalRules();
  const { data: roles = [] } = useRoles();
  const save = useSaveApprovalRules();
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  useEffect(() => { if (saved) setRules(saved.filter(r => r.active)); }, [saved]);

  const change = (i: number, patch: Partial<ApprovalRule>) => setRules(rs => rs.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    return NEVER_SELF_APPROVED.includes(next.action) ? { ...next, requireDifferentUser: true } : next;
  }));
  const add = () => setRules(rs => [...rs, { action: 'DISPOSE', minAmount: 0, approverRoleId: null, requireDifferentUser: true, active: true }]);

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4" aria-label="Approval rules">
      <div>
        <h2 className="font-semibold text-v-charcoal">Rules</h2>
        <p className="text-xs text-gray-500 mt-1">
          An action needs approval from the amount set (the carrying amount, or the cost to capitalise). With several tiers for one action, the highest one at or below the amount applies.
        </p>
      </div>
      {rules.length === 0 ? <p className="text-sm text-gray-400">No rules: every action takes effect at once.</p> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Action</th><th>From amount</th><th>Decided by</th><th>Not by the requester</th><th /></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rules.map((r, i) => (
              <tr key={i}>
                <td className="py-1.5">
                  <select aria-label={`Action of rule ${i + 1}`} className={FIELD} value={r.action} onChange={e => change(i, { action: e.target.value as ApprovalActionKey })}>
                    {APPROVAL_ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                  </select>
                </td>
                <td>
                  <input aria-label={`From amount of rule ${i + 1}`} type="number" min="0" step="0.01" className={`${FIELD} w-32`} value={r.minAmount}
                    onChange={e => change(i, { minAmount: e.target.value })} />
                </td>
                <td>
                  <select aria-label={`Role of rule ${i + 1}`} className={FIELD} value={r.approverRoleId ?? ''} onChange={e => change(i, { approverRoleId: e.target.value || null })}>
                    <option value="">Anyone who approves</option>
                    {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </td>
                <td>
                  <input type="checkbox" aria-label={`Not by the requester, rule ${i + 1}`} checked={r.requireDifferentUser}
                    disabled={NEVER_SELF_APPROVED.includes(r.action)} onChange={e => change(i, { requireDifferentUser: e.target.checked })} />
                </td>
                <td className="text-right"><Button size="sm" variant="secondary" onClick={() => setRules(rs => rs.filter((_, j) => j !== i))}>Remove</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={add}>Add a rule</Button>
        <Button size="sm" loading={save.isPending} disabled={rules.some(r => r.minAmount === '' || Number(r.minAmount) < 0)} onClick={() => save.mutate(rules)}>Save rules</Button>
      </div>
    </section>
  );
}
