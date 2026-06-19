import { useDashboardStats } from '@/hooks/useAdmin';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Building2, BadgeCheck, Users, Package, AlertTriangle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLOURS = ['#22c55e', '#f59e0b', '#ef4444', '#6b7280'];

export function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>;
  if (!stats) return null;

  const pieData = [
    { name: 'Active', value: stats.activeLicences },
    { name: 'Expiring', value: stats.expiringLicences },
    { name: 'Expired', value: stats.expiredLicences },
    { name: 'Suspended', value: stats.suspendedLicences },
  ].filter(d => d.value > 0);

  const statCards = [
    { label: 'Total Tenants',    value: stats.totalTenants,     icon: Building2,    colour: 'text-v-violet' },
    { label: 'Active Licences',  value: stats.activeLicences,   icon: BadgeCheck,   colour: 'text-green-600' },
    { label: 'Expiring Soon',    value: stats.expiringLicences, icon: AlertTriangle, colour: 'text-amber-500' },
    { label: 'Total Users',      value: stats.totalUsers,       icon: Users,         colour: 'text-blue-600' },
    { label: 'Total Assets',     value: stats.totalAssets,       icon: Package,       colour: 'text-v-pink' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-v-charcoal">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map(({ label, value, icon: Icon, colour }) => (
          <Card key={label}>
            <CardBody className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gray-50 ${colour}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-v-charcoal">{value.toLocaleString()}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {pieData.length > 0 && (
          <Card>
            <CardBody>
              <h2 className="text-h3 text-v-charcoal mb-4">Licence Status Distribution</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody>
            <h2 className="text-h3 text-v-charcoal mb-4">Recent Registrations</h2>
            <div className="space-y-3">
              {stats.recentTenants.length === 0 && (
                <p className="text-sm text-gray-400">No tenants registered yet.</p>
              )}
              {stats.recentTenants.map((t: { id: string; name: string; slug: string; onboardingComplete: boolean; createdAt: string }) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-v-charcoal">{t.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.onboardingComplete ? 'green' : 'yellow'}>
                      {t.onboardingComplete ? 'Active' : 'Onboarding'}
                    </Badge>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(t.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
