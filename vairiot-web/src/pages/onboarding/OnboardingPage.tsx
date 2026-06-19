import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import {
  useOnboardingProgress,
  useCompleteUserStep,
  useCompleteCompanyStep,
  useCompleteClientStep,
  useActivateLicence,
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

const TIERS = [
  { name: 'FREE',   label: 'Free',      assets: '500',       price: 'Free forever',   colour: 'border-gray-300' },
  { name: 'TIER_2', label: 'Standard',   assets: '1,500',     price: '$50 / year',     colour: 'border-v-mauve' },
  { name: 'TIER_3', label: 'Enterprise', assets: 'Unlimited', price: '$100 / year',    colour: 'border-v-pink' },
];

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
  const [form, setForm] = useState({ companyName: '', registrationNumber: '', address: '', country: '' });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.companyName.trim()) { toast.error('Company name is required'); return; }
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
      <Input label="Address (optional)" value={form.address} onChange={set('address')} placeholder="123 Main St, Wellington" />
      <Input label="Country (optional)" value={form.country} onChange={set('country')} placeholder="New Zealand" />
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

function LicenceStep({ progress }: { progress: ReturnType<typeof useOnboardingProgress>['data'] }) {
  const activateMutation = useActivateLicence();
  const finaliseMutation = useFinaliseOnboarding();
  const navigate = useNavigate();
  const hydrate = useAuthStore(s => s.hydrate);
  const [selectedTier, setSelectedTier] = useState('FREE');

  const activate = async () => {
    try {
      await activateMutation.mutateAsync({ tierName: selectedTier });
      toast.success('Licence activated');
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Activation failed');
    }
  };

  const done = progress?.steps.licence_activation?.completed;

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

  return (
    <Card className="p-6 space-y-6">
      <h2 className="text-lg font-bold text-v-charcoal">Choose Your Licence</h2>
      <p className="text-sm text-gray-500">
        Select a tier to get started. You can upgrade later. Paid tiers require manual payment confirmation by the Licensing Authority.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TIERS.map(t => (
          <button
            key={t.name}
            onClick={() => setSelectedTier(t.name)}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              selectedTier === t.name ? `${t.colour} ring-2 ring-v-pink bg-v-wash` : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-bold text-v-charcoal">{t.label}</div>
            <div className="text-xs text-gray-500 mt-1">{t.assets} assets</div>
            <div className="mt-3 text-sm font-semibold v-gradient-text">{t.price}</div>
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        {!done && <Button onClick={activate} loading={activateMutation.isPending}>Activate Licence</Button>}
        {done && (
          <Button onClick={finalise} loading={finaliseMutation.isPending}>
            Complete Setup
          </Button>
        )}
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
