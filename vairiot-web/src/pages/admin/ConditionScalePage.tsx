import { useEffect, useState } from 'react';
import { DEFAULT_CONDITION_SCALE, type ConditionScaleEntry } from 'vairiot-shared';

import { Button } from '@/components/ui/Button';
import { useCategories } from '@/hooks/useCategories';
import { useConditionScale, usePhotoRules, useSaveConditionScale, useSavePhotoRules, type PhotoRules } from '@/hooks/useCondition';

const FIELD = 'w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-v-pink';
const SOURCE: Record<string, string> = {
  category: 'This category has its own scale.',
  tenant: 'Using the organisation scale.',
  default: 'Using the built-in scale.',
};

/** Condition scale per category and photo rules (Phase 1 W5, stage 1.14). */
export function ConditionScalePage() {
  const { data: categories = [] } = useCategories();
  const [categoryId, setCategoryId] = useState('');
  const { data: scale } = useConditionScale(categoryId || null);
  const save = useSaveConditionScale();
  const [rows, setRows] = useState<ConditionScaleEntry[]>([...DEFAULT_CONDITION_SCALE]);
  useEffect(() => { if (scale) setRows(scale.entries.map(e => ({ ...e }))); }, [scale]);

  const edit = (grade: number, patch: Partial<ConditionScaleEntry>) =>
    setRows(prev => prev.map(r => (r.grade === grade ? { ...r, ...patch } : r)));
  const ownScale = categoryId ? scale?.source === 'category' : scale?.source === 'tenant';

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Condition scale</h1>
        <p className="text-sm text-gray-500 mt-1">
          Grades 1–5 used by the field apps and the web. Categories may set their own criteria. Grades marked
          “Photo” warn at zone submission when a scan has no photo; “Impairment” feeds IPSAS impairment checks.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Scale for" className={`${FIELD} w-auto`} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Organisation (all categories)</option>
            {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {scale && <span className="text-xs text-gray-500">{SOURCE[scale.source]}</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400">
              <th className="py-1 w-12">Grade</th><th>Label</th><th>Criteria</th><th className="w-20">Colour</th>
              <th className="w-20 text-center">Photo</th><th className="w-24 text-center">Impairment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.grade} className="align-top">
                <td className="py-1.5 font-mono font-semibold">{r.grade}</td>
                <td className="py-1.5 pr-2"><input aria-label={`Label for grade ${r.grade}`} className={FIELD} value={r.label} onChange={e => edit(r.grade, { label: e.target.value })} /></td>
                <td className="py-1.5 pr-2"><textarea aria-label={`Criteria for grade ${r.grade}`} rows={2} className={FIELD} value={r.criteria} onChange={e => edit(r.grade, { criteria: e.target.value })} /></td>
                <td className="py-1.5"><input type="color" aria-label={`Colour for grade ${r.grade}`} value={r.colour} onChange={e => edit(r.grade, { colour: e.target.value })} /></td>
                <td className="py-1.5 text-center"><input type="checkbox" aria-label={`Photo required at grade ${r.grade}`} checked={r.photoRequired} onChange={e => edit(r.grade, { photoRequired: e.target.checked })} /></td>
                <td className="py-1.5 text-center"><input type="checkbox" aria-label={`Impairment indicator at grade ${r.grade}`} checked={r.impairmentIndicator} onChange={e => edit(r.grade, { impairmentIndicator: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2">
          <Button loading={save.isPending} onClick={() => save.mutate({ categoryId: categoryId || null, entries: rows })}>Save scale</Button>
          {ownScale && (
            <Button variant="secondary" onClick={() => save.mutate({ categoryId: categoryId || null, entries: null })}>
              {categoryId ? 'Use the organisation scale' : 'Use the built-in scale'}
            </Button>
          )}
        </div>
      </section>

      <PhotoRulesSection categories={categories} />
    </div>
  );
}

function PhotoRulesSection({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const { data } = usePhotoRules();
  const save = useSavePhotoRules();
  const [rules, setRules] = useState<PhotoRules>({ defaultMinPhotos: 0, categories: [] });
  useEffect(() => { if (data) setRules(data); }, [data]);
  const minFor = (id: string) => rules.categories.find(c => c.categoryId === id)?.minPhotosAtInventory;
  const setMin = (id: string, value: string) => setRules(prev => ({
    ...prev,
    categories: value === ''
      ? prev.categories.filter(c => c.categoryId !== id)
      : [...prev.categories.filter(c => c.categoryId !== id), { categoryId: id, minPhotosAtInventory: Number(value) }],
  }));
  const options = [0, 1, 2, 3, 4];

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-v-charcoal">Photos at inventory</h2>
        <p className="text-xs text-gray-500 mt-0.5">Minimum photos per scanned asset. Zone submission lists scans that fall short; it does not block.</p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="w-56">All categories</span>
        <select aria-label="Minimum photos for all categories" className={`${FIELD} w-24`} value={rules.defaultMinPhotos}
          onChange={e => setRules(prev => ({ ...prev, defaultMinPhotos: Number(e.target.value) }))}>
          {options.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {categories.map(c => (
        <label key={c.id} className="flex items-center gap-3 text-sm">
          <span className="w-56 truncate">{c.name}</span>
          <select aria-label={`Minimum photos for ${c.name}`} className={`${FIELD} w-24`} value={minFor(c.id) ?? ''} onChange={e => setMin(c.id, e.target.value)}>
            <option value="">As above</option>
            {options.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      ))}
      <Button loading={save.isPending} onClick={() => save.mutate(rules)}>Save photo rules</Button>
    </section>
  );
}
