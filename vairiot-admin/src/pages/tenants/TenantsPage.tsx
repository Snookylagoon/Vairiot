import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTenants } from '@/hooks/useAdmin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useUrlTableState } from '@/hooks/useUrlTableState';

interface TenantRow {
  id: string;
  name: string;
  deploymentMode: string;
  onboardingComplete: boolean;
  createdAt: string;
  _count?: { users: number; assets: number };
  licences?: { id: string; status: string; tier?: { name: string; displayName?: string } }[];
}

export function TenantsPage() {
  const navigate = useNavigate();
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort } = useUrlTableState();

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }

  const { data: tenants = [], isLoading } = useTenants(params);

  const columns: DataTableColumn<TenantRow>[] = [
    { key: 'name', label: 'Name', render: t => <span className="font-medium text-v-charcoal">{t.name}</span> },
    { key: 'deploymentMode', label: 'Mode', render: t => <Badge variant="default">{t.deploymentMode}</Badge> },
    {
      key: 'onboardingComplete', label: 'Onboarding',
      render: t => (
        <Badge variant={t.onboardingComplete ? 'green' : 'yellow'}>
          {t.onboardingComplete ? 'Complete' : 'Pending'}
        </Badge>
      ),
    },
    {
      key: 'licence', label: 'Licence', sortable: false,
      render: t => {
        const licence = t.licences?.[0];
        if (!licence) return <span className="text-xs text-gray-400">None</span>;
        return (
          <div className="flex items-center gap-2">
            <Badge variant={licence.status === 'active' ? 'green' : licence.status === 'expiring' ? 'yellow' : 'red'}>
              {licence.tier?.displayName ?? licence.tier?.name}
            </Badge>
            <span className="text-xs text-gray-400">{licence.status}</span>
          </div>
        );
      },
    },
    { key: 'users', label: 'Users', sortable: false, render: t => <span className="text-gray-600">{t._count?.users ?? 0}</span> },
    { key: 'assets', label: 'Assets', sortable: false, render: t => <span className="text-gray-600">{t._count?.assets ?? 0}</span> },
    {
      key: 'createdAt', label: 'Created',
      render: t => <span className="text-gray-400 text-xs">{new Date(t.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Tenants</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{tenants.length} total</span>
          <Button size="sm" onClick={() => navigate('/tenants/new')}>
            <Plus size={14} className="mr-1" /> New Tenant
          </Button>
        </div>
      </div>

      <DataTable<TenantRow>
        columns={columns}
        rows={tenants as TenantRow[]}
        getRowKey={t => t.id}
        isLoading={isLoading}
        emptyMessage="No tenants found"
        onRowClick={t => navigate(`/tenants/${t.id}`)}
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search tenants…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
      />
    </div>
  );
}
