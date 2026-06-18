import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, LogIn, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

interface Checkout {
  id: string;
  assetId: string;
  custodianId: string;
  checkedOutAt: string;
  expectedReturn?: string | null;
  notes?: string | null;
  asset: { id: string; assetNumber: string; name: string };
}

interface AssetOption { id: string; assetNumber: string; name: string; status: string }

function CheckoutForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [assetId, setAssetId]         = useState('');
  const [custodianId, setCustodianId] = useState('');
  const [expectedReturn, setExp]      = useState('');
  const [notes, setNotes]             = useState('');
  const [error, setError]             = useState<string | null>(null);

  const { data: assetData } = useQuery({
    queryKey: ['assets', 'available'],
    queryFn:  () => api.get('/api/v1/assets?pageSize=200&status=active').then(r => r.data),
  });
  const assets: AssetOption[] = assetData?.assets ?? [];

  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/checkouts', {
      assetId, custodianId,
      expectedReturn: expectedReturn ? new Date(expectedReturn).toISOString() : undefined,
      notes:          notes || undefined,
    }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkouts'] });
      toast.success('Asset checked out');
      onDone();
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      const msg = e.response?.data?.error ?? 'Failed to check out asset';
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate(); }}
          className="space-y-3">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-v-charcoal">Asset</label>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          required
          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
          <option value="">— Select an active asset —</option>
          {assets.map(a => (
            <option key={a.id} value={a.id}>{a.assetNumber} — {a.name}</option>
          ))}
        </select>
      </div>
      <Input label="Custodian"      value={custodianId}    onChange={(e) => setCustodianId(e.target.value)} placeholder="Name or employee ID" required />
      <Input label="Expected return" type="date" value={expectedReturn} onChange={(e) => setExp(e.target.value)} />
      <Input label="Notes"          value={notes}          onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={mutation.isPending}>Check out</Button>
      </div>
    </form>
  );
}

export function CheckoutsPage() {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'asset:write');
  const [showForm, setShowForm] = useState(false);

  const { data: active   = [] } = useQuery<Checkout[]>({ queryKey: ['checkouts', 'active'],  queryFn: () => api.get('/api/v1/checkouts').then(r => r.data) });
  const { data: overdue  = [] } = useQuery<Checkout[]>({ queryKey: ['checkouts', 'overdue'], queryFn: () => api.get('/api/v1/checkouts/overdue').then(r => r.data) });
  const overdueIds = new Set(overdue.map(o => o.id));

  const checkinMut = useMutation({
    mutationFn: (assetId: string) => api.post(`/api/v1/checkouts/${assetId}/checkin`).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['checkouts'] }); toast.success('Asset checked in'); },
    onError:    () => { toast.error('Failed to check in asset'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Checkouts</h1>
          <p className="text-sm text-gray-500 mt-1">{active.length} active · {overdue.length} overdue</p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-1.5" /> Check out asset
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-v-charcoal">Check out an asset</h2>
          </div>
          <CardBody>
            <CheckoutForm onDone={() => setShowForm(false)} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="p-0">
          {active.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              <Package className="inline-block mb-2" /> <br /> No assets currently checked out.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-3 text-left">Asset</th>
                  <th className="px-6 py-3 text-left">Custodian</th>
                  <th className="px-6 py-3 text-left">Checked out</th>
                  <th className="px-6 py-3 text-left">Expected return</th>
                  <th className="px-6 py-3 text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {active.map(c => {
                  const isOverdue = overdueIds.has(c.id);
                  return (
                    <tr key={c.id} className={isOverdue ? 'bg-amber-50/50' : ''}>
                      <td className="px-6 py-3">
                        <Link to={`/assets/${c.asset.id}`} className="block hover:text-v-violet">
                          <p className="font-medium text-v-charcoal">{c.asset.name}</p>
                          <p className="font-mono text-xs text-gray-400">{c.asset.assetNumber}</p>
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-v-charcoal">{c.custodianId}</td>
                      <td className="px-6 py-3 text-gray-500">{new Date(c.checkedOutAt).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3">
                        {c.expectedReturn
                          ? (isOverdue
                              ? <Badge label={`Overdue · ${new Date(c.expectedReturn).toLocaleDateString('en-GB')}`} variant="maintenance" />
                              : <span className="text-gray-500">{new Date(c.expectedReturn).toLocaleDateString('en-GB')}</span>)
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {canWrite && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={checkinMut.isPending && checkinMut.variables === c.asset.id}
                            onClick={() => checkinMut.mutate(c.asset.id)}>
                            <LogIn size={14} className="mr-1" /> Check in
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {overdue.length > 0 && (
        <Card>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="font-semibold text-v-charcoal">Overdue ({overdue.length})</h2>
          </div>
          <CardBody>
            <ul className="text-sm space-y-1.5">
              {overdue.map(o => (
                <li key={o.id} className="flex items-center justify-between">
                  <Link to={`/assets/${o.asset.id}`} className="hover:text-v-violet">
                    <span className="font-medium">{o.asset.name}</span>
                    <span className="text-gray-400 font-mono text-xs ml-2">{o.asset.assetNumber}</span>
                  </Link>
                  <span className="text-xs text-amber-700">
                    due {o.expectedReturn ? new Date(o.expectedReturn).toLocaleDateString('en-GB') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
