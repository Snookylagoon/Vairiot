import { useNavigate } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import { useSubTenants, type SubTenantSummary } from '@/hooks/useSubTenants';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';

export function SubTenantsPage() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useSubTenants();

  const columns: DataTableColumn<SubTenantSummary>[] = [
    {
      key: 'name', label: 'Name', sortable: false,
      render: t => (
        <div className="flex items-center gap-3">
          {t.company?.logoStorageKey ? (
            <img
              src={`/api/v1/public/tenants/${t.id}/logo?t=${Date.now()}`}
              alt=""
              className="w-8 h-8 rounded object-contain border border-gray-200 bg-white"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
              <Building2 size={14} className="text-gray-400" />
            </div>
          )}
          <span className="font-medium text-v-charcoal">{t.name}</span>
        </div>
      ),
    },
    {
      key: 'id', label: 'Login ID', sortable: false,
      render: t => <code className="font-mono text-xs text-gray-600">{t.id}</code>,
    },
    {
      key: 'contact', label: 'Primary Contact', sortable: false,
      render: t => (
        <div className="min-w-0">
          <p className="text-sm text-v-charcoal truncate">{t.company?.primaryContactName || '—'}</p>
          <p className="text-xs text-gray-400 truncate">{t.company?.primaryContactEmail || ''}</p>
        </div>
      ),
    },
    {
      key: 'location', label: 'Location', sortable: false,
      render: t => (
        <span className="text-sm text-gray-600">
          {[t.company?.city, t.company?.country].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'assets', label: 'Assets', sortable: false,
      render: t => <span className="text-gray-600">{t._count?.assets ?? 0}</span>,
    },
    {
      key: 'active', label: 'Status', sortable: false,
      render: t => <Badge variant={t.active ? 'green' : 'gray'}>{t.active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'createdAt', label: 'Created', sortable: false,
      render: t => (
        <span className="text-gray-400 text-xs">{new Date(t.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h1 text-v-charcoal">Sub Tenants</h1>
          <p className="text-sm text-gray-500 mt-1">
            Divisions or client companies you manage under {' '}
            <span className="font-medium text-v-charcoal">your account</span>.
            Sub-tenants are isolated workspaces whose assets count towards your licence.
          </p>
        </div>
        <Button onClick={() => navigate('/admin/sub-tenants/new')}>
          <Plus size={14} className="mr-1" /> New Sub Tenant
        </Button>
      </div>

      <DataTable<SubTenantSummary>
        columns={columns}
        rows={rows}
        getRowKey={t => t.id}
        isLoading={isLoading}
        emptyMessage="No sub-tenants yet — click New Sub Tenant to set one up."
        emptyIcon={<Building2 size={40} className="text-gray-300" />}
        onRowClick={t => navigate(`/admin/sub-tenants/${t.id}`)}
      />
    </div>
  );
}
