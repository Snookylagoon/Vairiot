import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useCurrency } from '@/hooks/useCurrency';
import { useMaintenanceCostReport } from '@/hooks/useReports';
import { useUrlTableState } from '@/hooks/useUrlTableState';

interface MaintCostRow {
  assetNumber: string;
  assetName: string;
  maintenanceType: string;
  vendor: string | null;
  cost: number;
  completedDate: string | null;
}

export function MaintenanceCostsPage() {
  const navigate = useNavigate();
  const { fmt: fmtCurrency } = useCurrency();
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, extras, setExtra } =
    useUrlTableState(['from', 'to']);
  const { from, to } = extras;

  const filters: Record<string, string> = {};
  if (from) filters.from = from;
  if (to) filters.to = to;
  if (search) filters.search = search;
  if (sortBy) { filters.sortBy = sortBy; filters.sortOrder = sortOrder; }

  const { data, isLoading } = useMaintenanceCostReport(filters);
  const rows = data?.rows ?? [];
  const totalCost = data?.totalCost ?? 0;
  const totalEvents = data?.totalEvents ?? 0;


  const columns: DataTableColumn<MaintCostRow>[] = [
    {
      key: 'assetNumber', label: 'Asset',
      render: r => (<><span className="font-mono text-xs text-v-violet">{r.assetNumber}</span><span className="ml-2">{r.assetName}</span></>),
    },
    { key: 'maintenanceType', label: 'Type', render: r => <span className="capitalize text-gray-600">{r.maintenanceType}</span> },
    { key: 'vendor', label: 'Vendor', render: r => <span className="text-gray-600">{r.vendor ?? '—'}</span> },
    {
      key: 'completedDate', label: 'Completed',
      render: r => <span className="text-gray-600">{r.completedDate ? new Date(r.completedDate).toLocaleDateString('en-GB') : '—'}</span>,
    },
    {
      key: 'cost', label: 'Cost',
      render: r => <span className="font-mono font-semibold">{fmtCurrency(r.cost)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
  ];

  const toolbar = (
    <>
      <label className="text-sm text-gray-500">From</label>
      <input type="date" value={from} onChange={e => setExtra('from', e.target.value)} className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white" />
      <label className="text-sm text-gray-500">To</label>
      <input type="date" value={to} onChange={e => setExtra('to', e.target.value)} className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white" />
    </>
  );

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/reports')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Reports
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Maintenance Costs</h1>
          <p className="text-sm text-gray-500 mt-1">{totalEvents} completed maintenance events</p>
        </div>
        <ReportExportButton reportType="maintenance-log" filters={filters} disabled={rows.length === 0} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Events</p><p className="text-xl font-bold text-v-charcoal mt-1">{totalEvents}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Cost</p><p className="text-xl font-bold text-v-violet mt-1">{fmtCurrency(totalCost)}</p></CardBody></Card>
      </div>

      <DataTable<MaintCostRow>
        columns={columns}
        rows={rows as MaintCostRow[]}
        getRowKey={(r) => `${r.assetNumber}-${r.completedDate ?? ''}-${r.maintenanceType}`}
        isLoading={isLoading}
        emptyMessage="No completed maintenance in this range"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search asset, vendor, type…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
      />
    </div>
  );
}
