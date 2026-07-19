import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

const PASSWORD_LENGTH = 12;
const ALPHANUMERIC = /^[A-Za-z0-9]+$/;
const PASSWORD_HINT =
  `Exactly ${PASSWORD_LENGTH} characters — letters (A–Z, a–z) and numbers (0–9) only. No spaces or special characters.`;

function isValidPassword(value: string) {
  return value.length === PASSWORD_LENGTH && ALPHANUMERIC.test(value);
}

export function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextValid = isValidPassword(next);
  const matches = nextValid && next === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nextValid) {
      setError(PASSWORD_HINT);
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (current === next) {
      setError('New password must be different from the current password.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/v1/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      toast.success('Password updated');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { error?: string; errors?: Array<{ msg: string }> } } })?.response?.data;
      const msg = resp?.error ?? resp?.errors?.[0]?.msg ?? 'Could not change password';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-v-charcoal mb-1">Change password</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter your current password and a new one. Sign-in sessions stay valid after the change.
      </p>

      <form onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl shadow-v-card p-6 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Input
          label="Current password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Input
          label="New password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
          maxLength={PASSWORD_LENGTH}
          hint={PASSWORD_HINT}
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          maxLength={PASSWORD_LENGTH}
          success={matches ? 'Passwords match' : undefined}
        />

        <Button
          type="submit"
          size="lg"
          loading={loading}
          disabled={!current || !matches}
        >
          Update password
        </Button>
      </form>
    </div>
  );
}
