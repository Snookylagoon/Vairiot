import { useParams, useNavigate } from 'react-router-dom';
import { useTenantDetail } from '@/hooks/useAdmin';
import { useRenewLicence, useSuspendLicence, useRevokeLicence, useReactivateLicence } from '@/hooks/useLicences';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

const statusVariant = (s: string) => {
  if (s === 'active') return 'green';
  if (s === 'expiring') return 'yellow';
  if (s === 'suspended') return 'gray';
  return 'red';
};

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tenant, isLoading } = useTenantDetail(id!);

  const renew = useRenewLicence();
  const suspend = useSuspendLicence();
  const revoke = useRevokeLicence();
  const reactivate = useReactivateLicence();

  const [confirm, setConfirm] = useState<{ action: string; licenceId: string } | null>(null);

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!tenant) return <div className="text-center py-12 text-gray-400">Tenant not found</div>;

  const licence = tenant.licences?.[0];

  const handleAction = async () => {
    if (!confirm) return;
    const { action, licenceId } = confirm;
    if (action === 'renew') await renew.mutateAsync({ licenceId });
    if (action === 'suspend') await suspend.mutateAsync({ licenceId });
    if (action === 'revoke') await revoke.mutateAsync({ licenceId });
    if (action === 'reactivate') await reactivate.mutateAsync(licenceId);
    setConfirm(null);
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/tenants')} className="flex items-center gap-1 text-sm text-v-violet hover:underline">
        <ArrowLeft size={16} /> Back to Tenants
      </button>

      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-h1 text-v-charcoal">{tenant.name}</h1>
        <Badge variant={tenant.active ? 'green' : 'red'}>{tenant.active ? 'Active' : 'Inactive'}</Badge>
        {!tenant.onboardingComplete && (
          <Button size="sm" onClick={() => navigate(`/tenants/${tenant.id}/onboarding`)}>
            Resume Onboarding
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Company Info */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Company Information</h2></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Slug" value={tenant.slug} mono />
            <Row label="Deployment Mode" value={tenant.deploymentMode} />
            <Row label="Onboarding" value={tenant.onboardingComplete ? 'Complete' : 'Pending'} />
            <Row label="Created" value={new Date(tenant.createdAt).toLocaleDateString()} />
            {tenant.company && (
              <>
                <Row label="Legal Name" value={tenant.company.legalName} />
                <Row label="Registration #" value={tenant.company.registrationNumber} />
                <Row label="Address" value={[tenant.company.addressLine1, tenant.company.city, tenant.company.country].filter(Boolean).join(', ')} />
                <Row label="Contact" value={tenant.company.contactEmail} />
              </>
            )}
          </CardBody>
        </Card>

        {/* Licence */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-h3 text-v-charcoal">Licence</h2>
              {licence && <Badge variant={statusVariant(licence.status)}>{licence.status}</Badge>}
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {licence ? (
              <>
                <Row label="Tier" value={licence.tier?.displayName ?? licence.tier?.name} />
                <Row label="Duration" value={`${licence.durationMonths} months`} />
                <Row label="Activated" value={licence.activatedAt ? new Date(licence.activatedAt).toLocaleDateString() : 'N/A'} />
                <Row label="Expires" value={licence.expiresAt ? new Date(licence.expiresAt).toLocaleDateString() : 'Perpetual'} />
                <Row label="Payment" value={licence.paymentConfirmed ? 'Confirmed' : 'Pending'} />
                <Row label="Device Slots" value={`${licence.tier?.baseDevices + (licence.deviceSlots?.length ?? 0)}`} />

                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                  {(licence.status === 'active' || licence.status === 'expiring' || licence.status === 'expired') && (
                    <Button size="sm" onClick={() => setConfirm({ action: 'renew', licenceId: licence.id })}>
                      Renew
                    </Button>
                  )}
                  {(licence.status === 'active' || licence.status === 'expiring') && (
                    <Button size="sm" variant="secondary" onClick={() => setConfirm({ action: 'suspend', licenceId: licence.id })}>
                      Suspend
                    </Button>
                  )}
                  {licence.status === 'suspended' && (
                    <Button size="sm" onClick={() => setConfirm({ action: 'reactivate', licenceId: licence.id })}>
                      Reactivate
                    </Button>
                  )}
                  {licence.status !== 'revoked' && (
                    <Button size="sm" variant="danger" onClick={() => setConfirm({ action: 'revoke', licenceId: licence.id })}>
                      Revoke
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">No licence found</p>
            )}
          </CardBody>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Users ({tenant.users?.length ?? 0})</h2></CardHeader>
          <CardBody>
            <div className="space-y-2">
              {tenant.users?.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-v-charcoal">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.active ? 'green' : 'gray'}>{u.active ? 'Active' : 'Disabled'}</Badge>
                    {u.roles?.map((ur: any) => (
                      <Badge key={ur.role.name} variant="default">{ur.role.name}</Badge>
                    ))}
                  </div>
                </div>
              ))}
              {(!tenant.users || tenant.users.length === 0) && (
                <p className="text-sm text-gray-400">No users</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Counts & Client Companies */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Overview</h2></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Assets" value={String(tenant._count?.assets ?? 0)} />
            <Row label="Devices" value={String(tenant._count?.devices ?? 0)} />
            <Row label="Audit Campaigns" value={String(tenant._count?.auditCampaigns ?? 0)} />
            {tenant.clientCompanies?.length > 0 && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Client Companies</p>
                {tenant.clientCompanies.map((c: any) => (
                  <div key={c.id} className="flex justify-between py-1">
                    <span className="text-sm text-v-charcoal">{c.tradingName ?? c.legalName}</span>
                    <span className="text-xs text-gray-400">{c.registrationNumber}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={`${confirm?.action?.charAt(0).toUpperCase()}${confirm?.action?.slice(1)} Licence`}
        description={`Are you sure you want to ${confirm?.action} this licence?`}
        confirmLabel={confirm?.action?.charAt(0).toUpperCase() + (confirm?.action?.slice(1) ?? '')}
        variant={confirm?.action === 'revoke' ? 'danger' : 'primary'}
        loading={renew.isPending || suspend.isPending || revoke.isPending || reactivate.isPending}
        onConfirm={handleAction}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`text-v-charcoal font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}
