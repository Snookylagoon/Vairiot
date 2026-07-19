import { ArrowLeft, Pencil, Check, X, Upload, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { CountrySelect } from '@/components/ui/CountrySelect';
import { Input } from '@/components/ui/Input';
import {
  useSubTenant, useUpdateSubTenantCompany,
  useUploadSubTenantLogo, useDeleteSubTenantLogo,
} from '@/hooks/useSubTenants';

export function SubTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: sub, isLoading } = useSubTenant(id);
  const update = useUpdateSubTenantCompany(id!);
  const uploadLogo = useUploadSubTenantLogo(id!);
  const deleteLogo = useDeleteSubTenantLogo(id!);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    legalName: '', tradingName: '', registrationNumber: '',
    addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', country: '',
    primaryContactName: '', primaryContactEmail: '', primaryContactPhone: '',
    currency: '',
  });

  useEffect(() => {
    if (!sub?.company) return;
    setForm({
      legalName:           sub.company.legalName ?? '',
      tradingName:         sub.company.tradingName ?? '',
      registrationNumber:  sub.company.registrationNumber ?? '',
      addressLine1:        sub.company.addressLine1 ?? '',
      addressLine2:        sub.company.addressLine2 ?? '',
      city:                sub.company.city ?? '',
      stateProvince:       sub.company.stateProvince ?? '',
      postalCode:          sub.company.postalCode ?? '',
      country:             sub.company.country ?? '',
      primaryContactName:  sub.company.primaryContactName ?? '',
      primaryContactEmail: sub.company.primaryContactEmail ?? '',
      primaryContactPhone: sub.company.primaryContactPhone ?? '',
      currency:            sub.company.currency ?? 'USD',
    });
  }, [sub]);

  const set = <K extends keyof typeof form>(k: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    await update.mutateAsync(form);
    setEditing(false);
  };

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = '';
  };

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading…</div>;
  if (!sub) return <div className="text-center py-12 text-gray-400">Sub-tenant not found</div>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/admin/sub-tenants')}
        className="flex items-center gap-1 text-sm text-v-violet hover:underline"
      >
        <ArrowLeft size={16} /> Back to Sub Tenants
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-h1 text-v-charcoal">{sub.name}</h1>
        <Badge variant={sub.active ? 'green' : 'gray'}>{sub.active ? 'Active' : 'Inactive'}</Badge>
        <code className="font-mono text-xs text-gray-500">{sub.id}</code>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Company info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-h3 text-v-charcoal">Company Information</h2>
              {!editing ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil size={14} className="mr-1" /> Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={save} loading={update.isPending}>
                    <Check size={14} className="mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    <X size={14} className="mr-1" /> Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4 text-sm">
            {/* Logo */}
            <div className="flex items-center gap-4 pb-3 border-b border-gray-100">
              <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {sub.company?.logoStorageKey ? (
                  <img
                    src={`/api/v1/public/tenants/${sub.id}/logo?t=${Date.now()}`}
                    alt="Company logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">No logo</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  Shown on the reports this sub-tenant generates.
                </p>
                <div className="flex gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onLogoChange}
                  />
                  <Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()} loading={uploadLogo.isPending}>
                    <Upload size={12} className="mr-1" /> {sub.company?.logoStorageKey ? 'Replace' : 'Upload'}
                  </Button>
                  {sub.company?.logoStorageKey && (
                    <Button size="sm" variant="ghost" onClick={() => deleteLogo.mutate()} loading={deleteLogo.isPending}>
                      <Trash2 size={12} className="mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {editing ? (
              <div className="space-y-3">
                <Input label="Legal Name"           value={form.legalName}          onChange={set('legalName')} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Trading Name"          value={form.tradingName}        onChange={set('tradingName')} />
                  <Input label="Registration Number"   value={form.registrationNumber} onChange={set('registrationNumber')} />
                </div>
                <Input label="Address Line 1"        value={form.addressLine1}       onChange={set('addressLine1')} />
                <Input label="Address Line 2"        value={form.addressLine2}       onChange={set('addressLine2')} />
                <div className="grid grid-cols-3 gap-3">
                  <Input label="City"                value={form.city}               onChange={set('city')} />
                  <Input label="State / Province"    value={form.stateProvince}      onChange={set('stateProvince')} />
                  <Input label="Postal Code"         value={form.postalCode}         onChange={set('postalCode')} />
                </div>
                <CountrySelect label="Country" value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} />
                <Input label="Currency" value={form.currency} onChange={set('currency')} />
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <Input label="Contact Name"          value={form.primaryContactName}  onChange={set('primaryContactName')} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Contact Email"       type="email" value={form.primaryContactEmail} onChange={set('primaryContactEmail')} />
                    <Input label="Contact Phone"       type="tel"   value={form.primaryContactPhone} onChange={set('primaryContactPhone')} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Row label="Legal Name"          value={sub.company?.legalName} />
                <Row label="Trading Name"        value={sub.company?.tradingName ?? undefined} />
                <Row label="Registration #"      value={sub.company?.registrationNumber ?? undefined} />
                <Row label="Address"             value={[sub.company?.addressLine1, sub.company?.addressLine2, sub.company?.city, sub.company?.stateProvince, sub.company?.postalCode, sub.company?.country].filter(Boolean).join(', ') || undefined} />
                <Row label="Currency"            value={sub.company?.currency ?? undefined} />
                <Row label="Contact Name"        value={sub.company?.primaryContactName ?? undefined} />
                <Row label="Contact Email"       value={sub.company?.primaryContactEmail ?? undefined} />
                <Row label="Contact Phone"       value={sub.company?.primaryContactPhone ?? undefined} />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Overview */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Overview</h2></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Assets"     value={String(sub._count?.assets ?? 0)} />
            <Row label="Users"      value={String(sub._count?.users ?? 0)} />
            <Row label="Created"    value={new Date(sub.createdAt).toLocaleDateString()} />
            <Row label="Updated"    value={new Date(sub.updatedAt).toLocaleDateString()} />
            <Row label="Deployment" value={sub.deploymentMode} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-v-charcoal font-medium text-right break-words">{value || '—'}</span>
    </div>
  );
}
