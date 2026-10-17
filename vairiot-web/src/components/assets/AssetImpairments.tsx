import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useCurrency } from '@/hooks/useCurrency';
import { INDICATORS, METHODS, useImpairments, useRaiseImpairment } from '@/hooks/useImpairments';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS = { DRAFT: 'yellow', POSTED: 'green', REVERSED: 'gray', DISMISSED: 'gray' } as const;

/**
 * The asset's impairments (stage 2.12): drafts waiting for assessment, posted
 * losses, reversals and corrections; and raising one by hand. Assessment and
 * posting happen on the Impairment page.
 */
export function AssetImpairments({ assetId, recognised }: { assetId: string; recognised: boolean }) {
  const { data: records = [] } = useImpairments({ assetId });
  const raise = useRaiseImpairment();
  const canWrite = useAuthStore(s => hasAnyPermission(s.user, 'accounting:write'));
  const { fmt } = useCurrency();
  const [raising, setRaising] = useState(false);
  const [indicator, setIndicator] = useState('DAMAGE');
  const [notes, setNotes] = useState('');
  const waiting = records.some(r => r.status === 'DRAFT');
  const net = records.filter(r => r.status === 'POSTED' || r.status === 'REVERSED').reduce((t, r) => t + Number(r.loss ?? 0), 0);

  if (!recognised && records.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="flex items-center gap-2"><ShieldAlert size={16} className="text-v-violet" /><span className="font-semibold text-v-charcoal text-sm">Impairment</span></span>
        {net !== 0 && <span className="text-sm">Net impairment <strong>{fmt(net)}</strong></span>}
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        {records.length === 0 ? <p className="text-gray-400">No impairment recorded.</p> : (
          <ul className="divide-y divide-gray-50">
            {records.map(r => (
              <li key={r.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Badge variant={STATUS[r.status]} label={r.correctionOfId ? 'correction' : r.status === 'DRAFT' ? 'to assess' : r.status.toLowerCase()} />
                  <span>{r.kind === 'REVERSAL' ? 'Reversal' : INDICATORS[r.indicator] ?? r.indicator}{r.method && <span className="text-gray-400"> · {METHODS[r.method]}</span>}</span>
                </span>
                <span className="text-gray-600">
                  {r.period && `${MONTHS[r.period.month - 1]} ${r.period.year} · `}{r.loss !== null && r.status !== 'DRAFT' ? fmt(r.loss) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {waiting && <Link to="/accounting/impairments" className="text-xs text-v-violet hover:underline">Assess it on the Impairment page</Link>}
        {canWrite && recognised && !waiting && (raising ? (
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Indicator" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white" value={indicator} onChange={e => setIndicator(e.target.value)}>
              {Object.entries(INDICATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input aria-label="What indicates it" placeholder="What indicates it" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm flex-1 min-w-48" value={notes} onChange={e => setNotes(e.target.value)} />
            <Button size="sm" loading={raise.isPending}
              onClick={() => raise.mutate({ assetId, indicator, ...(notes.trim() && { indicatorNotes: notes.trim() }) }, { onSuccess: () => { setRaising(false); setNotes(''); } })}>Raise</Button>
            <Button size="sm" variant="secondary" onClick={() => setRaising(false)}>Cancel</Button>
          </div>
        ) : <Button size="sm" variant="secondary" onClick={() => setRaising(true)}>Raise an impairment</Button>)}
      </CardBody>
    </Card>
  );
}
