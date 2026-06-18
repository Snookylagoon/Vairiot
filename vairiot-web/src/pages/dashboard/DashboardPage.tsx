import { useQuery } from '@tanstack/react-query';
import { Package, ClipboardList, AlertTriangle, CheckCircle, Activity, TrendingDown, PoundSterling } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { useAuthStore } from '@/stores/auth.store';
import type { AssetStats } from '@/types';

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

const CHART_COLOURS = ['#FF0DCC', '#A05B97', '#615AA0', '#2B3132', '#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

function fmtGBP(v: number) {
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const STATUS_COLOURS: Record<string, string> = {
  active: '#10b981', in_repair: '#f59e0b', retired: '#9ca3af',
  lost: '#ef4444', in_storage: '#3b82f6', disposed: '#6b7280',
};

interface AuditEvent {
  id: string; entityType: string; entityId: string; action: string;
  occurredAt: string; actorId?: string | null;
}

export function DashboardPage() {
  const { user } = useAuthStore();

  const { data: assetData }    = useQuery({ queryKey: ['assets', 'summary'], queryFn: () => api.get('/api/v1/assets?pageSize=1').then(r => r.data) });
  const { data: assetStats }   = useQuery<AssetStats>({ queryKey: ['assets', 'stats'], queryFn: () => api.get('/api/v1/assets/stats').then(r => r.data) });
  const { data: auditData }    = useQuery({ queryKey: ['audits', 'summary'], queryFn: () => api.get('/api/v1/audits').then(r => r.data) });
  const { data: overdueData }  = useQuery({ queryKey: ['checkouts', 'overdue'], queryFn: () => api.get('/api/v1/checkouts/overdue').then(r => r.data) });
  const { data: checkoutData } = useQuery({ queryKey: ['checkouts', 'active'], queryFn: () => api.get('/api/v1/checkouts').then(r => r.data) });
  const { data: events }       = useQuery<AuditEvent[]>({
    queryKey: ['audit-events', 'dashboard'],
    queryFn: () => api.get('/api/v1/audit-events?limit=10').then(r => r.data),
    retry: false,
  });

  const statusPieData = assetStats
    ? Object.entries(assetStats.byStatus).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back — {user?.email}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Package}        label="Total Assets"          value={assetData?.total ?? '—'}       colour="bg-v-violet" />
        <StatCard icon={PoundSterling}  label="Total Asset Value"     value={assetStats ? fmtGBP(assetStats.totalAssetValue) : '—'} colour="bg-v-pink" />
        <StatCard icon={TrendingDown}   label="Net Book Value"        value={assetStats ? fmtGBP(assetStats.totalNetBookValue) : '—'} colour="bg-v-mauve" />
        <StatCard icon={AlertTriangle}  label="Overdue Returns"       value={overdueData?.length ?? '—'}    colour="bg-amber-500" />
      </div>

      <div className="h-1.5 rounded-full bg-v-gradient" />

      {/* Charts Row 1: Acquisition Trend + Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-v-charcoal">Monthly Asset Acquisitions</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assets added per month (last 12 months)</p>
          </div>
          <CardBody>
            {assetStats && assetStats.monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={assetStats.monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v: any, name: any) => [name === 'value' ? fmtGBP(Number(v)) : v, name === 'value' ? 'Value' : 'Count']}
                  />
                  <Bar dataKey="count" fill="#615AA0" radius={[4, 4, 0, 0]} name="Assets" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">No trend data yet.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-v-charcoal">Assets by Status</h2>
          </div>
          <CardBody>
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={2} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#d1d5db' }}>
                    {statusPieData.map((entry, i) => (
                      <Cell key={entry.name} fill={STATUS_COLOURS[entry.name.replace(/ /g, '_')] ?? CHART_COLOURS[i % CHART_COLOURS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'Assets']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">No asset data yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Charts Row 2: Value by Category + Value by Site */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-v-charcoal">Net Book Value by Category</h2>
          </div>
          <CardBody>
            {assetStats && assetStats.valueByCat.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={assetStats.valueByCat} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => fmtGBP(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={100} />
                  <Tooltip formatter={(v: any) => [fmtGBP(Number(v)), 'NBV']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="value" fill="#FF0DCC" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">No category data.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-v-charcoal">Net Book Value by Site</h2>
          </div>
          <CardBody>
            {assetStats && assetStats.valueBySite.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={assetStats.valueBySite} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => fmtGBP(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={100} />
                  <Tooltip formatter={(v: any) => [fmtGBP(Number(v)), 'NBV']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="value" fill="#A05B97" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">No site data.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Charts Row 3: Acquisition Value Trend */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-v-charcoal">Monthly Acquisition Value</h2>
          <p className="text-xs text-gray-400 mt-0.5">Capitalized cost of assets added each month</p>
        </div>
        <CardBody>
          {assetStats && assetStats.monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={assetStats.monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => fmtGBP(v)} />
                <Tooltip formatter={(v: any) => [fmtGBP(Number(v)), 'Value']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#FF0DCC" strokeWidth={2} dot={{ r: 3, fill: '#FF0DCC' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">No trend data yet.</p>
          )}
        </CardBody>
      </Card>

      {/* Bottom Row: Active Checkouts + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-v-pink" />
              <h2 className="font-semibold text-v-charcoal">Active Checkouts</h2>
            </div>
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
                    <span className="text-xs text-gray-400">{new Date(ev.occurredAt).toLocaleString('en-GB')}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
