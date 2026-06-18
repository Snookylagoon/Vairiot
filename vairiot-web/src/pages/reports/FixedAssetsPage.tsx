import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useFixedAssetRegister } from '@/hooks/useReports';
import { useCategories } from '@/hooks/useCategories';
import { useSites } from '@/hooks/useSites';
import { useCurrency } from '@/hooks/useCurrency';

export function FixedAssetsPage() {
  const navigate = useNavigate();
  const { fmt: fmtCurrency } = useCurrency();
  const [categoryId, setCategoryId] = useState('');
  const [siteId, setSiteId] = useState('');
  const filters = { ...(categoryId && { categoryId }), ...(siteId && { siteId }) };
  const { data: rows = [], isLoading } = useFixedAssetRegister(filters);
  const { data: categories = [] } = useCategories();
  const { data: sites = [] } = useSites();

  const totals = rows.reduce((acc, r) => ({
    purchaseCost: acc.purchaseCost + r.purchaseCost,
    capitalizedCost: acc.capitalizedCost + r.capitalizedCost,
    netBookValue: acc.netBookValue + r.netBookValue,
  }), { purchaseCost: 0, capitalizedCost: 0, netBookValue: 0 });

  const downloadCsv = () => {
    const header = 'Asset Number,Name,Category,Site,Location,Status,Condition,Serial No,Manufacturer,Purchase Date,Purchase Cost,Capitalized Cost,Accum Dep,NBV\n';
    const csv = rows.map(r =>
      `"${r.assetNumber}","${r.name}","${r.category ?? ''}","${r.site ?? ''}","${r.location ?? ''}","${r.status}","${r.condition}","${r.serialNumber ?? ''}","${r.manufacturer ?? ''}","${r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString('en-GB') : ''}",${r.purchaseCost},${r.capitalizedCost},${r.accumulatedDepreciation},${r.netBookValue}`
    ).join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fixed-asset-register.csv'; a.click();
    URL.revokeObjectURL(url);
  };

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
        <Button variant="secondary" size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>
      <div className="flex gap-3">
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white">
          <option value="">All Categories</option>
          {categories.map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={siteId} onChange={e => setSiteId(e.target.value)} className="text-sm rounded-lg border border-gray-200 px-3 py-1.5 bg-white">
          <option value="">All Sites</option>
          {sites.map((s: { id: string; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Purchase Cost</p><p className="text-xl font-bold text-v-charcoal mt-1">{fmtCurrency(totals.purchaseCost)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total Capitalized Cost</p><p className="text-xl font-bold text-v-mauve mt-1">{fmtCurrency(totals.capitalizedCost)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-gray-500 uppercase">Total NBV</p><p className="text-xl font-bold text-v-violet mt-1">{fmtCurrency(totals.netBookValue)}</p></CardBody></Card>
      </div>
      <Card>
        <CardBody className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-gray-400 text-center py-4">Loading...</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Asset</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Site</th>
                  <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">Purchase</th>
                  <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">Cap. Cost</th>
                  <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">NBV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.assetNumber} className="border-b border-gray-50 hover:bg-v-wash last:border-0">
                    <td className="py-2">
                      <span className="font-mono text-xs text-v-violet">{r.assetNumber}</span>
                      <span className="ml-2">{r.name}</span>
                    </td>
                    <td className="py-2 text-gray-600">{r.category ?? '—'}</td>
                    <td className="py-2 text-gray-600">{r.site ?? '—'}</td>
                    <td className="py-2 capitalize text-gray-600">{r.status}</td>
                    <td className="py-2 text-right font-mono">{fmtCurrency(r.purchaseCost)}</td>
                    <td className="py-2 text-right font-mono">{fmtCurrency(r.capitalizedCost)}</td>
                    <td className="py-2 text-right font-mono font-semibold">{fmtCurrency(r.netBookValue)}</td>
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
