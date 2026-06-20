import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { CountrySelect } from '@/components/ui/CountrySelect';
import {
  useOnboardingProgress,
  useCompleteUserStep,
  useCompleteCompanyStep,
  useCompleteClientStep,
  useFinaliseOnboarding,
} from '@/hooks/useOnboarding';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from 'sonner';

const STEPS = [
  { key: 'user_registration',    label: 'Your Details',    icon: '1' },
  { key: 'company_registration', label: 'Organisation',    icon: '2' },
  { key: 'client_registration',  label: 'Client (optional)', icon: '3' },
  { key: 'licence_activation',   label: 'Licence',         icon: '4' },
] as const;


export function OnboardingPage() {
  const { data: progress, isLoading } = useOnboardingProgress();
  const [activeStep, setActiveStep] = useState<string | null>(null);

  if (isLoading) return <Spinner />;

  const current = activeStep ?? progress?.nextStep ?? 'user_registration';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="h-2 bg-v-gradient" />
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-v-charcoal tracking-tight">
            VAIR<span className="v-gradient-text">IOT</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">Set up your organisation</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {STEPS.map((s, i) => {
            const done = progress?.steps[s.key]?.completed;
            const active = current === s.key;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <button
                  onClick={() => setActiveStep(s.key)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    active ? 'bg-v-gradient text-white shadow-sm' :
                    done   ? 'bg-green-100 text-green-700' :
                             'bg-gray-100 text-gray-400'
                  }`}
                >
                  {done && !active ? '✓' : s.icon} {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300" />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="w-full max-w-lg">
          {current === 'user_registration'    && <UserStep progress={progress} onDone={() => setActiveStep('company_registration')} />}
          {current === 'company_registration' && <CompanyStep progress={progress} onDone={() => setActiveStep('client_registration')} />}
          {current === 'client_registration'  && <ClientStep progress={progress} onDone={() => setActiveStep('licence_activation')} />}
          {current === 'licence_activation'   && <LicenceStep progress={progress} />}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: User details ──────────────────────────────────────────────────────

function UserStep({ progress, onDone }: { progress: ReturnType<typeof useOnboardingProgress>['data']; onDone: () => void }) {
  const user = useAuthStore(s => s.user);
  const mutation = useCompleteUserStep();
  const [name, setName]   = useState(user?.email?.split('@')[0] ?? '');
  const [phone, setPhone] = useState('');

  const submit = async () => {
    try {
      await mutation.mutateAsync({ name, phone: phone || undefined });
      toast.success('Details saved');
      onDone();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    }
  };

  const done = progress?.steps.user_registration?.completed;

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-bold text-v-charcoal">Your Details</h2>
      <p className="text-sm text-gray-500">Confirm your name and optionally add a phone number.</p>
      <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
      <Input label="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+64 21 123 4567" />
      <div className="flex justify-end gap-3">
        {done && <span className="self-center text-sm text-green-600 font-medium">Completed</span>}
        <Button onClick={submit} loading={mutation.isPending}>Save &amp; Continue</Button>
      </div>
    </Card>
  );
}

// ── Step 2: Company registration ──────────────────────────────────────────────

function CompanyStep({ progress, onDone }: { progress: ReturnType<typeof useOnboardingProgress>['data']; onDone: () => void }) {
  const mutation = useCompleteCompanyStep();
  const [form, setForm] = useState({ companyName: '', registrationNumber: '', address: '', city: '', country: '' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.companyName.trim()) { toast.error('Company name is required'); return; }
    if (!form.address.trim()) { toast.error('Address is required'); return; }
    if (!form.city.trim()) { toast.error('City is required'); return; }
    if (!form.country.trim()) { toast.error('Country is required'); return; }
    try {
      await mutation.mutateAsync(form);
      toast.success('Organisation registered');
      onDone();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    }
  };

  const done = progress?.steps.company_registration?.completed;

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-bold text-v-charcoal">Organisation Details</h2>
      <p className="text-sm text-gray-500">Register your company or organisation.</p>
      <Input label="Company Name" value={form.companyName} onChange={set('companyName')} placeholder="Acme Ltd" />
      <Input label="Registration Number (optional)" value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="NZ1234567" />
      <Input label="Address" value={form.address} onChange={set('address')} placeholder="123 Main St" />
      <Input label="City" value={form.city} onChange={set('city')} placeholder="Wellington" />
      <CountrySelect label="Country" value={form.country}
        onChange={v => setForm(f => ({ ...f, country: v }))} />
      <div className="flex justify-end gap-3">
        {done && <span className="self-center text-sm text-green-600 font-medium">Completed</span>}
        <Button onClick={submit} loading={mutation.isPending}>Save &amp; Continue</Button>
      </div>
    </Card>
  );
}

// ── Step 3: Client registration (optional) ────────────────────────────────────

function ClientStep({ progress, onDone }: { progress: ReturnType<typeof useOnboardingProgress>['data']; onDone: () => void }) {
  const mutation = useCompleteClientStep();
  const [form, setForm] = useState({ clientName: '', contactEmail: '', signatoryName: '', signatoryEmail: '' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.clientName.trim()) { toast.error('Client name is required'); return; }
    try {
      await mutation.mutateAsync(form);
      toast.success('Client registered');
      onDone();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save');
    }
  };

  const done = progress?.steps.client_registration?.completed;

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-lg font-bold text-v-charcoal">Client Registration</h2>
      <p className="text-sm text-gray-500">
        Optionally register a client company. You can skip this step if you do not manage assets on behalf of a client.
      </p>
      <Input label="Client Company Name" value={form.clientName} onChange={set('clientName')} placeholder="Client Corp" />
      <Input label="Contact Email" type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@client.com" />
      <Input label="Signatory Name" value={form.signatoryName} onChange={set('signatoryName')} placeholder="John Doe" />
      <Input label="Signatory Email" type="email" value={form.signatoryEmail} onChange={set('signatoryEmail')} placeholder="john@client.com" />
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onDone}>Skip this step</Button>
        <div className="flex gap-3">
          {done && <span className="self-center text-sm text-green-600 font-medium">Completed</span>}
          <Button onClick={submit} loading={mutation.isPending}>Save &amp; Continue</Button>
        </div>
      </div>
    </Card>
  );
}

// ── Step 4: Licence activation ────────────────────────────────────────────────

const UPGRADE_TIERS = [
  {
    name: 'TIER_2',
    label: 'Professional',
    price: '$50 / year',
    features: ['Up to 10 device registrations', 'Up to 1,500 assets', 'Priority support'],
    colour: 'border-v-mauve',
  },
  {
    name: 'TIER_3',
    label: 'Enterprise',
    price: '$100 / year',
    features: ['Unlimited device registrations', 'Unlimited assets', 'Dedicated support', 'Custom integrations'],
    colour: 'border-v-pink',
  },
];

function LicenceStep({ progress }: { progress: ReturnType<typeof useOnboardingProgress>['data'] }) {
  const finaliseMutation = useFinaliseOnboarding();
  const navigate = useNavigate();
  const hydrate = useAuthStore(s => s.hydrate);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const finalise = async () => {
    try {
      await finaliseMutation.mutateAsync();
      toast.success('Onboarding complete — welcome to Vairiot!');
      await hydrate();
      navigate('/dashboard');
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not finalise');
    }
  };

  const upgradeMailto = (tier: typeof UPGRADE_TIERS[number]) => {
    const subject = encodeURIComponent(`Licence Upgrade Request — ${tier.label}`);
    const body = encodeURIComponent(
      `Hi Vairiot,\n\nI would like to upgrade my licence to the ${tier.label} plan (${tier.price}).\n\nPlease send me the payment details.\n\nThank you.`,
    );
    return `mailto:licensing@vairiot.com?subject=${subject}&body=${body}`;
  };

  return (
    <Card className="p-6 space-y-6">
      <h2 className="text-lg font-bold text-v-charcoal">Your Licence</h2>

      <div className="rounded-xl border-2 border-green-300 bg-green-50 p-5">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <span className="font-bold text-v-charcoal">Free Licence — Active</span>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-gray-600">
          <li>• 3 device registrations included</li>
          <li>• Up to 500 assets</li>
          <li>• Free forever</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setShowUpgrade(!showUpgrade)}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 font-medium">
            Need more devices or higher asset limits? View upgrade options
          </p>
          <span className={`text-gray-400 transition-transform ${showUpgrade ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </button>

      {showUpgrade && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {UPGRADE_TIERS.map(tier => (
              <div key={tier.name} className={`rounded-xl border-2 ${tier.colour} p-5 space-y-3`}>
                <div className="font-bold text-v-charcoal text-lg">{tier.label}</div>
                <div className="text-sm font-semibold v-gradient-text">{tier.price}</div>
                <ul className="space-y-1 text-sm text-gray-600">
                  {tier.features.map(f => <li key={f}>• {f}</li>)}
                </ul>
                <a
                  href={upgradeMailto(tier)}
                  className="inline-block w-full text-center rounded-lg bg-v-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  Request {tier.label} Upgrade
                </a>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center">
            Online payment coming soon — for now, our team will process your upgrade manually.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={finalise} loading={finaliseMutation.isPending}>
          Complete Setup
        </Button>
      </div>
    </Card>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-v-pink border-t-transparent" />
    </div>
  );
}
