import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useSaveUsage, useUsage, type AccountingPeriod } from '@/hooks/useAccounting';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Usage for every units-of-production asset in an open month, entered at once
 * (stage 2.10, D21). Only the rows changed are saved; the next run uses them.
 */
export function UsageSection({ periods, canWrite }: { periods: AccountingPeriod[]; canWrite: boolean }) {
  const open = periods.filter(p => p.status === 'OPEN');
  const [periodId, setPeriodId] = useState('');
  useEffect(() => { if (!periodId && open[0]) setPeriodId(open[0].id); }, [open, periodId]);
  const { data: rows = [], isLoading } = useUsage(periodId);
  const save = useSaveUsage(periodId);
  const [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => setEdits({}), [periodId]);

  const changed = Object.entries(edits).filter(([id, v]) => v !== '' && v !== (rows.find(r => r.id === id)?.units ?? ''));
  const invalid = changed.some(([, v]) => !(Number(v) >= 0));

  if (open.length === 0) return <p className="text-sm text-gray-400">Open a month to enter usage.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Usage month" className={FIELD} value={periodId} onChange={e => setPeriodId(e.target.value)}>
          {open.map(p => <option key={p.id} value={p.id}>{MONTHS[p.month - 1]} {p.year}</option>)}
        </select>
        {canWrite && (
          <Button size="sm" disabled={changed.length === 0 || invalid} loading={save.isPending}
            onClick={() => save.mutate(changed.map(([assetId, v]) => ({ assetId, units: Number(v) })), { onSuccess: () => setEdits({}) })}>
            {changed.length === 0 ? 'Save changes' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
          </Button>
        )}
      </div>
      {isLoading ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No assets are depreciated by units of production.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Asset</th><th className="text-right">Expected over its life</th><th className="text-right">Units this month</th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="py-1.5"><span className="font-mono text-xs text-v-violet mr-2">{r.assetNumber}</span>{r.name}</td>
                <td className="text-right text-gray-500">{r.expectedTotalUnits ?? '—'}</td>
                <td className="text-right">
                  <input aria-label={`Units for ${r.assetNumber}`} type="number" min="0" step="0.01" disabled={!canWrite}
                    className={`${FIELD} w-32 text-right`} value={edits[r.id] ?? r.units ?? ''}
                    onChange={e => setEdits(x => ({ ...x, [r.id]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
