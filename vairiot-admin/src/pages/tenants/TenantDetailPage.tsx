import { useParams, useNavigate } from 'react-router-dom';
import { useTenantDetail, useCreateSubTenant, useUploadTenantLogo, useDeleteTenantLogo, useUpdateTenantCompany } from '@/hooks/useAdmin';
import { useRenewLicence, useSuspendLicence, useRevokeLicence, useReactivateLicence, useLicenceDevices, useDeactivateDevice, useDeleteDevice } from '@/hooks/useLicences';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { ArrowLeft, Plus, Upload, Trash2, Pencil, Check, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useShellContext } from '@/components/layout/AdminShell';

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
  const { setHeaderSubtitle } = useShellContext();

  useEffect(() => {
    const name = tenant?.company?.legalName ?? tenant?.name;
    if (name) setHeaderSubtitle(name);
    return () => setHeaderSubtitle(null);
  }, [tenant, setHeaderSubtitle]);

  const renew = useRenewLicence();
  const suspend = useSuspendLicence();
  const revoke = useRevokeLicence();
  const reactivate = useReactivateLicence();

  const [confirm, setConfirm] = useState<{ action: string; licenceId: string } | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientForm, setClientForm] = useState({ clientName: '', contactEmail: '', signatoryName: '', signatoryEmail: '', address: '', city: '', country: '', telephone: '' });
  const addClient = useCreateSubTenant(id!);
  const uploadLogo = useUploadTenantLogo(id!);
  const deleteLogo = useDeleteTenantLogo(id!);
  const updateCompany = useUpdateTenantCompany(id!);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    legalName: '', registrationNumber: '', addressLine1: '', city: '', country: '',
    primaryContactName: '', primaryContactEmail: '', primaryContactPhone: '',
  });

  const resetClientForm = () => setClientForm({ clientName: '', contactEmail: '', signatoryName: '', signatoryEmail: '', address: '', city: '', country: '', telephone: '' });
  const setClientField = (k: keyof typeof clientForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setClientForm(f => ({ ...f, [k]: e.target.value }));

  const submitAddClient = async () => {
    if (!clientForm.clientName.trim()) { toast.error('Client company name is required'); return; }
    if (!clientForm.signatoryName.trim() || !clientForm.signatoryEmail.trim()) {
      toast.error('Signatory name and email are required');
      return;
    }
    await addClient.mutateAsync(clientForm);
    resetClientForm();
    setShowAddClient(false);
  };

  const startEditCompany = () => {
    setCompanyForm({
      legalName: tenant?.company?.legalName ?? tenant?.name ?? '',
      registrationNumber: tenant?.company?.registrationNumber ?? '',
      addressLine1: tenant?.company?.addressLine1 ?? '',
      city: tenant?.company?.city ?? '',
      country: tenant?.company?.country ?? '',
      primaryContactName: tenant?.company?.primaryContactName ?? '',
      primaryContactEmail: tenant?.company?.primaryContactEmail ?? '',
      primaryContactPhone: tenant?.company?.primaryContactPhone ?? '',
    });
    setEditingCompany(true);
  };

  const saveCompany = async () => {
    await updateCompany.mutateAsync(companyForm);
    setEditingCompany(false);
  };

  const setCompanyField = (k: keyof typeof companyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCompanyForm(f => ({ ...f, [k]: e.target.value }));

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = '';
  };

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
        {!tenant.active && !tenant.onboardingComplete && (
          <Button size="sm" onClick={() => navigate(`/tenants/${tenant.id}/onboarding`)}>
            Resume Onboarding
          </Button>
        )}
        {tenant.active && (
          <Button size="sm" variant="secondary" onClick={() => setShowAddClient(true)}>
            <Plus size={14} className="mr-1" /> Add Sub Client
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-h3 text-v-charcoal">Company Information</h2>
              {!editingCompany ? (
                <Button size="sm" variant="ghost" onClick={startEditCompany}>
                  <Pencil size={14} className="mr-1" /> Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveCompany} disabled={updateCompany.isPending}>
                    <Check size={14} className="mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingCompany(false)}>
                    <X size={14} className="mr-1" /> Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4 text-sm">
            {/* Logo */}
            <div className="flex items-center gap-4 pb-3 border-b border-gray-100">
              <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {tenant.company?.logoStorageKey ? (
                  <img
                    src={`/api/v1/public/tenants/${tenant.id}/logo?t=${Date.now()}`}
                    alt="Company logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500">Company Logo</p>
                <div className="flex gap-2">
                  <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} />
                  <Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()} disabled={uploadLogo.isPending}>
                    <Upload size={12} className="mr-1" /> {tenant.company?.logoStorageKey ? 'Replace' : 'Upload'}
                  </Button>
                  {tenant.company?.logoStorageKey && (
                    <Button size="sm" variant="ghost" onClick={() => deleteLogo.mutate()} disabled={deleteLogo.isPending}>
                      <Trash2 size={12} className="mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {editingCompany ? (
              <div className="space-y-3">
                <Input label="Legal Name" value={companyForm.legalName} onChange={setCompanyField('legalName')} />
                <Input label="Registration #" value={companyForm.registrationNumber} onChange={setCompanyField('registrationNumber')} />
                <Input label="Address" value={companyForm.addressLine1} onChange={setCompanyField('addressLine1')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="City" value={companyForm.city} onChange={setCompanyField('city')} />
                  <Input label="Country" value={companyForm.country} onChange={setCompanyField('country')} />
                </div>
                <Input label="Contact Name" value={companyForm.primaryContactName} onChange={setCompanyField('primaryContactName')} />
                <Input label="Contact Email" type="email" value={companyForm.primaryContactEmail} onChange={setCompanyField('primaryContactEmail')} />
                <Input label="Telephone" type="tel" value={companyForm.primaryContactPhone} onChange={setCompanyField('primaryContactPhone')} />
              </div>
            ) : (
              <div className="space-y-2">
                <Row label="Deployment Mode" value={tenant.deploymentMode} />
                <Row label="Onboarding" value={tenant.onboardingComplete ? 'Complete' : 'Pending'} />
                <Row label="Created" value={new Date(tenant.createdAt).toLocaleDateString()} />
                {tenant.company ? (
                  <>
                    <Row label="Legal Name" value={tenant.company.legalName} />
                    <Row label="Registration #" value={tenant.company.registrationNumber} />
                    <Row label="Address" value={[tenant.company.addressLine1, tenant.company.city, tenant.company.country].filter(Boolean).join(', ')} />
                    <Row label="Contact Name" value={tenant.company.primaryContactName} />
                    <Row label="Contact Email" value={tenant.company.primaryContactEmail} />
                    <Row label="Telephone" value={tenant.company.primaryContactPhone} />
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No company details — click Edit to add</p>
                )}
              </div>
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

        {/* Counts & Sub-Tenants */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Overview</h2></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Assets (this tenant)" value={String(tenant._count?.assets ?? 0)} />
            {(tenant.childTenants?.length > 0 || tenant.totalFamilyAssets !== undefined) && (
              <Row label="Assets (total incl. sub-tenants)" value={String(tenant.totalFamilyAssets ?? tenant._count?.assets ?? 0)} />
            )}
            <Row label="Devices" value={String(tenant._count?.devices ?? 0)} />
            <Row label="Audit Campaigns" value={String(tenant._count?.auditCampaigns ?? 0)} />
            {tenant.childTenants?.length > 0 && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Sub-Tenants</p>
                {tenant.childTenants.map((c: any) => (
                  <div key={c.id} className="flex justify-between py-1">
                    <span className="text-sm text-v-charcoal">{c.name}</span>
                    <span className="text-xs text-gray-400">{c._count?.assets ?? 0} assets</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {licence && <RegisteredDevicesCard licenceId={licence.id} />}

      <ConfirmDialog
        open={showAddClient}
        title="Add Sub Client"
        description="Create a sub-tenant with its own isolated data. Assets count towards the parent licence cap."
        confirmLabel="Add Client"
        variant="primary"
        loading={addClient.isPending}
        onConfirm={submitAddClient}
        onCancel={() => { setShowAddClient(false); resetClientForm(); }}
      >
        <div className="space-y-3">
          <Input label="Client Company Name" value={clientForm.clientName} onChange={setClientField('clientName')} placeholder="Client Corp" />
          <Input label="Contact Email" type="email" value={clientForm.contactEmail} onChange={setClientField('contactEmail')} placeholder="contact@client.com" />
          <Input label="Signatory Name" value={clientForm.signatoryName} onChange={setClientField('signatoryName')} placeholder="Jane Doe" />
          <Input label="Signatory Email" type="email" value={clientForm.signatoryEmail} onChange={setClientField('signatoryEmail')} placeholder="jane@client.com" />
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Registration Details</p>
            <div className="space-y-3">
              <Input label="Address" value={clientForm.address} onChange={setClientField('address')} placeholder="123 Main Street" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City" value={clientForm.city} onChange={setClientField('city')} placeholder="Wellington" />
                <Input label="Country" value={clientForm.country} onChange={setClientField('country')} placeholder="New Zealand" />
              </div>
              <Input label="Telephone" type="tel" value={clientForm.telephone} onChange={setClientField('telephone')} placeholder="+64 4 123 4567" />
            </div>
          </div>
        </div>
      </ConfirmDialog>

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

function RegisteredDevicesCard({ licenceId }: { licenceId: string }) {
  const { data: devices, isLoading } = useLicenceDevices(licenceId);
  const deactivate = useDeactivateDevice();
  const remove = useDeleteDevice();
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'deactivate' | 'delete' } | null>(null);

  const handleConfirm = async () => {
    if (!confirmAction) return;
    if (confirmAction.action === 'deactivate') {
      await deactivate.mutateAsync({ licenceId, deviceId: confirmAction.id });
    } else {
      await remove.mutateAsync({ licenceId, deviceId: confirmAction.id });
    }
    setConfirmAction(null);
  };

  return (
    <>
      <Card>
        <CardHeader><h2 className="text-h3 text-v-charcoal">Registered Devices</h2></CardHeader>
        <CardBody>
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : !devices || devices.length === 0 ? (
            <p className="text-sm text-gray-400">No devices registered</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {devices.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-v-charcoal truncate">{d.deviceName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {d.deviceType}
                      {d.user && <> · {d.user.name}</>}
                      {d.fingerprint && <> · {d.fingerprint.slice(0, 8)}…</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400">
                      {d.lastSeenAt ? `Seen ${new Date(d.lastSeenAt).toLocaleString()}` : '—'}
                    </span>
                    <Badge variant={d.active ? 'green' : 'gray'}>{d.active ? 'Active' : 'Inactive'}</Badge>
                    {d.active && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ id: d.id, action: 'deactivate' })}>
                        Deactivate
                      </Button>
                    )}
                    {!d.active && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ id: d.id, action: 'delete' })}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.action === 'delete' ? 'Remove Device' : 'Deactivate Device'}
        description={confirmAction?.action === 'delete'
          ? 'This will permanently remove the device registration.'
          : 'This will deactivate the device, freeing up a licence slot. The device will need to be re-activated to regain access.'}
        confirmLabel={confirmAction?.action === 'delete' ? 'Remove' : 'Deactivate'}
        variant="danger"
        loading={deactivate.isPending || remove.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </>
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
