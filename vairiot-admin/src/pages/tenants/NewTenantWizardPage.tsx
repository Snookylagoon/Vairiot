import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCreateTenant, type CreateTenantResult } from '@/hooks/useAdmin';
import { toast } from 'sonner';

// Visual stepper — Step 1 lives on this page; Steps 2–5 are the existing
// TenantOnboardingPage flow (Company → Client → Licence), which we navigate
// to after the tenant is created. "Complete" is a synthetic 5th chip so the
// admin sees the full arc up front.
const STEPS = [
  { key: 'tenant',   label: 'Tenant + Admin' },
  { key: 'company',  label: 'Organisation'   },
  { key: 'client',   label: 'Client (opt.)'  },
  { key: 'licence',  label: 'Licence'        },
  { key: 'complete', label: 'Complete'       },
] as const;

const PASSWORD_HINT =
  'Exactly 12 characters — letters (A–Z, a–z) and numbers (0–9) only. No spaces or symbols.';

/**
 * Turn an organisation name into a suggested Login ID.
 * "Vairiot Demo Co." → "vairiot-demo-co"
 */
function slugify(source: string): string {
  return source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function NewTenantWizardPage() {
  const navigate = useNavigate();
  const create = useCreateTenant();

  const [form, setForm] = useState({
    organisationName: '',
    loginId: '',
    adminName: '',
    adminEmail: '',
    adminMode: 'invite' as 'invite' | 'password',
    adminPassword: '',
  });
  // Tracks whether the user has manually typed into Login ID. Until they do,
  // it auto-follows the organisation name (slugified). Once they edit it, we
  // stop auto-updating so we don't clobber their choice.
  const [loginIdTouched, setLoginIdTouched] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const setOrganisationName = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => ({
      ...f,
      organisationName: v,
      loginId: loginIdTouched ? f.loginId : slugify(v),
    }));
  };

  const setLoginId = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoginIdTouched(true);
    // Force lowercase + safe chars while typing so it always matches server rules.
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm(f => ({ ...f, loginId: cleaned }));
  };

  const [result, setResult] = useState<CreateTenantResult | null>(null);

  const validatePassword = (p: string): string | null => {
    if (p.length !== 12) return 'Password must be exactly 12 characters';
    if (!/^[A-Za-z0-9]+$/.test(p)) return 'Password must contain only letters and numbers';
    return null;
  };

  const validateLoginId = (id: string): string | null => {
    if (id.length < 3 || id.length > 32) return 'Login ID must be 3–32 characters';
    if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(id)) {
      return 'Login ID must be lowercase letters, numbers, and hyphens (starting and ending with a letter or number)';
    }
    return null;
  };

  const submit = async () => {
    if (!form.organisationName.trim()) { toast.error('Organisation name is required'); return; }
    if (!form.loginId.trim())          { toast.error('Login ID is required');           return; }
    const idErr = validateLoginId(form.loginId.trim());
    if (idErr)                          { toast.error(idErr); return; }
    if (!form.adminName.trim())        { toast.error('Admin user name is required');   return; }
    if (!form.adminEmail.trim())       { toast.error('Admin email is required');       return; }
    if (form.adminMode === 'password') {
      const err = validatePassword(form.adminPassword);
      if (err) { toast.error(err); return; }
    }
    const res = await create.mutateAsync({
      organisationName: form.organisationName.trim(),
      loginId:          form.loginId.trim(),
      adminName:        form.adminName.trim(),
      adminEmail:       form.adminEmail.trim(),
      adminMode:        form.adminMode,
      adminPassword:    form.adminMode === 'password' ? form.adminPassword : undefined,
    });
    setResult(res);
  };

  const continueOnboarding = () => {
    if (!result) return;
    navigate(`/tenants/${result.tenantId}/onboarding`);
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/tenants')}
        className="flex items-center gap-1 text-sm text-v-violet hover:underline"
      >
        <ArrowLeft size={16} /> Back to Tenants
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-h1 text-v-charcoal">New Tenant</h1>
        <span className="text-gray-500">— guided setup</span>
      </div>

      <Stepper active={result ? 'company' : 'tenant'} />

      <div className="max-w-2xl">
        {!result ? (
          <Card>
            <CardHeader><h2 className="text-h3 text-v-charcoal">Tenant &amp; Primary Admin</h2></CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-500">
                Create the tenant workspace and its first Company Admin user.
                A FREE licence is activated automatically so the tenant can log in
                straight away — you can upgrade the tier in the Licence step.
              </p>

              <Input
                label="Organisation Name"
                value={form.organisationName}
                onChange={setOrganisationName}
                placeholder="Acme Ltd"
              />

              <Input
                label="Login ID"
                value={form.loginId}
                onChange={setLoginId}
                placeholder="acme-ltd"
                hint="What a user types into the Organisation field on the sign-in page. Lowercase letters, numbers, and hyphens only. Defaults to a short version of the organisation name — edit if you prefer something else."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Admin Full Name"
                  value={form.adminName}
                  onChange={set('adminName')}
                  placeholder="Jane Smith"
                />
                <Input
                  label="Admin Email"
                  type="email"
                  value={form.adminEmail}
                  onChange={set('adminEmail')}
                  placeholder="jane@acme.com"
                />
              </div>

              <fieldset className="space-y-2 pt-2 border-t border-gray-100">
                <legend className="text-sm font-medium text-v-charcoal mb-1">
                  How should the admin set their password?
                </legend>
                <RadioRow
                  name="mode"
                  value="invite"
                  checked={form.adminMode === 'invite'}
                  onChange={() => setForm(f => ({ ...f, adminMode: 'invite' }))}
                  title="Send an invite email"
                  description="A one-time password is emailed to the admin. They must change it on first sign-in. Requires SMTP to be configured."
                />
                <RadioRow
                  name="mode"
                  value="password"
                  checked={form.adminMode === 'password'}
                  onChange={() => setForm(f => ({ ...f, adminMode: 'password' }))}
                  title="Set a temporary password"
                  description="You choose the password now and relay it to the admin. They must change it on first sign-in."
                />
              </fieldset>

              {form.adminMode === 'password' && (
                <Input
                  label="Temporary Password"
                  type="password"
                  value={form.adminPassword}
                  onChange={set('adminPassword')}
                  hint={PASSWORD_HINT}
                  placeholder="12 characters, letters and numbers"
                />
              )}

              <div className="flex justify-end gap-3 items-center pt-2 border-t border-gray-100">
                <Button variant="ghost" onClick={() => navigate('/tenants')}>Cancel</Button>
                <Button onClick={submit} loading={create.isPending}>
                  Create &amp; Continue
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <CreatedCard result={result} onContinue={continueOnboarding} />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Stepper({ active }: { active: (typeof STEPS)[number]['key'] }) {
  const activeIndex = STEPS.findIndex(s => s.key === active);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STEPS.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone   = i < activeIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                isActive ? 'bg-v-violet text-white shadow-sm'
                : isDone ? 'bg-green-100 text-green-700'
                         : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span>{i + 1}</span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300" />}
          </div>
        );
      })}
    </div>
  );
}

function RadioRow({
  name, value, checked, onChange, title, description,
}: {
  name: string; value: string; checked: boolean; onChange: () => void;
  title: string; description: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition ${
        checked ? 'border-v-violet bg-v-violet/5' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-v-violet"
      />
      <span>
        <span className="block text-sm font-medium text-v-charcoal">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
      </span>
    </label>
  );
}

function CreatedCard({ result, onContinue }: { result: CreateTenantResult; onContinue: () => void }) {
  const copyPassword = async () => {
    if (!result.temporaryPassword) return;
    await navigator.clipboard.writeText(result.temporaryPassword);
    toast.success('Password copied to clipboard');
  };

  return (
    <Card>
      <CardHeader><h2 className="text-h3 text-v-charcoal">Tenant Created</h2></CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-gray-500">
          The workspace and Company Admin user are ready. A FREE licence is active.
        </p>

        {result.adminMode === 'invite' && result.inviteEmailSent && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            An invite email has been sent to the admin. They'll be asked to set their own
            password on first sign-in.
          </div>
        )}

        {result.adminMode === 'invite' && !result.inviteEmailSent && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-2">
            <p className="font-medium">Invite email could not be sent.</p>
            {result.inviteEmailError && (
              <p className="text-xs text-amber-700 font-mono">{result.inviteEmailError}</p>
            )}
            <p>
              You can relay the temporary password below to the admin manually,
              or configure SMTP and resend the invite from the tenant page.
            </p>
          </div>
        )}

        {result.temporaryPassword && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-v-charcoal">Temporary Password</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-v-charcoal">
                {result.temporaryPassword}
              </code>
              <Button size="sm" variant="secondary" onClick={copyPassword}>
                <Copy size={14} className="mr-1" /> Copy
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              The admin must change this on first sign-in. This is the only time it's shown.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-gray-100">
          <Button onClick={onContinue}>Continue Onboarding →</Button>
        </div>
      </CardBody>
    </Card>
  );
}
