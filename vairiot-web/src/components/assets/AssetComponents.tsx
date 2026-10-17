import { useQueryClient } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COMPONENT_ROLES } from 'vairiot-shared';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useComponentGroup, useComponentTemplates, useCreateFromTemplate, useSetParent } from '@/hooks/useAccounting';
import { useCreateAsset } from '@/hooks/useAssets';
import { useCurrency } from '@/hooks/useCurrency';
import { api } from '@/lib/api';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';

/** Moves a part to the asset with the number typed, or detaches it. */
function PartActions({ partId, onDone }: { partId: string; onDone?: () => void }) {
  const setParent = useSetParent(partId);
  const [moving, setMoving] = useState(false);
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  const move = async () => {
    const found = await api.get('/api/v1/assets', { params: { search: number.trim(), pageSize: 5 } }).then(r => r.data.assets as Array<{ id: string; assetNumber: string }>);
    const target = found.find(a => a.assetNumber.toLowerCase() === number.trim().toLowerCase());
    if (!target) { setError('No asset with that number'); return; }
    setParent.mutate({ parentAssetId: target.id }, { onSuccess: () => { setMoving(false); onDone?.(); } });
  };
  if (moving) {
    return (
      <span className="flex items-center gap-1">
        <input aria-label="Asset number of the new parent" className={`${FIELD} w-28`} value={number} onChange={e => { setNumber(e.target.value); setError(''); }} placeholder="AST-…" />
        <button className="text-xs text-v-violet hover:underline" onClick={move}>Move</button>
        <button className="text-xs text-gray-400 hover:underline" onClick={() => setMoving(false)}>Cancel</button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }
  return (
    <span className="flex gap-2 text-xs">
      <button className="text-v-violet hover:underline" onClick={() => setMoving(true)}>Move to…</button>
      <button className="text-gray-500 hover:underline" onClick={() => setParent.mutate({ parentAssetId: null }, { onSuccess: onDone })}>Detach</button>
    </span>
  );
}

/**
 * The asset's parts (stage 2.6, S2.2): each with its role and figures, and the
 * roll-up of the whole; add parts from a template or by hand, move or detach
 * them. For a part, the asset it belongs to.
 */
export function AssetComponents({ assetId, assetName }: { assetId: string; assetName: string }) {
  const { data: group } = useComponentGroup(assetId);
  const { data: templates = [] } = useComponentTemplates();
  const canWrite = useAuthStore(s => hasAnyPermission(s.user, 'accounting:write') && hasAnyPermission(s.user, 'asset:write'));
  const fromTemplate = useCreateFromTemplate();
  const createAsset = useCreateAsset();
  const qc = useQueryClient();
  const { fmt } = useCurrency();
  const [adding, setAdding] = useState<'template' | 'part' | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [cost, setCost] = useState('');
  const [part, setPart] = useState({ name: '', role: 'other' });

  if (!group) return null;
  if (group.parent) {
    return (
      <Card>
        <CardHeader className="flex items-center gap-2"><Layers size={16} className="text-v-violet" /><span className="font-semibold text-v-charcoal text-sm">Component</span></CardHeader>
        <CardBody className="flex items-center justify-between text-sm">
          <span>{group.asset.componentRole ?? 'Part'} of <Link to={`/assets/${group.parent.id}`} className="text-v-violet hover:underline">{group.parent.assetNumber} · {group.parent.name}</Link></span>
          {canWrite && <PartActions partId={assetId} />}
        </CardBody>
      </Card>
    );
  }

  const addFromTemplate = () => fromTemplate.mutate(
    { templateId, name: assetName, parentAssetId: assetId, totalCost: cost ? Number(cost) : null },
    { onSuccess: () => { setAdding(null); setCost(''); } },
  );
  const addPart = () => createAsset.mutate(
    { name: part.name.trim(), parentAssetId: assetId, componentRole: part.role, purchaseCost: cost ? Number(cost) : undefined } as never,
    { onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting'] }); setAdding(null); setCost(''); setPart({ name: '', role: 'other' }); } },
  );

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="flex items-center gap-2"><Layers size={16} className="text-v-violet" /><span className="font-semibold text-v-charcoal text-sm">Components ({group.components.length})</span></span>
        {canWrite && !adding && (
          <span className="flex gap-2">
            {templates.some(t => t.active) && <Button size="sm" variant="secondary" onClick={() => setAdding('template')}>Add from template</Button>}
            <Button size="sm" variant="secondary" onClick={() => setAdding('part')}>Add part</Button>
          </span>
        )}
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        {group.components.length === 0 && !adding && <p className="text-gray-400">Not held as parts.</p>}
        {group.components.length > 0 && (
          <table className="w-full">
            <thead className="text-left text-xs text-gray-400"><tr><th className="py-1">Part</th><th>Role</th><th className="text-right">Cost</th><th className="text-right">NBV</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {group.components.map(c => (
                <tr key={c.id}>
                  <td className="py-1.5"><Link to={`/assets/${c.id}`} className="hover:text-v-violet"><span className="font-mono text-xs text-v-violet mr-2">{c.assetNumber}</span>{c.name}</Link></td>
                  <td className="text-gray-500">{c.componentRole}</td>
                  <td className="text-right">{fmt(c.depreciation.capitalizedCost)}</td>
                  <td className="text-right">{fmt(c.depreciation.netBookValue)}</td>
                  <td className="text-right">{canWrite && <PartActions partId={c.id} />}</td>
                </tr>
              ))}
            </tbody>
            {group.rollUp && (
              <tfoot className="font-semibold border-t border-gray-200">
                <tr><td className="py-1.5" colSpan={2}>Whole asset (own + parts)</td><td className="text-right">{fmt(group.rollUp.capitalizedCost)}</td><td className="text-right">{fmt(group.rollUp.netBookValue)}</td><td /></tr>
              </tfoot>
            )}
          </table>
        )}
        {adding === 'template' && (
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Component template" className={FIELD} value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">Choose a template</option>
              {templates.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name} ({t.lines.length} parts)</option>)}
            </select>
            <input aria-label="Total cost of the parts" type="number" step="0.01" min="0" className={`${FIELD} w-36`} placeholder="Total cost" value={cost} onChange={e => setCost(e.target.value)} />
            <Button size="sm" disabled={!templateId} loading={fromTemplate.isPending} onClick={addFromTemplate}>Add parts</Button>
            <Button size="sm" variant="secondary" onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        )}
        {adding === 'part' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <Input label="Part name" value={part.name} onChange={e => setPart(p => ({ ...p, name: e.target.value }))} />
            <div>
              <label htmlFor="part-role" className="block text-sm font-medium text-v-charcoal mb-1">Role</label>
              <select id="part-role" className={`${FIELD} w-full`} value={part.role} onChange={e => setPart(p => ({ ...p, role: e.target.value }))}>
                {COMPONENT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <Input label="Cost" type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} />
            <span className="flex gap-2">
              <Button size="sm" disabled={!part.name.trim()} loading={createAsset.isPending} onClick={addPart}>Add</Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding(null)}>Cancel</Button>
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
