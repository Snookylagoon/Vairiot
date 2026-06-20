import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import { useFixedAssetRegister } from '@/hooks/useReports';
import { useCategories } from '@/hooks/useCategories';
import { useSites } from '@/hooks/useSites';
import { useCurrency } from '@/hooks/useCurrency';

interface FixedAssetRow {
  assetNumber: string;
  name: string;
  category: string | null;
  site: string | null;
  status: string;
  condition: string;
  purchaseCost: number;
  capitalizedCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
}

export function FixedAssetsPage() {
  const navigate = useNavigate();
  const { fmt: fmtCurrency } = useCurrency();
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, extras, setExtra } =
    useUrlTableState(['categoryId', 'siteId']);
  const { categoryId, siteId } = extras;

  const filters: Record<string, string> = {};
  if (categoryId) filters.categoryId = categoryId;
  if (siteId) filters.siteId = siteId;
  if (search) filters.search = search;
  if (sortBy) { filters.sortBy = sortBy; filters.sortOrder = sortOrder; }

  const { data: rows = [], isLoading } = useFixedAssetRegister(filters);
  const { data: categories = [] } = useCategories();
  const { data: sites = [] } = useSites();

  const totals = rows.reduce((acc, r) => ({
    purchaseCost: acc.purchaseCost + r.purchaseCost,
    capitalizedCost: acc.capitalizedCost + r.capitalizedCost,
    netBookValue: acc.netBookValue + r.netBookValue,
  }), { purchaseCost: 0, capitalizedCost: 0, netBookValue: 0 });


  const columns: DataTableColumn<FixedAssetRow>[] = [
    {
      key: 'assetNumber', label: 'Asset',
      render: r => (<><span className="font-mono text-xs text-v-violet">{r.assetNumber}</span><span className="ml-2">{r.name}</span></>),
    },
    { key: 'category', label: 'Category', render: r => <span className="text-gray-600">{r.category ?? '—'}</span> },
    { key: 'site', label: 'Site', render: r => <span className="text-gray-600">{r.site ?? '—'}</span> },
    { key: 'status', label: 'Status', render: r => <span className="capitalize text-gray-600">{r.status}</span> },
    {
      key: 'purchaseCost', label: 'Purchase',
      render: r => <span className="font-mono">{fmtCurrency(r.purchaseCost)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
    {
      key: 'capitalizedCost', label: 'Cap. Cost',
      render: r => <span className="font-mono">{fmtCurrency(r.capitalizedCost)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
    {
      key: 'netBookValue', label: 'NBV',
      render: r => <span className="font-mono font-semibold">{fmtCurrency(r.netBookValue)}</span>,
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
          <h1 className="text-2xl font-bold text-v-charcoal">Fixed Asset Register</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} assets</p>
        </div>
        <ReportExportButton reportType="fixed-asset-register" filters={filters} disabled={rows.length === 0} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Purchase Cost</p><p className="text-xl font-bold text-v-charcoal mt-1">{fmtCurrency(totals.purchaseCost)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Capitalized Cost</p><p className="text-xl font-bold text-v-mauve mt-1">{fmtCurrency(totals.capitalizedCost)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total NBV</p><p className="text-xl font-bold text-v-violet mt-1">{fmtCurrency(totals.netBookValue)}</p></CardBody></Card>
      </div>

      <DataTable<FixedAssetRow>
        columns={columns}
        rows={rows as FixedAssetRow[]}
        getRowKey={r => r.assetNumber}
        isLoading={isLoading}
        emptyMessage="No assets match these filters"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search asset, category, serial…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
      />
    </div>
  );
}
