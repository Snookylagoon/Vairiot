import { useState } from 'react';
import { assetClassSchema, DepreciationMethod, IpsasClass, type AssetClassInput } from 'vairiot-shared';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCreateAssetClass, useUpdateAssetClass, type AssetClass } from '@/hooks/useAccounting';

const SELECT = 'block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white';
const IPSAS_LABELS: Record<string, string> = {
  INFRASTRUCTURE: 'Infrastructure', OPERATIONAL: 'Operational', OFFICE_EQUIPMENT: 'Office equipment', FURNITURE: 'Furniture',
  VEHICLES: 'Vehicles', LAND: 'Land', BUILDINGS: 'Buildings', OTHER: 'Other',
};
const METHOD_LABELS: Record<string, string> = {
  straight_line: 'Straight line', declining_balance: 'Reducing balance', units_of_production: 'Units of production', none: 'Not depreciated',
};

type Draft = Record<string, string | boolean>;
const toDraft = (c?: AssetClass): Draft => ({
  code: c?.code ?? '', name: c?.name ?? '', ipsasClass: c?.ipsasClass ?? 'INFRASTRUCTURE',
  capitalisationThreshold: c?.capitalisationThreshold ?? '0', defaultUsefulLifeMonths: c?.defaultUsefulLifeMonths?.toString() ?? '',
  defaultDepreciationMethod: c?.defaultDepreciationMethod ?? 'straight_line', defaultResidualPct: c?.defaultResidualPct ?? '0',
  componentisationRequired: c?.componentisationRequired ?? false,
  glAssetAccount: c?.glAssetAccount ?? '', glDepreciationAccount: c?.glDepreciationAccount ?? '',
  glAccumulatedDepreciationAccount: c?.glAccumulatedDepreciationAccount ?? '', glImpairmentAccount: c?.glImpairmentAccount ?? '',
  toBeConfirmed: c?.toBeConfirmed ?? false, active: c?.active ?? true,
});

/** Create or edit an asset class, validated with the shared contract (D19). */
export function AssetClassDialog({ assetClass, onClose }: { assetClass?: AssetClass; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(assetClass));
  const [error, setError] = useState('');
  const create = useCreateAssetClass();
  const update = useUpdateAssetClass(assetClass?.id ?? '');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const text = (k: string) => String(draft[k] ?? '');

  const save = () => {
    const parsed = assetClassSchema.safeParse({
      ...draft,
      defaultUsefulLifeMonths: text('defaultUsefulLifeMonths') ? text('defaultUsefulLifeMonths') : null,
      ...Object.fromEntries(['glAssetAccount', 'glDepreciationAccount', 'glAccumulatedDepreciationAccount', 'glImpairmentAccount']
        .map(k => [k, text(k).trim() || null])),
    });
    if (!parsed.success) { setError(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')); return; }
    const body: AssetClassInput = parsed.data;
    const done = { onSuccess: onClose };
    if (assetClass) update.mutate(body, done); else create.mutate(body, done);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label={assetClass ? 'Edit asset class' : 'New asset class'}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <h3 className="text-lg font-semibold text-v-charcoal">{assetClass ? `Edit ${assetClass.code}` : 'New asset class'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Code" placeholder="e.g. SGN" value={text('code')} onChange={set('code')} />
          <Input label="Name" value={text('name')} onChange={set('name')} />
          <div>
            <label htmlFor="ipsasClass" className="block text-sm font-medium text-v-charcoal mb-1">IPSAS class</label>
            <select id="ipsasClass" className={SELECT} value={text('ipsasClass')} onChange={set('ipsasClass')}>
              {Object.values(IpsasClass).map(v => <option key={v} value={v}>{IPSAS_LABELS[v]}</option>)}
            </select>
          </div>
          <Input label="Capitalisation threshold" type="number" step="0.01" min="0" value={text('capitalisationThreshold')} onChange={set('capitalisationThreshold')} />
          <Input label="Default useful life (months)" type="number" step="1" min="1" value={text('defaultUsefulLifeMonths')} onChange={set('defaultUsefulLifeMonths')} />
          <div>
            <label htmlFor="defaultDepreciationMethod" className="block text-sm font-medium text-v-charcoal mb-1">Default method</label>
            <select id="defaultDepreciationMethod" className={SELECT} value={text('defaultDepreciationMethod')} onChange={set('defaultDepreciationMethod')}>
              {Object.values(DepreciationMethod).map(v => <option key={v} value={v}>{METHOD_LABELS[v]}</option>)}
            </select>
          </div>
          <Input label="Default residual value (% of cost)" type="number" step="0.01" min="0" max="100" value={text('defaultResidualPct')} onChange={set('defaultResidualPct')} />
          <Input label="GL: asset account" value={text('glAssetAccount')} onChange={set('glAssetAccount')} />
          <Input label="GL: depreciation expense" value={text('glDepreciationAccount')} onChange={set('glDepreciationAccount')} />
          <Input label="GL: accumulated depreciation" value={text('glAccumulatedDepreciationAccount')} onChange={set('glAccumulatedDepreciationAccount')} />
          <Input label="GL: impairment" value={text('glImpairmentAccount')} onChange={set('glImpairmentAccount')} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!draft.componentisationRequired} onChange={set('componentisationRequired')} /> Held as components</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!draft.toBeConfirmed} onChange={set('toBeConfirmed')} /> Figures to be confirmed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!draft.active} onChange={set('active')} /> Active</label>
        </div>
        {assetClass && assetClass.assetCount > 0 && (
          <p className="text-xs text-amber-700">A new threshold applies at once to this class’s {assetClass.assetCount} assets, except those Finance has set by hand.</p>
        )}
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={create.isPending || update.isPending} onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}
