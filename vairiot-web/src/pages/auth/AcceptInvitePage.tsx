import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams, Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { acceptInviteSchema, type AcceptInviteFormData } from '@/lib/schemas';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
  });

  const onSubmit = async (data: AcceptInviteFormData) => {
    try {
      setError('');
      await api.post('/api/v1/auth/accept-invite', { token, password: data.password });
      setSuccess(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to activate account. The invitation may have expired.');
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
            <p className="mt-2 text-sm text-gray-500">Enhanced Asset Management</p>
          </div>

          <div className="bg-white rounded-2xl shadow-v-card border border-gray-100 p-8 space-y-5">
            {!token ? (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Invalid Invitation</h2>
                <p className="text-sm text-gray-500">
                  This invitation link is missing or malformed. Please check the link in your email.
                </p>
                <Link to="/login" className="text-sm text-v-violet hover:underline">Back to sign in</Link>
              </>
            ) : success ? (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Account Activated</h2>
                <p className="text-sm text-gray-500">
                  Your password has been set and your account is now active. You can sign in.
                </p>
                <Link to="/login">
                  <Button size="lg" className="w-full mt-2">Go to sign in</Button>
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-v-charcoal">Set Your Password</h2>
                <p className="text-sm text-gray-500">
                  You have been invited to join an organisation on Vairiot. Set a password to activate your account.
                </p>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <Input label="Password" type="password" placeholder="12+ characters" error={errors.password?.message} {...register('password')} />
                  <Input label="Confirm password" type="password" placeholder="Repeat password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
                  <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">Activate Account</Button>
                </form>
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
