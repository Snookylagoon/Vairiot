import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DEFAULT_BASE_MAP, useBaseMap, useSaveBaseMap, type MapSettings } from '@/hooks/useBaseMap';

const FIELDS: Array<{ key: keyof MapSettings; label: string; hint?: string; numeric?: boolean }> = [
  { key: 'tileUrl', label: 'Tile URL', hint: 'An https address with {z}, {x} and {y}, e.g. your own tile server' },
  { key: 'attribution', label: 'Attribution', hint: 'Plain text shown in the map corner, as the tile licence requires' },
  { key: 'centreLatitude', label: 'Default centre latitude', numeric: true },
  { key: 'centreLongitude', label: 'Default centre longitude', numeric: true },
  { key: 'zoom', label: 'Default zoom (1–19)', numeric: true },
];

/** Base map for the tenant's web maps (Phase 1 W4, stage 1.12). */
export function MapSettingsPage() {
  const current = useBaseMap();
  const save = useSaveBaseMap();
  const [form, setForm] = useState<Record<keyof MapSettings, string>>(() => toForm(current));
  useEffect(() => { setForm(toForm(current)); }, [current]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      tileUrl: form.tileUrl.trim(),
      attribution: form.attribution.trim(),
      centreLatitude: Number(form.centreLatitude),
      centreLongitude: Number(form.centreLongitude),
      zoom: Number(form.zoom),
    });
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Map settings</h1>
        <p className="text-sm text-gray-500 mt-1">The base map and starting view for the asset map and position picker.</p>
      </div>
      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        {FIELDS.map(f => (
          <Input key={f.key} label={f.label} hint={f.hint} inputMode={f.numeric ? 'decimal' : undefined}
            value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
        ))}
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending}>Save</Button>
          <Button type="button" variant="secondary" onClick={() => setForm(toForm(DEFAULT_BASE_MAP))}>
            Use OpenStreetMap defaults
          </Button>
        </div>
      </form>
    </div>
  );
}

function toForm(s: MapSettings): Record<keyof MapSettings, string> {
  return {
    tileUrl: s.tileUrl, attribution: s.attribution,
    centreLatitude: String(s.centreLatitude), centreLongitude: String(s.centreLongitude), zoom: String(s.zoom),
  };
}
