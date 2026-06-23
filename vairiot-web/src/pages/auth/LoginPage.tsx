import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginSchema, type LoginFormData } from '@/lib/schemas';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { getDeviceCheckIn } from '@/lib/device';

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
  const [setup, setSetup] = useState<{ setupToken: string; secret: string; otpauthUrl: string; backupCodes: string[] } | null>(null);
  const [setupVerify, setSetupVerify] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  const beginSetup = async (token: string) => {
    setSetupLoading(true);
    setError('');
    try {
      const { data } = await api.post('/api/v1/auth/2fa-setup/generate', { setupToken: token });
      setSetup({ setupToken: token, ...data });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Could not start 2FA setup.');
    } finally {
      setSetupLoading(false);
    }
  };

  const submitSetupVerify = async () => {
    if (!setup) return;
    setSetupLoading(true);
    setError('');
    try {
      const { data: result } = await api.post('/api/v1/auth/2fa-setup/verify', {
        setupToken: setup.setupToken,
        token: setupVerify,
        device: getDeviceCheckIn(),
      });
      localStorage.setItem('vairiot_access_token', result.accessToken);
      localStorage.setItem('vairiot_refresh_token', result.refreshToken);
      await hydrate();
      navigate('/dashboard');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Invalid verification code.');
    } finally {
      setSetupLoading(false);
    }
  };

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      const { data: result } = await api.post('/api/v1/auth/login', {
        email: data.email, password: data.password, tenantId: data.tenantId,
        device: getDeviceCheckIn(),
      });

      if (result.requiresPasswordChange) {
        setForced({ userId: result.passwordChangeUserId, currentPassword: data.password });
        return;
      }

      if (result.requiresTwoFactor) {
        setTwoFactor({ userId: result.twoFactorUserId });
        return;
      }

      if (result.requiresTwoFactorSetup) {
        await beginSetup(result.twoFactorSetupToken);
        return;
      }

      localStorage.setItem('vairiot_access_token', result.accessToken);
      localStorage.setItem('vairiot_refresh_token', result.refreshToken);
      await hydrate();
      navigate('/dashboard');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Invalid email, password, or organisation ID.');
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
        device: getDeviceCheckIn(),
      });

      if (result.requiresTwoFactor) {
        setForced(null);
        setPwNew(''); setPwConfirm('');
        setTwoFactor({ userId: result.twoFactorUserId });
        return;
      }

      if (result.requiresTwoFactorSetup) {
        setForced(null);
        setPwNew(''); setPwConfirm('');
        await beginSetup(result.twoFactorSetupToken);
        return;
      }

      localStorage.setItem('vairiot_access_token', result.accessToken);
      localStorage.setItem('vairiot_refresh_token', result.refreshToken);
      await hydrate();
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
        device: getDeviceCheckIn(),
      });
      localStorage.setItem('vairiot_access_token', result.accessToken);
      localStorage.setItem('vairiot_refresh_token', result.refreshToken);
      await hydrate();
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
            <p className="mt-2 text-sm text-gray-500">Asset Intelligence</p>
          </div>

          <div className="bg-white rounded-2xl shadow-v-card border border-gray-100 p-8 space-y-5">
            {setup ? (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Set Up Two-Factor Authentication</h2>
                <p className="text-sm text-gray-500">
                  2FA is required for your account. Scan the QR code with an authenticator app, save your backup codes, then enter a code to confirm.
                </p>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex flex-col items-center gap-3 p-4 bg-gray-50 rounded-xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.otpauthUrl)}`}
                    alt="2FA QR Code"
                    className="w-44 h-44 rounded-lg"
                  />
                  <div className="text-center">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Secret Key</div>
                    <code className="text-sm font-mono text-v-charcoal select-all break-all">{setup.secret}</code>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Save these backup codes somewhere safe — each can be used once if you lose your authenticator:
                  </p>
                  <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 rounded-xl">
                    {setup.backupCodes.map((c) => (
                      <code key={c} className="text-xs font-mono text-center text-v-charcoal">{c}</code>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    label="Verification Code"
                    value={setupVerify}
                    onChange={e => setSetupVerify(e.target.value)}
                    placeholder="123456"
                    maxLength={8}
                    className="text-center font-mono text-lg tracking-widest"
                    autoFocus
                  />
                  <Button
                    size="lg"
                    loading={setupLoading}
                    onClick={submitSetupVerify}
                    disabled={setupVerify.length < 6}
                    className="w-full"
                  >
                    Verify &amp; Sign in
                  </Button>
                </div>
              </>
            ) : forced ? (
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
                    placeholder="12 letters and numbers"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    maxLength={12}
                    autoFocus
                    hint="Exactly 12 characters — letters (A–Z, a–z) and numbers (0–9) only. No spaces or special characters."
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    placeholder="Repeat the new password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    maxLength={12}
                    success={
                      pwNew.length === 12 && /^[A-Za-z0-9]+$/.test(pwNew) && pwNew === pwConfirm
                        ? 'Passwords match'
                        : undefined
                    }
                  />
                  <Button
                    size="lg"
                    loading={pwLoading}
                    onClick={submitForced}
                    disabled={
                      pwNew.length !== 12 ||
                      !/^[A-Za-z0-9]+$/.test(pwNew) ||
                      pwNew !== pwConfirm
                    }
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
                <h2 className="text-lg font-bold text-v-charcoal">Sign in to your account</h2>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <Input label="Organisation" placeholder="Company name or ID" error={errors.tenantId?.message} {...register('tenantId')} />
                  <Input label="Email address" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
                  <Input label="Password" type="password" placeholder="••••••••" error={errors.password?.message} {...register('password')} />
                  <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">Sign in</Button>
                </form>

                <p className="text-center text-sm text-gray-500">
                  Don&apos;t have an account?{' '}
                  <Link to="/register" className="text-v-violet hover:underline font-medium">New Registration</Link>
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Two-Factor Verification</h2>
                <p className="text-sm text-gray-500">
                  Enter the 6-digit code from your authenticator app, or use a backup code.
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
