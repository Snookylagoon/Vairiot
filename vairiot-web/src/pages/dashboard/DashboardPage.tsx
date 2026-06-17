import { useQuery } from '@tanstack/react-query';
import { Package, ClipboardList, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/auth.store';

function StatCard({ icon: Icon, label, value, colour }: { icon: React.ElementType; label: string; value: string | number; colour: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${colour}`}>
          <Icon size={22} className="text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-v-charcoal">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data: assetData } = useQuery({
    queryKey: ['assets', 'summary'],
    queryFn:  () => api.get('/api/v1/assets?pageSize=1').then(r => r.data),
  });

  const { data: auditData } = useQuery({
    queryKey: ['audits', 'summary'],
    queryFn:  () => api.get('/api/v1/audits').then(r => r.data),
  });

  const { data: overdueData } = useQuery({
    queryKey: ['checkouts', 'overdue'],
    queryFn:  () => api.get('/api/v1/checkouts/overdue').then(r => r.data),
  });

  const { data: checkoutData } = useQuery({
    queryKey: ['checkouts', 'active'],
    queryFn:  () => api.get('/api/v1/checkouts').then(r => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back — {user?.email}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Package}       label="Total Assets"       value={assetData?.total ?? '—'}       colour="bg-v-violet" />
        <StatCard icon={ClipboardList} label="Audit Campaigns"    value={auditData?.length ?? '—'}      colour="bg-v-mauve" />
        <StatCard icon={CheckCircle}   label="Active Checkouts"   value={checkoutData?.length ?? '—'}   colour="bg-v-pink" />
        <StatCard icon={AlertTriangle} label="Overdue Returns"    value={overdueData?.length ?? '—'}    colour="bg-amber-500" />
      </div>

      {/* Gradient accent band */}
      <div className="h-1.5 rounded-full bg-v-gradient" />

      {/* Recent checkouts */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-v-charcoal">Active Checkouts</h2>
        </div>
        <CardBody>
          {checkoutData?.length === 0 && <p className="text-sm text-gray-400">No assets currently checked out.</p>}
          <div className="space-y-2">
            {checkoutData?.slice(0, 5).map((c: { id: string; asset: { assetNumber: string; name: string }; custodianId: string; checkedOutAt: string }) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-v-charcoal">{c.asset.name}</p>
                  <p className="text-xs text-gray-400">{c.asset.assetNumber} &mdash; {c.custodianId}</p>
                </div>
                <span className="text-xs text-gray-400">{new Date(c.checkedOutAt).toLocaleDateString('en-GB')}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
