import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import {
  useLicences, useRenewLicence, useSuspendLicence,
  useRevokeLicence, useReactivateLicence, useAddDeviceSlot,
} from '@/hooks/useLicences';
import { useUrlTableState } from '@/hooks/useUrlTableState';

const STATUS_OPTIONS = ['', 'active', 'expiring', 'expired', 'suspended', 'revoked'];

const statusVariant = (s: string) => {
  if (s === 'active') return 'green' as const;
  if (s === 'expiring') return 'yellow' as const;
  if (s === 'suspended') return 'gray' as const;
  return 'red' as const;
};

interface LicenceRow {
  id: string;
  licenceNumber: string;
  status: string;
  durationMonths: number;
  activatedAt?: string | null;
  expiresAt?: string | null;
  paymentConfirmed: boolean;
  tenant?: { name: string };
  tier?: { name: string; displayName?: string; baseDevices: number };
  deviceSlots?: unknown[];
}

export function LicencesPage() {
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, extras, setExtra } =
    useUrlTableState(['status']);
  const statusFilter = extras.status;

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;
  if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }

  const { data: licences = [], isLoading } = useLicences(params);

  const renew = useRenewLicence();
  const suspend = useSuspendLicence();
  const revoke = useRevokeLicence();
  const reactivate = useReactivateLicence();
  const addSlot = useAddDeviceSlot();

  const [confirm, setConfirm] = useState<{ action: string; licenceId: string } | null>(null);

  const handleAction = async () => {
    if (!confirm) return;
    const { action, licenceId } = confirm;
    if (action === 'renew') await renew.mutateAsync({ licenceId });
    if (action === 'suspend') await suspend.mutateAsync({ licenceId });
    if (action === 'revoke') await revoke.mutateAsync({ licenceId });
    if (action === 'reactivate') await reactivate.mutateAsync(licenceId);
    if (action === 'addSlot') await addSlot.mutateAsync(licenceId);
    setConfirm(null);
  };

  const anyPending = renew.isPending || suspend.isPending || revoke.isPending || reactivate.isPending || addSlot.isPending;

  const columns: DataTableColumn<LicenceRow>[] = [
    {
      key: 'licenceNumber', label: 'Licence #',
      render: l => <code className="font-mono text-xs text-v-charcoal">{l.licenceNumber}</code>,
    },
    {
      key: 'tenant.name', label: 'Tenant',
      render: l => (
        <>
          <p className="font-medium text-v-charcoal">{l.tenant?.name}</p>
        </>
      ),
    },
    {
      key: 'tier.name', label: 'Tier',
      render: l => <Badge variant="default">{l.tier?.displayName ?? l.tier?.name}</Badge>,
    },
    {
      key: 'status', label: 'Status',
      render: l => <Badge variant={statusVariant(l.status)}>{l.status}</Badge>,
    },
    {
      key: 'durationMonths', label: 'Duration',
      render: l => <span className="text-gray-600">{l.durationMonths}m</span>,
    },
    {
      key: 'activatedAt', label: 'Start date',
      render: l => (
        <span className="text-gray-600 text-xs">
          {l.activatedAt ? new Date(l.activatedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'expiresAt', label: 'Expires',
      render: l => (
        <span className="text-gray-600 text-xs">
          {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : 'Perpetual'}
        </span>
      ),
    },
    {
      key: 'paymentConfirmed', label: 'Payment',
      render: l => (
        <Badge variant={l.paymentConfirmed ? 'green' : 'yellow'}>
          {l.paymentConfirmed ? 'Confirmed' : 'Pending'}
        </Badge>
      ),
    },
    {
      key: 'devices', label: 'Devices', sortable: false,
      render: l => <span className="text-gray-600">{(l.tier?.baseDevices ?? 0) + (l.deviceSlots?.length ?? 0)}</span>,
    },
    {
      key: 'actions', label: 'Actions', sortable: false,
      render: l => (
        <div className="flex gap-1">
          {(l.status === 'active' || l.status === 'expiring' || l.status === 'expired') && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'renew', licenceId: l.id })}>
              Renew
            </Button>
          )}
          {(l.status === 'active' || l.status === 'expiring') && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'suspend', licenceId: l.id })}>
              Suspend
            </Button>
          )}
          {l.status === 'suspended' && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'reactivate', licenceId: l.id })}>
              Reactivate
            </Button>
          )}
          {l.status !== 'revoked' && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'addSlot', licenceId: l.id })}>
              +Slot
            </Button>
          )}
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex gap-2">
      {STATUS_OPTIONS.map(s => (
        <button
          key={s || 'all'}
          onClick={() => setExtra('status', s)}
          className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
            statusFilter === s ? 'bg-v-violet text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {s || 'All'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Licences</h1>
        <span className="text-sm text-gray-400">{licences.length} total</span>
      </div>

      <DataTable<LicenceRow>
        columns={columns}
        rows={licences as LicenceRow[]}
        getRowKey={l => l.id}
        isLoading={isLoading}
        emptyMessage="No licences found"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search licence # or tenant…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
      />

      <ConfirmDialog
        open={!!confirm}
        title={`${confirm?.action === 'addSlot' ? 'Add Device Slot' : (confirm?.action?.charAt(0).toUpperCase() ?? '') + (confirm?.action?.slice(1) ?? '')} Licence`}
        description={confirm?.action === 'addSlot'
          ? 'This will add a paid device slot to this licence.'
          : `Are you sure you want to ${confirm?.action} this licence?`}
        confirmLabel={confirm?.action === 'addSlot' ? 'Add Slot' : (confirm?.action?.charAt(0).toUpperCase() ?? '') + (confirm?.action?.slice(1) ?? '')}
        variant={confirm?.action === 'revoke' ? 'danger' : 'primary'}
        loading={anyPending}
        onConfirm={handleAction}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
