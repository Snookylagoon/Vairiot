import { useQuery } from '@tanstack/react-query';
import { Package, ClipboardList, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
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

const STATUS_COLOURS: Record<string, string> = {
  active:        'bg-emerald-500',
  in_repair:     'bg-amber-500',
  retired:       'bg-gray-400',
  lost:          'bg-rose-500',
  in_storage:    'bg-sky-500',
};

function StatusBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const rows  = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {rows.map(([status, n]) => (
          <div
            key={status}
            className={`${STATUS_COLOURS[status] ?? 'bg-v-violet'} h-full`}
            style={{ width: `${(n / total) * 100}%` }}
            title={`${status}: ${n}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {rows.map(([status, n]) => (
          <div key={status} className="flex items-center gap-2">
            <span className={`inline-block size-2.5 rounded-full ${STATUS_COLOURS[status] ?? 'bg-v-violet'}`} />
            <span className="text-gray-600 capitalize">{status.replace(/_/g, ' ')}</span>
            <span className="ml-auto font-medium text-v-charcoal">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface AuditEvent {
  id: string; entityType: string; entityId: string; action: string;
  createdAt: string; actorId?: string | null;
}

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data: assetData }   = useQuery({ queryKey: ['assets',    'summary'], queryFn: () => api.get('/api/v1/assets?pageSize=1').then(r => r.data) });
  const { data: assetStats }  = useQuery({ queryKey: ['assets',    'stats'],   queryFn: () => api.get('/api/v1/assets/stats').then(r => r.data) });
  const { data: auditData }   = useQuery({ queryKey: ['audits',    'summary'], queryFn: () => api.get('/api/v1/audits').then(r => r.data) });
  const { data: overdueData } = useQuery({ queryKey: ['checkouts', 'overdue'], queryFn: () => api.get('/api/v1/checkouts/overdue').then(r => r.data) });
  const { data: checkoutData }= useQuery({ queryKey: ['checkouts', 'active'],  queryFn: () => api.get('/api/v1/checkouts').then(r => r.data) });

  // Recent admin audit events — silently empty for users without admin scopes.
  const { data: events } = useQuery<AuditEvent[]>({
    queryKey: ['audit-events', 'dashboard'],
    queryFn:  () => api.get('/api/v1/audit-events?limit=10').then(r => r.data),
    retry: false,
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

      <div className="h-1.5 rounded-full bg-v-gradient" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets by status */}
        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-v-charcoal">Assets by Status</h2>
          </div>
          <CardBody>
            {assetStats && Object.keys(assetStats.byStatus ?? {}).length > 0
              ? <StatusBar counts={assetStats.byStatus} />
              : <p className="text-sm text-gray-400">No asset data yet.</p>}
          </CardBody>
        </Card>

        {/* Active checkouts */}
        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
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

      {/* Recent audit events — only shown to admins (endpoint 403s otherwise) */}
      {events && events.length > 0 && (
        <Card>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <Activity size={16} className="text-v-violet" />
            <h2 className="font-semibold text-v-charcoal">Recent Activity</h2>
          </div>
          <CardBody>
            <div className="space-y-1.5">
              {events.slice(0, 10).map(ev => (
                <div key={ev.id} className="flex items-center justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-v-charcoal capitalize">{ev.action}</span>
                    <span className="text-gray-500">{ev.entityType}</span>
                    <span className="text-gray-400 text-xs font-mono">{ev.entityId.slice(0, 8)}</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(ev.createdAt).toLocaleString('en-GB')}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
