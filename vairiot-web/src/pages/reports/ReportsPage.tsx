import { NavLink } from 'react-router-dom';
import { BarChart3, TrendingDown, FileText, Trash2, Clock, Wrench } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';

const reports = [
  { to: '/reports/depreciation', label: 'Depreciation Register', desc: 'Monthly depreciation, accumulated depreciation, and net book value for all assets', icon: TrendingDown, colour: 'bg-v-violet' },
  { to: '/reports/fixed-assets', label: 'Fixed Asset Register', desc: 'Full asset register with purchase cost, capitalized cost, and current NBV', icon: FileText, colour: 'bg-v-mauve' },
  { to: '/reports/disposals', label: 'Disposal Report', desc: 'Disposal gain/loss summary with totals by date range', icon: Trash2, colour: 'bg-red-500' },
  { to: '/reports/aging', label: 'Asset Aging', desc: 'Age distribution of assets by purchase date with bucket breakdown', icon: Clock, colour: 'bg-amber-500' },
  { to: '/reports/maintenance-costs', label: 'Maintenance Costs', desc: 'Total maintenance costs by asset, vendor, and date range', icon: Wrench, colour: 'bg-emerald-500' },
];

export function ReportsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Financial and operational reports across your asset register</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map(r => (
          <NavLink key={r.to} to={r.to}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardBody className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${r.colour} shrink-0`}>
                  <r.icon size={22} className="text-white" />
                </div>
                <div>
                  <p className="font-semibold text-v-charcoal">{r.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{r.desc}</p>
                </div>
              </CardBody>
            </Card>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
