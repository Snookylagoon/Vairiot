import { ArrowLeft, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import { useAgingReport } from '@/hooks/useReports';
import { useCategories } from '@/hooks/useCategories';
import { useSites } from '@/hooks/useSites';
import { useCurrency } from '@/hooks/useCurrency';

const BUCKET_COLOURS: Record<string, string> = {
  '0-1y': 'bg-emerald-500', '1-3y': 'bg-sky-500', '3-5y': 'bg-amber-500',
  '5-10y': 'bg-orange-500', '10y+': 'bg-red-500',
};

interface AgingRow {
  assetNumber: string;
  name: string;
  category: string | null;
  site: string | null;
  status: string;
  purchaseDate: string;
  purchaseCost: number;
  ageMonths: number;
}

export function AgingPage() {
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, extras, setExtra } =
    useUrlTableState(['categoryId', 'siteId']);
  const { categoryId, siteId } = extras;

  const filters: Record<string, string> = {};
  if (categoryId) filters.categoryId = categoryId;
  if (siteId) filters.siteId = siteId;
  if (search) filters.search = search;
  if (sortBy) { filters.sortBy = sortBy; filters.sortOrder = sortOrder; }

  const { data, isLoading } = useAgingReport(filters);
  const { data: categories = [] } = useCategories();
  const { data: sites = [] } = useSites();
  const rows = data?.rows ?? [];
  const buckets = data?.buckets ?? {};
  const total = data?.totalAssets ?? 0;

  const downloadCsv = () => {
    const header = 'Asset Number,Name,Category,Site,Status,Purchase Date,Purchase Cost,Age (months)\n';
    const csv = rows.map(r =>
      `"${r.assetNumber}","${r.name}","${r.category ?? ''}","${r.site ?? ''}","${r.status}","${new Date(r.purchaseDate).toLocaleDateString('en-GB')}",${r.purchaseCost},${r.ageMonths}`
    ).join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'asset-aging.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataTableColumn<AgingRow>[] = [
    {
      key: 'assetNumber', label: 'Asset',
      render: r => (
        <>
          <span className="font-mono text-xs text-v-violet">{r.assetNumber}</span>
          <span className="ml-2">{r.name}</span>
        </>
      ),
    },
    { key: 'category', label: 'Category', render: r => <span className="text-gray-600">{r.category ?? '—'}</span> },
    { key: 'site', label: 'Site', render: r => <span className="text-gray-600">{r.site ?? '—'}</span> },
    {
      key: 'purchaseDate', label: 'Purchase Date',
      render: r => <span className="text-gray-600">{new Date(r.purchaseDate).toLocaleDateString('en-GB')}</span>,
    },
    {
      key: 'ageMonths', label: 'Age (mo)',
      render: r => <span className="font-mono">{r.ageMonths}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
    {
      key: 'purchaseCost', label: 'Cost',
      render: r => <span className="font-mono">{fmt(r.purchaseCost)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
  ];

  const toolbar = (
    <>
      <select value={categoryId} onChange={e => setExtra('categoryId', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white">
        <option value="">All Categories</option>
        {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={siteId} onChange={e => setExtra('siteId', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white">
        <option value="">All Sites</option>
        {sites.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </>
  );

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/reports')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Reports
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Asset Aging</h1>
          <p className="text-sm text-gray-500 mt-1">{total} assets with a purchase date</p>
        </div>
        <Button variant="secondary" size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardBody>
          <div className="flex h-8 w-full overflow-hidden rounded-lg bg-gray-100">
            {Object.entries(buckets).filter(([, n]) => n > 0).map(([bucket, n]) => (
              <div key={bucket} className={`${BUCKET_COLOURS[bucket] ?? 'bg-v-violet'} h-full flex items-center justify-center text-white text-xs font-medium`}
                style={{ width: `${(n / (total || 1)) * 100}%` }}
                title={`${bucket}: ${n}`}>
                {(n / (total || 1)) * 100 > 8 ? `${bucket} (${n})` : ''}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            {Object.entries(buckets).map(([bucket, n]) => (
              <div key={bucket} className="flex items-center gap-1.5">
                <span className={`inline-block size-2.5 rounded-full ${BUCKET_COLOURS[bucket]}`} />
                <span className="text-gray-600">{bucket}</span>
                <span className="font-medium text-v-charcoal">{n}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <DataTable<AgingRow>
        columns={columns}
        rows={rows as AgingRow[]}
        getRowKey={r => r.assetNumber}
        isLoading={isLoading}
        emptyMessage="No assets match these filters"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search asset, category, site…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
      />
    </div>
  );
}
