import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Plus, Package, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useCategories } from '@/hooks/useCategories';
import { useSites } from '@/hooks/useSites';
import { useAssets } from '@/hooks/useAssets';
import { useDebounce } from '@/hooks/useDebounce';
import { hasPermission, useAuthStore } from '@/stores/auth.store';
import type { Asset } from '@/types';

const PAGE_SIZE = 25;

const SORT_COLUMNS: readonly { key: string; label: string; sortable?: boolean }[] = [
  { key: 'assetNumber', label: 'Asset No.' },
  { key: 'name',        label: 'Name' },
  { key: 'category',    label: 'Category', sortable: false },
  { key: 'site',        label: 'Site',     sortable: false },
  { key: 'status',      label: 'Status' },
  { key: 'condition',   label: 'Condition' },
];

function useUrlState() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) || '';
  const set = useCallback((updates: Record<string, string>) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v); else next.delete(k);
      }
      return next;
    }, { replace: true });
  }, [setSp]);
  return { get, set };
}

export function AssetsPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canWrite = hasPermission(user, 'asset:write');
  const { get, set } = useUrlState();

  const search     = get('search');
  const page       = Number(get('page')) || 1;
  const categoryId = get('categoryId');
  const siteId     = get('siteId');
  const status     = get('status');
  const condition  = get('condition');
  const sortBy     = get('sortBy');
  const sortOrder  = get('sortOrder');

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebounce(searchInput, 300);

  const setPage = (p: number) => set({ page: p > 1 ? String(p) : '' });

  useEffect(() => {
    if (debouncedSearch !== search) {
      set({ search: debouncedSearch, page: '' });
    }
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showFilters, setShowFilters] = useState(
    Boolean(categoryId || siteId || status || condition),
  );

  const { data: categories = [] } = useCategories();
  const { data: sites = [] }      = useSites();

  const activeFilterCount = [categoryId, siteId, status, condition].filter(Boolean).length;

  const { data, isLoading, isPlaceholderData } = useAssets({
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
    categoryId: categoryId || undefined,
    siteId: siteId || undefined,
    status: status || undefined,
    condition: condition || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
  });

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: '' });
    } else {
      set({ sortBy: col, sortOrder: 'asc', page: '' });
    }
  };

  const clearFilters = () => {
    setCategoryId(''); setSiteId(''); setStatus(''); setCondition('');
  };
  function setCategoryId(v: string) { set({ categoryId: v, page: '' }); }
  function setSiteId(v: string)     { set({ siteId: v, page: '' }); }
  function setStatus(v: string)     { set({ status: v, page: '' }); }
  function setCondition(v: string)  { set({ condition: v, page: '' }); }

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryId) params.set('categoryId', categoryId);
    if (siteId) params.set('siteId', siteId);
    if (status) params.set('status', status);
    if (condition) params.set('condition', condition);
    const qs = params.toString();
    const r = await api.get(`/api/v1/assets/export.csv${qs ? `?${qs}` : ''}`, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = `assets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Assets</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total assets</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download size={16} className="mr-1.5" /> Export CSV
          </Button>
          {canWrite && (
            <Button onClick={() => navigate('/assets/new')}>
              <Plus size={16} className="mr-1.5" /> New Asset
            </Button>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); }}
              placeholder="Search by name, serial, barcode, RFID…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} className="mr-1" />
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </Button>
          {activeFilterCount > 0 && (
            <button
              className="text-xs text-v-violet hover:underline"
              onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 bg-white rounded-lg border border-gray-100 p-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">Category</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
                <option value="">All categories</option>
                {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">Site</label>
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
                <option value="">All sites</option>
                {sites.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
                <option value="disposed">Disposed</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-500">Condition</label>
              <select
                value={condition}
                onChange={e => setCondition(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
                <option value="">All conditions</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <div className={`overflow-x-auto transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {SORT_COLUMNS.map(col => {
                  const isSortable = col.sortable !== false;
                  const isActive = sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={isSortable ? () => toggleSort(col.key) : undefined}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${isSortable ? 'cursor-pointer select-none hover:text-v-charcoal' : ''}`}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {isSortable && (
                          isActive
                            ? (sortOrder === 'asc' ? <ArrowUp size={12} className="text-v-violet" /> : <ArrowDown size={12} className="text-v-violet" />)
                            : <ArrowUpDown size={12} className="text-gray-300" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading && !data && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {data?.assets.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <Package size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm">No assets found</p>
                </td></tr>
              )}
              {data?.assets.map((a: Asset) => (
                <tr key={a.id}
                  onClick={() => navigate(`/assets/${a.id}`)}
                  className="border-b border-gray-50 hover:bg-v-wash cursor-pointer transition-colors last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-v-violet">{a.assetNumber}</td>
                  <td className="px-4 py-3 font-medium text-v-charcoal">{a.name}</td>
                  <td className="px-4 py-3 text-gray-500">{a.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{a.site?.name ?? '—'}</td>
                  <td className="px-4 py-3"><Badge label={a.status} variant={a.status as 'active'|'inactive'} /></td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{a.condition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <PageNumbers current={page} total={totalPages} onSelect={setPage} />
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function PageNumbers({ current, total, onSelect }: { current: number; total: number; onSelect: (p: number) => void }) {
  const pages: (number | '…')[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push('…');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('…');
    pages.push(total);
  }
  return (
    <>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`min-w-[28px] h-7 rounded text-xs font-medium transition-colors ${
              p === current
                ? 'bg-v-violet text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {p}
          </button>
        ),
      )}
    </>
  );
}
