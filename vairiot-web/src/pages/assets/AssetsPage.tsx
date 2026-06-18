import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Package, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { AssetListResponse, Asset } from '@/types';

export function AssetsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);

  const { data, isLoading } = useQuery<AssetListResponse>({
    queryKey: ['assets', { search, page }],
    queryFn:  () => api.get('/api/v1/assets', { params: { search, page, pageSize: 25 } }).then(r => r.data),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Assets</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total ?? 0} total assets</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={async () => {
            const r = await api.get('/api/v1/assets/export.csv', { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement('a');
            a.href = url; a.download = `assets-${new Date().toISOString().slice(0,10)}.csv`;
            a.click(); URL.revokeObjectURL(url);
          }}>
            <Download size={16} className="mr-1.5" /> Export CSV
          </Button>
          <Button onClick={() => navigate('/assets/new')}>
            <Plus size={16} className="mr-1.5" /> New Asset
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by name, serial, barcode, RFID…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink"
        />
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Asset No.','Name','Category','Site','Status','Condition'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
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
        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {data.page} of {data.totalPages}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1}              onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
