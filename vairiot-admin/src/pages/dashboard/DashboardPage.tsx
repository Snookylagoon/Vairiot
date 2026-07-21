import { Building2, BadgeCheck, Users, Package, AlertTriangle, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { useDashboardStats } from '@/hooks/useAdmin';


const COLOURS = ['#22c55e', '#f59e0b', '#ef4444', '#6b7280'];

const STATUS_TO_ROUTE: Record<string, string> = {
  Active: '/licences?status=active',
  Expiring: '/licences?status=expiring',
  Expired: '/licences?status=expired',
  Suspended: '/licences?status=suspended',
};

export function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const navigate = useNavigate();

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>;
  if (!stats) return null;

  const pieData = [
    { name: 'Active', value: stats.activeLicences },
    { name: 'Expiring', value: stats.expiringLicences },
    { name: 'Expired', value: stats.expiredLicences },
    { name: 'Suspended', value: stats.suspendedLicences },
  ].filter(d => d.value > 0);

  const statCards = [
    { label: 'Total Tenants',    value: stats.totalTenants,     icon: Building2,     colour: 'text-v-violet',  to: '/tenants' },
    { label: 'Active Licences',  value: stats.activeLicences,   icon: BadgeCheck,    colour: 'text-green-600', to: '/licences?status=active' },
    { label: 'Expiring Soon',    value: stats.expiringLicences, icon: AlertTriangle, colour: 'text-amber-500', to: '/licences?status=expiring' },
    { label: 'Total Users',      value: stats.totalUsers,       icon: Users,         colour: 'text-blue-600',  to: '/users' },
    { label: 'Total Assets',     value: stats.totalAssets,      icon: Package,       colour: 'text-v-pink',    to: '/tenants' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-v-charcoal">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map(({ label, value, icon: Icon, colour, to }) => (
          <Link key={label} to={to} className="block transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-v-violet rounded-xl">
            <Card>
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
          </Link>
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
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      onClick={(d: { name?: string }) => {
                        const route = d.name ? STATUS_TO_ROUTE[d.name] : undefined;
                        if (route) navigate(route);
                      }}
                      className="cursor-pointer"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLOURS[i % COLOURS.length]} style={{ cursor: 'pointer' }} />
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
              {stats.recentTenants.map((t: { id: string; name: string; onboardingComplete: boolean; createdAt: string }) => (
                <Link
                  key={t.id}
                  to={t.onboardingComplete ? `/tenants/${t.id}` : `/tenants/${t.id}/onboarding`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 -mx-2 px-2 rounded hover:bg-gray-50 transition"
                >
                  <div>
                    <p className="text-sm font-medium text-v-charcoal">{t.name}</p>
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
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
