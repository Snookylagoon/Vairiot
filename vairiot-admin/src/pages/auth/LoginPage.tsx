import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginSchema, type LoginFormData } from '@/lib/schemas';
import { useState } from 'react';
import { api } from '@/lib/api';
import { TOKEN_KEY, REFRESH_KEY } from '@/lib/api';

export function LoginPage() {
  const { hydrate } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [twoFactor, setTwoFactor] = useState<{ userId: string } | null>(null);
  const [tfaToken, setTfaToken] = useState('');
  const [tfaLoading, setTfaLoading] = useState(false);
  const [forced, setForced] = useState<{ userId: string; currentPassword: string } | null>(null);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      const { data: result } = await api.post('/api/v1/auth/login', {
        email: data.email, password: data.password, tenantId: data.tenantId,
      });

      if (result.requiresPasswordChange) {
        setForced({ userId: result.passwordChangeUserId, currentPassword: data.password });
        return;
      }

      if (result.requiresTwoFactor) {
        setTwoFactor({ userId: result.twoFactorUserId });
        return;
      }

      localStorage.setItem(TOKEN_KEY, result.accessToken);
      localStorage.setItem(REFRESH_KEY, result.refreshToken);
      await hydrate();
      const { user } = useAuthStore.getState();
      if (!user) {
        setError('Access denied. This portal is restricted to platform administrators.');
        return;
      }
      navigate('/dashboard');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Invalid credentials or insufficient permissions.');
    }
  };

  const submitForced = async () => {
    if (!forced) return;
    if (pwNew !== pwConfirm) {
      setError('New passwords do not match.');
      return;
    }
    setPwLoading(true);
    setError('');
    try {
      const { data: result } = await api.post('/api/v1/auth/change-password/forced', {
        userId: forced.userId,
        currentPassword: forced.currentPassword,
        newPassword: pwNew,
      });

      if (result.requiresTwoFactor) {
        setForced(null);
        setPwNew(''); setPwConfirm('');
        setTwoFactor({ userId: result.twoFactorUserId });
        return;
      }

      localStorage.setItem(TOKEN_KEY, result.accessToken);
      localStorage.setItem(REFRESH_KEY, result.refreshToken);
      await hydrate();
      const { user } = useAuthStore.getState();
      if (!user) {
        setError('Access denied. This portal is restricted to platform administrators.');
        return;
      }
      navigate('/dashboard');
    } catch (e: unknown) {
      const resp = (e as { response?: { data?: { error?: string; errors?: Array<{ msg: string }> } } })?.response?.data;
      const msg = resp?.error ?? resp?.errors?.[0]?.msg;
      setError(msg ?? 'Could not change password.');
    } finally {
      setPwLoading(false);
    }
  };

  const submitTfa = async () => {
    if (!twoFactor || !tfaToken.trim()) return;
    setTfaLoading(true);
    setError('');
    try {
      const { data: result } = await api.post('/api/v1/auth/login/2fa', {
        userId: twoFactor.userId, token: tfaToken,
      });
      localStorage.setItem(TOKEN_KEY, result.accessToken);
      localStorage.setItem(REFRESH_KEY, result.refreshToken);
      await hydrate();
      const { user } = useAuthStore.getState();
      if (!user) {
        setError('Access denied. This portal is restricted to platform administrators.');
        return;
      }
      navigate('/dashboard');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Invalid verification code.');
    } finally {
      setTfaLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="h-2 bg-v-gradient" />

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold text-v-charcoal tracking-tight font-sans">
              VAIR<span className="v-gradient-text">IOT</span>
            </h1>
            <p className="mt-2 text-sm text-gray-500">Management Portal</p>
          </div>

          <div className="bg-white rounded-2xl shadow-v-card border border-gray-100 p-8 space-y-5">
            {forced ? (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Set a new password</h2>
                <p className="text-sm text-gray-500">
                  Your account requires a password change before you can continue.
                </p>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <Input
                    label="New password"
                    type="password"
                    placeholder="At least 12 characters"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    autoFocus
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    placeholder="Repeat the new password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    Must contain at least 12 characters, with an uppercase letter, a lowercase letter, a digit and a special character.
                  </p>
                  <Button
                    size="lg"
                    loading={pwLoading}
                    onClick={submitForced}
                    disabled={pwNew.length < 12 || pwConfirm.length < 12}
                    className="w-full"
                  >
                    Update password &amp; sign in
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setForced(null); setPwNew(''); setPwConfirm(''); setError(''); }}
                    className="w-full text-sm text-v-violet hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              </>
            ) : !twoFactor ? (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Administrator Sign In</h2>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <Input label="Organisation ID" placeholder="platform" error={errors.tenantId?.message} {...register('tenantId')} />
                  <Input label="Email address" type="email" placeholder="admin@vairiot.com" error={errors.email?.message} {...register('email')} />
                  <Input label="Password" type="password" placeholder="••••••••" error={errors.password?.message} {...register('password')} />
                  <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">Sign in</Button>
                </form>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Two-Factor Verification</h2>
                <p className="text-sm text-gray-500">
                  Enter the 6-digit code from your authenticator app.
                </p>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <Input
                    label="Verification Code"
                    value={tfaToken}
                    onChange={e => setTfaToken(e.target.value)}
                    placeholder="123456"
                    maxLength={8}
                    className="text-center font-mono text-lg tracking-widest"
                    autoFocus
                  />
                  <Button size="lg" loading={tfaLoading} onClick={submitTfa} disabled={tfaToken.length < 6} className="w-full">
                    Verify
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setTwoFactor(null); setTfaToken(''); setError(''); }}
                    className="w-full text-sm text-v-violet hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            RFID &amp; IoT Solutions &mdash; Vairiot &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
