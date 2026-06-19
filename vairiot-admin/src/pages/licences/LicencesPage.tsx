import { useState } from 'react';
import {
  useLicences, useRenewLicence, useSuspendLicence,
  useRevokeLicence, useReactivateLicence, useAddDeviceSlot,
} from '@/hooks/useLicences';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const STATUS_OPTIONS = ['', 'active', 'expiring', 'expired', 'suspended', 'revoked'];

const statusVariant = (s: string) => {
  if (s === 'active') return 'green' as const;
  if (s === 'expiring') return 'yellow' as const;
  if (s === 'suspended') return 'gray' as const;
  return 'red' as const;
};

export function LicencesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: licences = [], isLoading } = useLicences(statusFilter ? { status: statusFilter } : {});

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Licences</h1>
        <span className="text-sm text-gray-400">{licences.length} total</span>
      </div>

      <div className="flex gap-2">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
              statusFilter === s
                ? 'bg-v-violet text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Licence #</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Tenant</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Tier</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Duration</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Start date</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Expires</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Payment</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Devices</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {licences.map((l: any) => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <code className="font-mono text-xs text-v-charcoal">{l.licenceNumber}</code>
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-medium text-v-charcoal">{l.tenant?.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{l.tenant?.slug}</p>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="default">{l.tier?.displayName ?? l.tier?.name}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={statusVariant(l.status)}>{l.status}</Badge>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{l.durationMonths}m</td>
                    <td className="px-6 py-3 text-gray-600 text-xs">
                      {l.activatedAt ? new Date(l.activatedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-3 text-gray-600 text-xs">
                      {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : 'Perpetual'}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={l.paymentConfirmed ? 'green' : 'yellow'}>
                        {l.paymentConfirmed ? 'Confirmed' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {l.tier?.baseDevices + (l.deviceSlots?.length ?? 0)}
                    </td>
                    <td className="px-6 py-3">
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
                    </td>
                  </tr>
                ))}
                {licences.length === 0 && (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-gray-400">No licences found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
