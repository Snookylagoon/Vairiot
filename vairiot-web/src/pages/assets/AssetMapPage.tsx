import { ArrowRight, List, MapPinOff, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AssetClusterMap } from '@/components/geo/AssetClusterMap';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAssetPositions } from '@/hooks/useAssets';
import { useCategories } from '@/hooks/useCategories';
import { useDebounce } from '@/hooks/useDebounce';
import { useSites } from '@/hooks/useSites';
import { STATUS_COLOURS } from '@/lib/assetMap';
import type { AssetMapPoint } from '@/types';

const SELECT = 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-v-pink';
const FILTER_KEYS = ['search', 'categoryId', 'siteId', 'status', 'condition'] as const;

/** All assets with a GIS position on one map. Shares its URL filters with the asset list. */
export function AssetMapPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || undefined])) as Record<typeof FILTER_KEYS[number], string | undefined>;

  const setFilter = useCallback((key: string, value: string) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSp]);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const debouncedSearch = useDebounce(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== (filters.search ?? '')) setFilter('search', debouncedSearch);
  }, [debouncedSearch, filters.search, setFilter]);

  const { data: categories = [] } = useCategories();
  const { data: sites = [] } = useSites();
  const { data, isLoading, isError, isPlaceholderData } = useAssetPositions(filters);
  const points = useMemo(() => data?.assets ?? [], [data]);

  const [selected, setSelected] = useState<AssetMapPoint | null>(null);
  // Drop the selection when the filters hide it.
  useEffect(() => {
    if (selected && !points.some((p) => p.id === selected.id)) setSelected(null);
  }, [points, selected]);

  // Previous results stay on screen while new ones load; only fit to fresh data.
  const fitKey = isPlaceholderData ? null : FILTER_KEYS.map((k) => filters[k] ?? '').join('|');
  const listHref = `/assets${sp.toString() ? `?${sp}` : ''}`;
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Asset Map</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data ? (
              <>
                {data.total.toLocaleString()} {data.total === 1 ? 'asset' : 'assets'} on the map
                {data.unplaced > 0 && <> · {data.unplaced.toLocaleString()} without a position</>}
              </>
            ) : 'Loading positions…'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate(listHref)}>
          <List size={16} className="mr-1.5" /> List view
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, serial, RFID…"
            aria-label="Search assets"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-v-pink"
          />
        </div>
        <select aria-label="Category" className={SELECT} value={filters.categoryId ?? ''} onChange={(e) => setFilter('categoryId', e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Site" className={SELECT} value={filters.siteId ?? ''} onChange={(e) => setFilter('siteId', e.target.value)}>
          <option value="">All sites</option>
          {sites.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Status" className={SELECT} value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_COLOURS).filter(([k]) => k !== 'other').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {hasFilters && (
          <button className="text-xs text-v-violet hover:underline pb-2"
            onClick={() => { setSearchInput(''); setSp(new URLSearchParams(), { replace: true }); }}>
            Clear filters
          </button>
        )}
      </div>

      {data?.truncated && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing the first {data.assets.length.toLocaleString()} of {data.total.toLocaleString()} positioned assets. Narrow the filters to see the rest.
        </p>
      )}

      <div className="relative">
        <AssetClusterMap
          points={points}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          fitKey={fitKey}
          className="h-[calc(100vh-17rem)] min-h-[420px]"
        />

        {!isLoading && !isError && points.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto max-w-sm bg-white/95 rounded-xl shadow-lg border border-gray-100 p-5 text-center space-y-2">
              <MapPinOff className="mx-auto text-v-violet" size={28} />
              <p className="font-semibold text-v-charcoal">
                {hasFilters ? 'No positioned assets match these filters' : 'No assets have a map position yet'}
              </p>
              <p className="text-sm text-gray-500">
                Add one from an asset's edit page, or capture it on site with the Vairiot mobile app.
              </p>
            </div>
          </div>
        )}
        {isError && (
          <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
            <p className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 text-sm">Couldn't load asset positions.</p>
          </div>
        )}

        {selected && (
          <div className="absolute right-3 top-3 z-10 w-72 max-w-[calc(100%-1.5rem)] bg-white rounded-xl shadow-lg border border-gray-100 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs text-v-violet">{selected.assetNumber}</p>
                <p className="font-semibold text-v-charcoal truncate">{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2">
              <Badge label={selected.status} variant={selected.status as 'active' | 'inactive'} />
              <Badge label={selected.condition} variant="default" />
            </div>
            <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {selected.category && <><dt className="text-gray-400">Category</dt><dd className="text-v-charcoal">{selected.category.name}</dd></>}
              {selected.site && <><dt className="text-gray-400">Site</dt><dd className="text-v-charcoal">{selected.site.name}</dd></>}
              {selected.location && <><dt className="text-gray-400">Location</dt><dd className="text-v-charcoal">{selected.location.name}</dd></>}
              <dt className="text-gray-400">Position</dt>
              <dd className="text-v-charcoal font-mono">
                {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}
                {selected.geoAccuracyMeters != null && <span className="font-sans text-gray-400"> ±{Math.round(selected.geoAccuracyMeters)} m</span>}
              </dd>
            </dl>
            <Link to={`/assets/${selected.id}`}
              className="flex items-center justify-center gap-1 w-full rounded-lg bg-v-gradient text-white text-sm font-semibold py-2 hover:opacity-90">
              Open asset <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500" aria-label="Legend">
        {Object.entries(STATUS_COLOURS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full border border-white shadow-sm" style={{ background: v.colour }} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}
