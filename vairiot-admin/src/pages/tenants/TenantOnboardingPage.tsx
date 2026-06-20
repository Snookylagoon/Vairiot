import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  useTenantOnboarding,
  useTenantOnboardingUserStep,
  useTenantOnboardingCompanyStep,
  useTenantOnboardingClientStep,
  useTenantOnboardingLicenceStep,
  useTenantOnboardingComplete,
  type TenantOnboardingView,
} from '@/hooks/useAdmin';
import { useTenantDetail } from '@/hooks/useAdmin';
import { toast } from 'sonner';

const STEPS = [
  { key: 'user_registration',    label: 'User',          icon: '1' },
  { key: 'company_registration', label: 'Organisation',  icon: '2' },
  { key: 'client_registration',  label: 'Client (opt.)', icon: '3' },
  { key: 'licence_activation',   label: 'Licence',       icon: '4' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

export function TenantOnboardingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tenant } = useTenantDetail(id!);
  const { data, isLoading } = useTenantOnboarding(id);
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);

  if (isLoading || !data) {
    return <div className="text-center py-12 text-gray-400">Loading onboarding...</div>;
  }

  const current: StepKey = activeStep ?? (data.status.nextStep as StepKey) ?? 'user_registration';

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(`/tenants/${id}`)} className="flex items-center gap-1 text-sm text-v-violet hover:underline">
        <ArrowLeft size={16} /> Back to Tenant
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-h1 text-v-charcoal">Resume Onboarding</h1>
        {tenant && <span className="text-gray-500">— {tenant.name}</span>}
        <Badge variant={data.status.complete ? 'green' : 'yellow'}>
          {data.status.complete ? 'Complete' : 'In Progress'}
        </Badge>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((s, i) => {
          const done = data.status.steps[s.key];
          const active = current === s.key;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <button
                onClick={() => setActiveStep(s.key)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  active ? 'bg-v-violet text-white shadow-sm'
                  : done ? 'bg-green-100 text-green-700'
                         : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {done && !active ? <Check size={14} /> : <span>{s.icon}</span>}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300" />}
            </div>
          );
        })}
      </div>

      <div className="max-w-2xl">
        {current === 'user_registration'    && <UserStep tenantId={id!} data={data} onDone={() => setActiveStep('company_registration')} />}
        {current === 'company_registration' && <CompanyStep tenantId={id!} data={data} onDone={() => setActiveStep('client_registration')} />}
        {current === 'client_registration'  && <ClientStep tenantId={id!} data={data} onDone={() => setActiveStep('licence_activation')} />}
        {current === 'licence_activation'   && <LicenceStep tenantId={id!} data={data} onFinalised={() => navigate(`/tenants/${id}`)} />}
      </div>
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

function UserStep({ tenantId, data, onDone }: { tenantId: string; data: TenantOnboardingView; onDone: () => void }) {
  const mutation = useTenantOnboardingUserStep(tenantId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    setName(data.user?.name ?? data.user?.email?.split('@')[0] ?? '');
  }, [data.user]);

  const done = data.status.steps.user_registration;
  const noUser = !data.user;

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    await mutation.mutateAsync({ name, phone: phone || undefined });
    onDone();
  };

  return (
    <Card>
      <CardHeader><h2 className="text-h3 text-v-charcoal">User Details</h2></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Confirm the primary user's name on behalf of this tenant.
          {data.user && <> Acting on behalf of <span className="font-medium text-v-charcoal">{data.user.email}</span>.</>}
        </p>
        {noUser ? (
          <p className="text-sm text-red-600">This tenant has no users yet — create a user before completing onboarding.</p>
        ) : (
          <>
            <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
            <Input label="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+64 21 123 4567" />
            <div className="flex justify-end gap-3 items-center">
              {done && <span className="text-sm text-green-600 font-medium">Completed</span>}
              <Button onClick={submit} loading={mutation.isPending}>Save &amp; Continue</Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CompanyStep({ tenantId, data, onDone }: { tenantId: string; data: TenantOnboardingView; onDone: () => void }) {
  const mutation = useTenantOnboardingCompanyStep(tenantId);
  const [form, setForm] = useState({ companyName: '', registrationNumber: '', address: '', city: '', country: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (data.company) {
      setForm({
        companyName: data.company.legalName,
        registrationNumber: data.company.registrationNumber ?? '',
        address: data.company.addressLine1,
        city: data.company.city,
        country: data.company.country,
      });
    }
  }, [data.company]);

  const done = data.status.steps.company_registration;

  const submit = async () => {
    if (!form.companyName.trim()) { toast.error('Company name is required'); return; }
    if (!form.address.trim()) { toast.error('Address is required'); return; }
    if (!form.city.trim()) { toast.error('City is required'); return; }
    if (!form.country.trim()) { toast.error('Country is required'); return; }
    await mutation.mutateAsync(form);
    onDone();
  };

  return (
    <Card>
      <CardHeader><h2 className="text-h3 text-v-charcoal">Organisation</h2></CardHeader>
      <CardBody className="space-y-4">
        <Input label="Company Name" value={form.companyName} onChange={set('companyName')} placeholder="Acme Ltd" />
        <Input label="Registration Number (optional)" value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="NZ1234567" />
        <Input label="Address" value={form.address} onChange={set('address')} placeholder="123 Main St" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" value={form.city} onChange={set('city')} placeholder="Wellington" />
          <Input label="Country" value={form.country} onChange={set('country')} placeholder="New Zealand" />
        </div>
        <div className="flex justify-end gap-3 items-center">
          {done && <span className="text-sm text-green-600 font-medium">Completed</span>}
          <Button onClick={submit} loading={mutation.isPending}>Save &amp; Continue</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ClientStep({ tenantId, data, onDone }: { tenantId: string; data: TenantOnboardingView; onDone: () => void }) {
  const mutation = useTenantOnboardingClientStep(tenantId);
  const [form, setForm] = useState({ clientName: '', contactEmail: '', signatoryName: '', signatoryEmail: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const first = data.clientCompanies[0];
    if (first) {
      setForm({
        clientName: first.legalName,
        contactEmail: first.primaryContactEmail ?? '',
        signatoryName: first.authorities[0]?.name ?? '',
        signatoryEmail: first.authorities[0]?.email ?? '',
      });
    }
  }, [data.clientCompanies]);

  const done = data.status.steps.client_registration;
  const anyFilled = Object.values(form).some(v => v.trim() !== '');

  const submit = async () => {
    if (!anyFilled) { onDone(); return; }
    if (!form.clientName.trim()) { toast.error('Client name is required'); return; }
    await mutation.mutateAsync(form);
    onDone();
  };

  return (
    <Card>
      <CardHeader><h2 className="text-h3 text-v-charcoal">Client (optional)</h2></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          Optional. Register a client company if this tenant manages assets on behalf of one.
        </p>
        <Input label="Client Company Name" value={form.clientName} onChange={set('clientName')} placeholder="Client Corp" />
        <Input label="Contact Email" type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@client.com" />
        <Input label="Signatory Name" value={form.signatoryName} onChange={set('signatoryName')} placeholder="John Doe" />
        <Input label="Signatory Email" type="email" value={form.signatoryEmail} onChange={set('signatoryEmail')} placeholder="john@client.com" />
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={onDone}>Skip</Button>
          <div className="flex gap-3 items-center">
            {done && <span className="text-sm text-green-600 font-medium">Completed</span>}
            <Button onClick={submit} loading={mutation.isPending}>Save &amp; Continue</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

const TIERS = [
  { name: 'FREE',   label: 'Free',         summary: '1 device, up to 500 assets' },
  { name: 'TIER_2', label: 'Professional', summary: 'Up to 5 devices, 1,500 assets' },
  { name: 'TIER_3', label: 'Enterprise',   summary: 'Unlimited devices and assets' },
];

function LicenceStep({ tenantId, data, onFinalised }: { tenantId: string; data: TenantOnboardingView; onFinalised: () => void }) {
  const licence = useTenantOnboardingLicenceStep(tenantId);
  const finalise = useTenantOnboardingComplete(tenantId);
  const [tier, setTier] = useState('FREE');

  const licenceDone = data.status.steps.licence_activation;
  const canFinalise =
    data.status.steps.user_registration &&
    data.status.steps.company_registration &&
    data.status.steps.licence_activation;

  return (
    <Card>
      <CardHeader><h2 className="text-h3 text-v-charcoal">Licence</h2></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">Activate a licence for the tenant. Most tenants start on Free.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {TIERS.map(t => (
            <button
              key={t.name}
              onClick={() => setTier(t.name)}
              className={`text-left rounded-xl border-2 p-4 transition ${
                tier === t.name ? 'border-v-violet bg-v-violet/5' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-bold text-v-charcoal">{t.label}</p>
              <p className="text-xs text-gray-500 mt-1">{t.summary}</p>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-3 items-center">
          {licenceDone && <span className="text-sm text-green-600 font-medium">Licence active</span>}
          <Button
            variant="secondary"
            loading={licence.isPending}
            onClick={() => licence.mutateAsync({ tierName: tier })}
          >
            Activate Licence
          </Button>
        </div>

        <div className="border-t border-gray-100 pt-4 flex justify-end gap-3 items-center">
          <p className="text-xs text-gray-500 mr-auto">
            {canFinalise
              ? 'All required steps are complete. Finalise to mark this tenant onboarded.'
              : 'Complete the user, organisation and licence steps to finalise.'}
          </p>
          <Button
            disabled={!canFinalise}
            loading={finalise.isPending}
            onClick={async () => { await finalise.mutateAsync(); onFinalised(); }}
          >
            Finalise Onboarding
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
