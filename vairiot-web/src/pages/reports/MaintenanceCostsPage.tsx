import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useMaintenanceCostReport } from '@/hooks/useReports';

function fmtCurrency(v: number) {
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MaintenanceCostsPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters = { ...(from && { from }), ...(to && { to }) };
  const { data, isLoading } = useMaintenanceCostReport(filters);
  const rows = data?.rows ?? [];
  const totalCost = data?.totalCost ?? 0;
  const totalEvents = data?.totalEvents ?? 0;

  const downloadCsv = () => {
    const header = 'Asset Number,Name,Category,Type,Vendor,Cost,Completed Date\n';
    const csv = rows.map(r =>
      `"${r.assetNumber}","${r.assetName}","${r.category ?? ''}","${r.maintenanceType}","${r.vendor ?? ''}",${r.cost},"${r.completedDate ? new Date(r.completedDate).toLocaleDateString('en-GB') : ''}"`
    ).join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'maintenance-costs.csv'; a.click();
    URL.revokeObjectURL(url);
  };

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
        <Button variant="secondary" size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>
      <div className="flex gap-3 items-center">
        <label className="text-sm text-gray-500">From</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white" />
        <label className="text-sm text-gray-500">To</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Events</p><p className="text-xl font-bold text-v-charcoal mt-1">{totalEvents}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Cost</p><p className="text-xl font-bold text-v-violet mt-1">{fmtCurrency(totalCost)}</p></CardBody></Card>
      </div>
      <Card>
        <CardBody className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-gray-400 text-center py-4">Loading...</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Asset</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Completed</th>
                  <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-v-wash last:border-0">
                    <td className="py-2">
                      <span className="font-mono text-xs text-v-violet">{r.assetNumber}</span>
                      <span className="ml-2">{r.assetName}</span>
                    </td>
                    <td className="py-2 capitalize text-gray-600">{r.maintenanceType}</td>
                    <td className="py-2 text-gray-600">{r.vendor ?? '—'}</td>
                    <td className="py-2 text-gray-600">{r.completedDate ? new Date(r.completedDate).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="py-2 text-right font-mono font-semibold">{fmtCurrency(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
