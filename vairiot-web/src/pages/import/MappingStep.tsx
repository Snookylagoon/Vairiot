import { useMemo, useState } from 'react';
import { suggestImportMapping, type ImportField, type ImportMappingInput, type ModuleKey } from 'vairiot-shared';

import { Button } from '@/components/ui/Button';
import { useSaveMapping, useSavedMappings, useSetMapping, type ImportBatch } from '@/hooks/useImport';
import { hasFeature, useAuthStore } from '@/stores/auth.store';

const FIELD = 'rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white';

/** What a column can become; module fields show only with their module on (D7). */
export const IMPORT_FIELD_LABELS: Array<{ key: ImportField; label: string; feature?: ModuleKey; hint?: string }> = [
  { key: 'name', label: 'Asset name', hint: 'Required for new assets' },
  { key: 'financeRef', label: 'Finance reference', hint: 'The key in update mode' },
  { key: 'legacyAssetNumber', label: 'Legacy asset number', hint: 'Kept as a reference; Vairiot numbers the asset' },
  { key: 'description', label: 'Description' },
  { key: 'categoryName', label: 'Category' },
  { key: 'classCode', label: 'Asset class code', feature: 'ipsas' },
  { key: 'siteName', label: 'Site' },
  { key: 'custodian', label: 'Custodian' },
  { key: 'latitude', label: 'Latitude', feature: 'gis' },
  { key: 'longitude', label: 'Longitude', feature: 'gis' },
  { key: 'condition', label: 'Condition' },
  { key: 'conditionGrade', label: 'Condition grade (1–5)' },
  { key: 'status', label: 'Status' },
  { key: 'serialNumber', label: 'Serial number' },
  { key: 'modelNumber', label: 'Model number' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'barcode', label: 'Manufacturer EAN' },
  { key: 'rfidTag', label: 'RFID tag' },
  { key: 'purchaseCost', label: 'Purchase cost' },
  { key: 'purchaseDate', label: 'Purchase date' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'warrantyExpiry', label: 'Warranty expiry' },
  { key: 'purchaseOrderNumber', label: 'PO number' },
  { key: 'invoiceNumber', label: 'Invoice number' },
  { key: 'residualValue', label: 'Residual value' },
  { key: 'usefulLifeMonths', label: 'Useful life (months)' },
  { key: 'depreciationMethod', label: 'Depreciation method' },
  { key: 'depreciationStartDate', label: 'Depreciation start date' },
  { key: 'notes', label: 'Notes' },
];

/**
 * Which column becomes which field (stage 2.14): a first guess from the
 * headers, a saved mapping, or the profiler's JSON; how dates and decimals are
 * written. Applying it checks every row.
 */
export function MappingStep({ batch, onDone }: { batch: ImportBatch; onDone?: () => void }) {
  const user = useAuthStore(s => s.user);
  const setMapping = useSetMapping(batch.id);
  const save = useSaveMapping();
  const { data: saved = [] } = useSavedMappings();
  const fields = IMPORT_FIELD_LABELS.filter(f => !f.feature || hasFeature(user, f.feature));
  const initial = useMemo(() => batch.mapping?.fields ?? suggestImportMapping(batch.columns), [batch.mapping, batch.columns]);
  const [map, setMap] = useState<Partial<Record<ImportField, string>>>(initial);
  const [dateFormat, setDateFormat] = useState(batch.mapping?.transforms?.dateFormat ?? 'DMY');
  const [decimalSeparator, setDecimalSeparator] = useState(batch.mapping?.transforms?.decimalSeparator ?? '.');
  const [saveAs, setSaveAs] = useState('');

  const mapping = (): ImportMappingInput => ({
    fields: Object.fromEntries(Object.entries(map).filter(([, c]) => c)) as Record<ImportField, string>,
    transforms: { dateFormat, decimalSeparator, lookups: batch.mapping?.transforms?.lookups ?? {} },
  });
  const apply = (m: ImportMappingInput) => {
    setMap(m.fields);
    if (m.transforms?.dateFormat) setDateFormat(m.transforms.dateFormat);
    if (m.transforms?.decimalSeparator) setDecimalSeparator(m.transforms.decimalSeparator);
  };
  const key = batch.mode === 'UPDATE' ? 'financeRef' : 'name';
  const fromProfile = async (file?: File) => {
    if (!file) return;
    try { setMapping.mutate({ profile: JSON.parse(await file.text()) }, { onSuccess: onDone }); } catch { /* the API says why */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        {saved.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Use a saved mapping</span>
            <select aria-label="Saved mapping" className={FIELD} defaultValue="" onChange={e => { const m = saved.find(x => x.id === e.target.value); if (m) apply(m.mapping); }}>
              <option value="">—</option>
              {saved.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Or the profiler&apos;s mapping (.json)</span>
          <input aria-label="Profiler mapping" type="file" accept=".json,application/json" className="text-xs" onChange={e => fromProfile(e.target.files?.[0])} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Dates written</span>
          <select aria-label="Date order" className={FIELD} value={dateFormat} onChange={e => setDateFormat(e.target.value as 'DMY')}>
            <option value="DMY">Day first (31.12.2026)</option><option value="MDY">Month first (12/31/2026)</option><option value="YMD">Year first (2026-12-31)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Decimals written</span>
          <select aria-label="Decimal separator" className={FIELD} value={decimalSeparator} onChange={e => setDecimalSeparator(e.target.value as '.')}>
            <option value=".">1,234.50</option><option value=",">1 234,50</option>
          </select>
        </label>
      </div>

      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {fields.map(f => (
          <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-v-charcoal">{f.label}{f.key === key && <span className="text-red-500"> *</span>}{f.hint && <span className="block text-xs text-gray-400">{f.hint}</span>}</span>
            <select aria-label={`Column for ${f.label}`} className={`${FIELD} w-48`} value={map[f.key] ?? ''} onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value || undefined }))}>
              <option value="">— not imported —</option>
              {batch.columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
        <Button disabled={!map[key]} loading={setMapping.isPending} onClick={() => setMapping.mutate({ mapping: mapping() }, { onSuccess: onDone })}>Check the rows</Button>
        {!map[key] && <span className="text-xs text-red-600">Map a column to the {key === 'name' ? 'asset name' : 'finance reference'}.</span>}
        <span className="flex-1" />
        <input aria-label="Mapping name" placeholder="Save as…" className={`${FIELD} w-48`} value={saveAs} onChange={e => setSaveAs(e.target.value)} />
        <Button variant="secondary" size="sm" disabled={!saveAs.trim()} loading={save.isPending} onClick={() => save.mutate({ name: saveAs.trim(), mapping: mapping() }, { onSuccess: () => setSaveAs('') })}>Save mapping</Button>
      </div>
    </div>
  );
}
