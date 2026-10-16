import { AlertTriangle, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAssetClasses, usePendingReview, useSetCategoryClass, type AssetClass } from '@/hooks/useAccounting';
import { useCategories } from '@/hooks/useCategories';
import { useCurrency } from '@/hooks/useCurrency';
import { AssetClassDialog } from '@/pages/accounting/AssetClassDialog';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';
const SECTION = 'bg-white rounded-xl border border-gray-100 p-6 space-y-4';
const months = (m: number | null) => (m ? `${m} months (${+(m / 12).toFixed(1)} years)` : '—');

/**
 * IPSAS asset classes (Phase 2, stage 2.3): the policies that set each asset's
 * recognition and depreciation defaults, which category falls into which class,
 * and the assets still waiting for a class or a cost (D20).
 */
export function AssetClassesPage() {
  const { data: classes = [], isLoading } = useAssetClasses();
  const { data: categories = [] } = useCategories();
  const { data: pending = [] } = usePendingReview();
  const setCategoryClass = useSetCategoryClass();
  const canWrite = useAuthStore(s => hasAnyPermission(s.user, 'accounting:write'));
  const { fmt } = useCurrency();
  const [editing, setEditing] = useState<AssetClass | 'new' | null>(null);
  const placeholders = classes.filter(c => c.toBeConfirmed).length;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Asset classes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each class sets the capitalisation threshold, default life, method and residual value, and the GL accounts.
            Assets below their class’s threshold are expensed.
          </p>
        </div>
        {canWrite && <Button onClick={() => setEditing('new')}><Plus size={16} className="mr-1.5" /> New class</Button>}
      </div>

      {placeholders > 0 && (
        <p className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={14} /> {placeholders} {placeholders === 1 ? 'class has' : 'classes have'} placeholder figures to be confirmed by the Accounting Policy Manual.
        </p>
      )}

      <section className={SECTION}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400 uppercase">
              <tr>
                <th className="py-2 pr-3">Class</th><th className="pr-3">IPSAS</th><th className="pr-3 text-right">Threshold</th>
                <th className="pr-3">Default life</th><th className="pr-3">GL asset</th><th className="pr-3 text-right">Assets</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && <tr><td colSpan={7} className="py-4 text-gray-400">Loading…</td></tr>}
              {classes.map(c => (
                <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs text-v-violet mr-2">{c.code}</span>{c.name}
                    {c.toBeConfirmed && <span className="ml-2"><Badge variant="yellow" label="To be confirmed" /></span>}
                    {!c.active && <span className="ml-2"><Badge variant="gray" label="Inactive" /></span>}
                  </td>
                  <td className="pr-3 text-xs">{c.ipsasClass.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="pr-3 text-right">{fmt(c.capitalisationThreshold)}</td>
                  <td className="pr-3">{months(c.defaultUsefulLifeMonths)}</td>
                  <td className="pr-3 font-mono text-xs">{c.glAssetAccount ?? '—'}</td>
                  <td className="pr-3 text-right">{c.assetCount}</td>
                  <td className="text-right">{canWrite && <button className="text-xs text-v-violet hover:underline" onClick={() => setEditing(c)}>Edit</button>}</td>
                </tr>
              ))}
              {!isLoading && classes.length === 0 && <tr><td colSpan={7} className="py-4 text-gray-400">No asset classes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={SECTION}>
        <div>
          <h2 className="font-semibold text-v-charcoal">Categories</h2>
          <p className="text-xs text-gray-500">A category’s class is used for its assets that have none of their own.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {categories.map((cat: { id: string; name: string; assetClassId?: string | null }) => (
            <label key={cat.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{cat.name}</span>
              <select aria-label={`Class for ${cat.name}`} className={FIELD} disabled={!canWrite} value={cat.assetClassId ?? ''}
                onChange={e => setCategoryClass.mutate({ categoryId: cat.id, assetClassId: e.target.value || null })}>
                <option value="">No class</option>
                {classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className={SECTION}>
        <div>
          <h2 className="font-semibold text-v-charcoal">Waiting for Finance ({pending.length})</h2>
          <p className="text-xs text-gray-500">Assets with no class, or no cost entered, are not yet recognised or expensed.</p>
        </div>
        {pending.length === 0 ? <p className="text-sm text-gray-400">Nothing waiting.</p> : (
          <ul className="divide-y divide-gray-50 text-sm">
            {pending.slice(0, 200).map(a => (
              <li key={a.id} className="flex items-center justify-between py-1.5">
                <Link to={`/assets/${a.id}`} className="hover:text-v-violet">
                  <span className="font-mono text-xs text-v-violet mr-2">{a.assetNumber}</span>{a.name}
                  {a.category && <span className="text-gray-400"> · {a.category.name}</span>}
                </Link>
                <Badge variant="yellow" label={a.reason === 'no_class' ? 'No class' : 'No cost'} />
              </li>
            ))}
          </ul>
        )}
        {pending.length > 200 && <p className="text-xs text-gray-400">Showing the first 200.</p>}
      </section>

      {editing && <AssetClassDialog assetClass={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
