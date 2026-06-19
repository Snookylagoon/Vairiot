import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenants } from '@/hooks/useAdmin';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Search } from 'lucide-react';

export function TenantsPage() {
  const [search, setSearch] = useState('');
  const { data: tenants = [], isLoading } = useTenants(search ? { search } : {});
  const navigate = useNavigate();

  const rows = useMemo(() => tenants, [tenants]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Tenants</h1>
        <span className="text-sm text-gray-400">{rows.length} total</span>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search tenants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Slug</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Mode</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Onboarding</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Licence</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Users</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Assets</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t: any) => {
                  const licence = t.licences?.[0];
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tenants/${t.id}`)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3 font-medium text-v-charcoal">{t.name}</td>
                      <td className="px-6 py-3 font-mono text-gray-500">{t.slug}</td>
                      <td className="px-6 py-3">
                        <Badge variant="default">{t.deploymentMode}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={t.onboardingComplete ? 'green' : 'yellow'}>
                          {t.onboardingComplete ? 'Complete' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        {licence ? (
                          <div className="flex items-center gap-2">
                            <Badge variant={licence.status === 'active' ? 'green' : licence.status === 'expiring' ? 'yellow' : 'red'}>
                              {licence.tier?.displayName ?? licence.tier?.name}
                            </Badge>
                            <span className="text-xs text-gray-400">{licence.status}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-600">{t._count?.users ?? 0}</td>
                      <td className="px-6 py-3 text-gray-600">{t._count?.assets ?? 0}</td>
                      <td className="px-6 py-3 text-gray-400 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No tenants found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
