import { TrendingDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAssetDepreciation, usePeriods, useSetUsage } from '@/hooks/useAccounting';
import { useCurrency } from '@/hooks/useCurrency';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHOD: Record<string, string> = { straight_line: 'Straight line', declining_balance: 'Reducing balance', units_of_production: 'Units' };

/**
 * The asset's posted depreciation (stage 2.9): each month's entry, reversals
 * included, and the carrying amount from the ledger. For an asset depreciated
 * by units of production, its usage in an open period (D21).
 */
export function AssetDepreciation({ assetId, method }: { assetId: string; method?: string | null }) {
  const { data } = useAssetDepreciation(assetId);
  const { data: periods = [] } = usePeriods();
  const setUsage = useSetUsage(assetId);
  const canWrite = useAuthStore(s => hasAnyPermission(s.user, 'accounting:write'));
  const { fmt } = useCurrency();
  const open = periods.filter(p => p.status === 'OPEN');
  const [periodId, setPeriodId] = useState('');
  const [units, setUnits] = useState('');

  if (!data) return null;
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="flex items-center gap-2"><TrendingDown size={16} className="text-v-violet" /><span className="font-semibold text-v-charcoal text-sm">Posted depreciation</span></span>
        {data.carryingAmount !== null && <span className="text-sm">Carrying amount <strong>{fmt(data.carryingAmount)}</strong></span>}
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        {data.entries.length === 0 ? <p className="text-gray-400">Nothing posted yet: the figures above are projected.</p> : (
          <table className="w-full">
            <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Month</th><th>Method</th><th className="text-right">Opening</th><th className="text-right">Charge</th><th className="text-right">Closing</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data.entries.map(e => (
                <tr key={e.id} className={e.runStatus === 'POSTED' ? '' : 'text-gray-400 line-through'}>
                  <td className="py-1.5">{MONTHS[e.month - 1]} {e.year}{e.runStatus === 'REVERSAL' && <span className="ml-1 no-underline text-xs">(reversal)</span>}</td>
                  <td>{METHOD[e.method] ?? e.method}</td>
                  <td className="text-right">{fmt(e.openingNbv)}</td><td className="text-right">{fmt(e.charge)}</td><td className="text-right">{fmt(e.closingNbv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {method === 'units_of_production' && canWrite && open.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Usage period" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white" value={periodId} onChange={e => setPeriodId(e.target.value)}>
              <option value="">Usage for…</option>
              {open.map(p => <option key={p.id} value={p.id}>{MONTHS[p.month - 1]} {p.year}</option>)}
            </select>
            <input aria-label="Units used" type="number" min="0" step="0.01" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm w-32" value={units} onChange={e => setUnits(e.target.value)} />
            <Button size="sm" disabled={!periodId || units === ''} loading={setUsage.isPending}
              onClick={() => setUsage.mutate({ periodId, units: Number(units) }, { onSuccess: () => setUnits('') })}>Save usage</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
