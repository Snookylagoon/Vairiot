import { ArrowLeft, Upload, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { CountrySelect } from '@/components/ui/CountrySelect';
import { Input } from '@/components/ui/Input';
import {
  useCreateSubTenant,
  slugifyLoginId,
  type CreateSubTenantInput,
} from '@/hooks/useSubTenants';
import { api } from '@/lib/api';

const LOGIN_ID_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

interface FormState {
  organisationName:     string;
  loginId:              string;
  legalName:            string;
  tradingName:          string;
  registrationNumber:   string;
  addressLine1:         string;
  addressLine2:         string;
  city:                 string;
  stateProvince:        string;
  postalCode:           string;
  country:              string;
  primaryContactName:   string;
  primaryContactEmail:  string;
  primaryContactPhone:  string;
  currency:             string;
}

const EMPTY: FormState = {
  organisationName: '', loginId: '',
  legalName: '', tradingName: '', registrationNumber: '',
  addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', country: '',
  primaryContactName: '', primaryContactEmail: '', primaryContactPhone: '',
  currency: 'AED',
};

export function NewSubTenantPage() {
  const navigate = useNavigate();
  const create = useCreateSubTenant();
  const [form, setForm] = useState<FormState>(EMPTY);

  // Login ID auto-follows the organisation name until the admin edits it.
  const [loginIdTouched, setLoginIdTouched] = useState(false);
  // Legal name defaults to the organisation name likewise.
  const [legalNameTouched, setLegalNameTouched] = useState(false);

  const set = <K extends keyof FormState>(k: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setOrganisationName = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => ({
      ...f,
      organisationName: v,
      loginId:   loginIdTouched   ? f.loginId   : slugifyLoginId(v),
      legalName: legalNameTouched ? f.legalName : v,
    }));
  };

  const setLoginId = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoginIdTouched(true);
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm(f => ({ ...f, loginId: cleaned }));
  };

  const setLegalName = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLegalNameTouched(true);
    setForm(f => ({ ...f, legalName: e.target.value }));
  };

  const setCountry = (v: string) => setForm(f => ({ ...f, country: v }));

  // Logo — held locally until the sub-tenant exists (upload endpoint needs an id).
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logoFile) { setLogoPreview(null); return; }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setLogoFile(file);
    e.target.value = '';
  };

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const validate = (): string | null => {
    if (!form.organisationName.trim()) return 'Organisation name is required';
    const id = form.loginId.trim();
    if (id.length < 3 || id.length > 32) return 'Login ID must be 3–32 characters';
    if (!LOGIN_ID_RE.test(id)) return 'Login ID must be lowercase letters, numbers, and hyphens';
    if (!form.legalName.trim()) return 'Legal name is required';
    if (form.primaryContactEmail && !/\S+@\S+\.\S+/.test(form.primaryContactEmail)) {
      return 'Primary contact email looks invalid';
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    const payload: CreateSubTenantInput = {
      organisationName: form.organisationName.trim(),
      loginId:          form.loginId.trim(),
      company: {
        legalName:            form.legalName.trim(),
        tradingName:          form.tradingName.trim() || undefined,
        registrationNumber:   form.registrationNumber.trim() || undefined,
        addressLine1:         form.addressLine1.trim() || undefined,
        addressLine2:         form.addressLine2.trim() || undefined,
        city:                 form.city.trim() || undefined,
        stateProvince:        form.stateProvince.trim() || undefined,
        postalCode:           form.postalCode.trim() || undefined,
        country:              form.country.trim() || undefined,
        primaryContactName:   form.primaryContactName.trim() || undefined,
        primaryContactEmail:  form.primaryContactEmail.trim() || undefined,
        primaryContactPhone:  form.primaryContactPhone.trim() || undefined,
        currency:             form.currency.trim() || undefined,
      },
    };

    const created = await create.mutateAsync(payload);

    // Sub-tenant now exists — upload the logo if the admin picked one.
    if (logoFile) {
      setUploadingLogo(true);
      const fd = new FormData();
      fd.append('logo', logoFile);
      try {
        await api.post(`/api/v1/company/sub-tenants/${created.id}/logo`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch {
        toast.warning('Sub-tenant created, but the logo upload failed. You can retry from its detail page.');
      } finally {
        setUploadingLogo(false);
      }
    }

    navigate(`/admin/sub-tenants/${created.id}`);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/admin/sub-tenants')}
        className="flex items-center gap-1 text-sm text-v-violet hover:underline"
      >
        <ArrowLeft size={16} /> Back to Sub Tenants
      </button>

      <div>
        <h1 className="text-h1 text-v-charcoal">New Sub Tenant</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set up an isolated workspace for a division or client company.
          Their assets count towards your parent licence.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Identity</h2></CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Organisation Name"
              value={form.organisationName}
              onChange={setOrganisationName}
              placeholder="Acme Northern Division"
            />
            <Input
              label="Login ID"
              value={form.loginId}
              onChange={setLoginId}
              placeholder="acme-northern"
              hint="What sub-tenant users type into the Organisation field on the sign-in page. Lowercase letters, numbers, and hyphens only."
            />
          </CardBody>
        </Card>

        {/* Company details */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Company Details</h2></CardHeader>
          <CardBody className="space-y-4">
            <Input label="Legal Name"           value={form.legalName}          onChange={setLegalName}          placeholder="Acme Northern Ltd" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Trading Name"          value={form.tradingName}        onChange={set('tradingName')}        placeholder="Acme North" />
              <Input label="Registration Number"   value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="NZ1234567" />
            </div>
            <Input label="Address Line 1"        value={form.addressLine1}       onChange={set('addressLine1')}       placeholder="123 Main St" />
            <Input label="Address Line 2"        value={form.addressLine2}       onChange={set('addressLine2')}       placeholder="Suite 4B" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="City"                value={form.city}               onChange={set('city')}               placeholder="Wellington" />
              <Input label="Postal Code"         value={form.postalCode}         onChange={set('postalCode')}         placeholder="6011" />
            </div>
            <CountrySelect label="Country" value={form.country} onChange={setCountry} placeholder="Select country" />
            <Input label="Currency (ISO)"       value={form.currency}           onChange={set('currency')}           placeholder="USD" />
          </CardBody>
        </Card>

        {/* Primary contact */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Primary Contact</h2></CardHeader>
          <CardBody className="space-y-4">
            <Input label="Contact Name"          value={form.primaryContactName}  onChange={set('primaryContactName')}  placeholder="Jane Smith" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Contact Email"       type="email" value={form.primaryContactEmail} onChange={set('primaryContactEmail')} placeholder="jane@acme-north.com" />
              <Input label="Contact Phone"       type="tel"   value={form.primaryContactPhone} onChange={set('primaryContactPhone')} placeholder="+64 4 123 4567" />
            </div>
          </CardBody>
        </Card>

        {/* Logo */}
        <Card>
          <CardHeader><h2 className="text-h3 text-v-charcoal">Logo</h2></CardHeader>
          <CardBody>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-400 text-center px-1">No logo</span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  Uploaded to the sub-tenant and shown on the reports it generates.
                  JPEG, PNG, or WebP — up to 5&nbsp;MB.
                </p>
                <div className="flex gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onLogoChange}
                  />
                  <Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()}>
                    <Upload size={12} className="mr-1" /> {logoFile ? 'Replace' : 'Upload'}
                  </Button>
                  {logoFile && (
                    <Button size="sm" variant="ghost" onClick={() => setLogoFile(null)}>
                      <Trash2 size={12} className="mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => navigate('/admin/sub-tenants')}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending || uploadingLogo}>
            Create Sub Tenant
          </Button>
        </div>
      </div>
    </div>
  );
}
