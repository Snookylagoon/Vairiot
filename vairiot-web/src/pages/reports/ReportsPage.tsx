import { NavLink } from 'react-router-dom';
import { BarChart3, TrendingDown, FileText, Trash2, Clock, Wrench, ClipboardCheck, ShoppingCart, Key, Building2, Users, AlertTriangle, Shield } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';

interface ReportGroup {
  title: string;
  reports: { to: string; label: string; desc: string; icon: typeof FileText; colour: string }[];
}

const reportGroups: ReportGroup[] = [
  {
    title: 'Asset Reports',
    reports: [
      { to: '/reports/fixed-assets', label: 'Fixed Asset Register', desc: 'Full asset register with purchase cost, capitalized cost, and current NBV', icon: FileText, colour: 'bg-v-mauve' },
      { to: '/reports/depreciation', label: 'Depreciation Schedule', desc: 'Monthly depreciation, accumulated depreciation, and net book value', icon: TrendingDown, colour: 'bg-v-violet' },
      { to: '/reports/aging', label: 'Asset Aging', desc: 'Age distribution of assets by purchase date with bucket breakdown', icon: Clock, colour: 'bg-amber-500' },
    ],
  },
  {
    title: 'Disposal Reports',
    reports: [
      { to: '/reports/disposals', label: 'Disposal Register', desc: 'Complete record of all asset disposals with gain/loss analysis', icon: Trash2, colour: 'bg-red-500' },
    ],
  },
  {
    title: 'Audit Reports',
    reports: [
      { to: '/reports/audit-campaigns', label: 'Campaign Summary', desc: 'Overview of all audit campaigns with completion and accuracy metrics', icon: ClipboardCheck, colour: 'bg-indigo-500' },
    ],
  },
  {
    title: 'Maintenance Reports',
    reports: [
      { to: '/reports/maintenance-costs', label: 'Maintenance Log', desc: 'Complete maintenance event history with costs and vendors', icon: Wrench, colour: 'bg-emerald-500' },
    ],
  },
  {
    title: 'Checkout Reports',
    reports: [
      { to: '/reports/checkouts', label: 'Checkout Log', desc: 'Full checkout history with custodians and return tracking', icon: ShoppingCart, colour: 'bg-sky-500' },
    ],
  },
  {
    title: 'Licence Reports',
    reports: [
      { to: '/reports/licences', label: 'Licence Register', desc: 'All licences with tier, status, devices, and payment info', icon: Key, colour: 'bg-purple-500' },
    ],
  },
  {
    title: 'Tenant & Company',
    reports: [
      { to: '/reports/tenants', label: 'Tenant Register', desc: 'Tenant list with subscription details and asset counts', icon: Building2, colour: 'bg-teal-500' },
      { to: '/reports/compliance', label: 'Compliance Overview', desc: 'Compliance status across asset management areas', icon: Shield, colour: 'bg-green-600' },
    ],
  },
  {
    title: 'User Reports',
    reports: [
      { to: '/reports/users', label: 'User Register', desc: 'All users with roles, login status, and 2FA configuration', icon: Users, colour: 'bg-orange-500' },
    ],
  },
  {
    title: 'Exception Reports',
    reports: [
      { to: '/reports/exceptions', label: 'Exception Summary', desc: 'Warranty expiries, overdue checkouts, and other exceptions', icon: AlertTriangle, colour: 'bg-rose-500' },
    ],
  },
];

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Financial and operational reports across your asset register</p>
      </div>

      {reportGroups.map(group => (
        <div key={group.title}>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{group.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.reports.map(r => (
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
      ))}
    </div>
  );
}
