import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import {
  useLicenceStatus,
  useDevices,
  useAllLicences,
  useRenewLicence,
  useSuspendLicence,
  useRevokeLicence,
  useReactivateLicence,
  useAddDeviceSlot,
} from '@/hooks/useLicensing';
import { useAuthStore, hasAnyPermission } from '@/stores/auth.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';

export function LicensingPage() {
  const user = useAuthStore(s => s.user);
  const isAuthority = hasAnyPermission(user, 'licence:manage');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-v-charcoal">Licensing</h1>
      <CurrentLicence />
      <DevicesList />
      {isAuthority && <AuthorityConsole />}
    </div>
  );
}

// ── Current licence status card ──────────────────────────────────────────────

function CurrentLicence() {
  const { data, isLoading } = useLicenceStatus();
  if (isLoading) return <CardSkeleton />;
  if (!data?.licence) return <Card className="p-6"><p className="text-gray-500">No active licence</p></Card>;

  const { licence, tier, usage, daysRemaining } = data;
  const statusColour: Record<string, string> = {
    active: 'green', expiring: 'yellow', expired: 'red', suspended: 'red', revoked: 'red',
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-v-charcoal">Current Licence</h2>
        <Badge variant={statusColour[licence.status] as 'green' | 'yellow' | 'red' ?? 'gray'}>
          {licence.status.toUpperCase()}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-xs uppercase tracking-wide text-gray-500">Licence #</span>
        <code className="font-mono text-sm text-v-charcoal">{licence.licenceNumber}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(licence.licenceNumber);
            toast.success('Licence number copied');
          }}
          className="ml-auto text-xs text-v-violet hover:underline"
        >
          Copy
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
        <Stat label="Tier" value={licence.tierName} />
        <Stat label="Start date" value={licence.startDate ? new Date(licence.startDate).toLocaleDateString() : '—'} />
        <Stat label="Assets" value={`${usage.assetCount} / ${tier?.maxAssets ?? '∞'}`} />
        <Stat label="Devices" value={`${usage.deviceCount} / ${usage.deviceAllowance}`} />
        <Stat label="Expires" value={licence.isPerpetual ? 'Never' : daysRemaining != null ? `${daysRemaining} days` : '—'} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-semibold text-v-charcoal">{value}</div>
    </div>
  );
}

// ── Devices list ─────────────────────────────────────────────────────────────

function DevicesList() {
  const { data: devices, isLoading } = useDevices();
  if (isLoading) return <CardSkeleton />;

  return (
    <Card className="p-6 space-y-3">
      <h2 className="text-lg font-bold text-v-charcoal">Registered Devices</h2>
      {(!devices || devices.length === 0) ? (
        <p className="text-sm text-gray-500">No devices registered yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {devices.map(d => (
            <div key={d.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium text-v-charcoal text-sm">{d.deviceName}</div>
                <div className="text-xs text-gray-400">{d.deviceType} · {d.fingerprint.slice(0, 12)}…</div>
              </div>
              <Badge variant={d.active ? 'green' : 'gray'}>{d.active ? 'Active' : 'Inactive'}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Licensing Authority console (licence:manage only) ────────────────────────

function AuthorityConsole() {
  const { data: licences, isLoading } = useAllLicences();
  const renewMutation      = useRenewLicence();
  const suspendMutation    = useSuspendLicence();
  const revokeMutation     = useRevokeLicence();
  const reactivateMutation = useReactivateLicence();
  const addSlotMutation    = useAddDeviceSlot();
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [renewMonths, setRenewMonths] = useState('12');

  if (isLoading) return <CardSkeleton />;

  const runAction = async () => {
    if (!confirmAction) return;
    const { id, action } = confirmAction;
    try {
      if (action === 'renew')       await renewMutation.mutateAsync({ id, durationMonths: parseInt(renewMonths) || 12 });
      if (action === 'suspend')     await suspendMutation.mutateAsync(id);
      if (action === 'revoke')      await revokeMutation.mutateAsync(id);
      if (action === 'reactivate')  await reactivateMutation.mutateAsync(id);
      if (action === 'add-slot')    await addSlotMutation.mutateAsync(id);
      toast.success(`Licence ${action} successful`);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Action failed');
    }
    setConfirmAction(null);
  };

  return (
    <>
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-bold text-v-charcoal">Licensing Authority Console</h2>
        <p className="text-sm text-gray-500">
          Manage all tenant licences. Payment confirmation, suspension, and revocation are audit-logged.
        </p>

        {(!licences || (licences as unknown[]).length === 0) ? (
          <p className="text-sm text-gray-400">No licences found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="pb-2">Tenant</th>
                  <th className="pb-2">Tier</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Expiry</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(licences as Array<{ id: string; tenant?: { name?: string }; tierName: string; status: string; expiryDate?: string }>).map(l => (
                  <tr key={l.id}>
                    <td className="py-3 font-medium text-v-charcoal">{l.tenant?.name ?? '—'}</td>
                    <td className="py-3">{l.tierName}</td>
                    <td className="py-3"><Badge variant={l.status === 'active' ? 'green' : 'red'}>{l.status}</Badge></td>
                    <td className="py-3 text-gray-500">{l.expiryDate ? new Date(l.expiryDate).toLocaleDateString() : 'Perpetual'}</td>
                    <td className="py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ id: l.id, action: 'renew' })}>Renew</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ id: l.id, action: 'add-slot' })}>+Slot</Button>
                      {l.status === 'active' && (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ id: l.id, action: 'suspend' })}>Suspend</Button>
                      )}
                      {l.status === 'suspended' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ id: l.id, action: 'reactivate' })}>Reactivate</Button>
                          <Button size="sm" variant="danger" onClick={() => setConfirmAction({ id: l.id, action: 'revoke' })}>Revoke</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmAction}
        title={`Confirm: ${confirmAction?.action ?? ''}`}
        description={
          confirmAction?.action === 'renew'
            ? 'Confirm payment received and renew this licence.'
            : `Are you sure you want to ${confirmAction?.action ?? ''} this licence?`
        }
        onConfirm={runAction}
        onCancel={() => setConfirmAction(null)}
      >
        {confirmAction?.action === 'renew' && (
          <Input
            label="Duration (months)"
            type="number"
            value={renewMonths}
            onChange={e => setRenewMonths(e.target.value)}
            hint="1–120 months"
          />
        )}
      </ConfirmDialog>
    </>
  );
}

function CardSkeleton() {
  return <div className="animate-pulse bg-gray-100 rounded-2xl h-32" />;
}
