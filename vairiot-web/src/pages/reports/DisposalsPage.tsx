import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ReportExportButton } from '@/components/reports/ReportExportButton';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useCurrency } from '@/hooks/useCurrency';
import { useDisposalReport } from '@/hooks/useReports';
import { useUrlTableState } from '@/hooks/useUrlTableState';

interface DisposalRow {
  assetNumber: string;
  assetName: string;
  disposalDate: string;
  disposalMethod: string;
  disposalValue: number;
  netBookValueAtDisposal: number;
  gainLoss: number;
}

export function DisposalsPage() {
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

  const { data, isLoading } = useDisposalReport(filters);
  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { count: 0, totalDisposalValue: 0, totalNBV: 0, totalGainLoss: 0 };


  const columns: DataTableColumn<DisposalRow>[] = [
    {
      key: 'assetNumber', label: 'Asset',
      render: r => (<><span className="font-mono text-xs text-v-violet">{r.assetNumber}</span><span className="ml-2">{r.assetName}</span></>),
    },
    { key: 'disposalDate', label: 'Date', render: r => <span className="text-gray-600">{new Date(r.disposalDate).toLocaleDateString('en-GB')}</span> },
    { key: 'disposalMethod', label: 'Method', render: r => <span className="capitalize text-gray-600">{r.disposalMethod}</span> },
    {
      key: 'disposalValue', label: 'Disposal Value',
      render: r => <span className="font-mono">{fmtCurrency(r.disposalValue)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
    {
      key: 'netBookValueAtDisposal', label: 'NBV',
      render: r => <span className="font-mono">{fmtCurrency(r.netBookValueAtDisposal)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
    {
      key: 'gainLoss', label: 'Gain/Loss',
      render: r => <span className={`font-mono font-semibold ${r.gainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtCurrency(r.gainLoss)}</span>,
      className: 'px-4 py-3 text-right', headerClassName: 'px-4 py-3 text-right',
    },
  ];

  const toolbar = (
    <>
      <label className="text-sm text-gray-500">From</label>
      <input type="date" value={from} onChange={e => setExtra('from', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white" />
      <label className="text-sm text-gray-500">To</label>
      <input type="date" value={to} onChange={e => setExtra('to', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white" />
    </>
  );

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/reports')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-v-violet transition-colors">
        <ArrowLeft size={16} /> Back to Reports
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Disposal Report</h1>
          <p className="text-sm text-gray-500 mt-1">{totals.count} disposals</p>
        </div>
        <ReportExportButton reportType="disposal-register" filters={filters} disabled={rows.length === 0} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Disposals</p><p className="text-xl font-bold text-v-charcoal mt-1">{totals.count}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Disposal Value</p><p className="text-xl font-bold text-v-charcoal mt-1">{fmtCurrency(totals.totalDisposalValue)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total NBV at Disposal</p><p className="text-xl font-bold text-v-mauve mt-1">{fmtCurrency(totals.totalNBV)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Gain / Loss</p><p className={`text-xl font-bold mt-1 ${totals.totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtCurrency(totals.totalGainLoss)}</p></CardBody></Card>
      </div>

      <DataTable<DisposalRow>
        columns={columns}
        rows={rows as DisposalRow[]}
        getRowKey={(_r) => `${(_r.assetNumber)}-${_r.disposalDate}`}
        isLoading={isLoading}
        emptyMessage="No disposals in this range"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search asset, method, reason…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
      />
    </div>
  );
}
