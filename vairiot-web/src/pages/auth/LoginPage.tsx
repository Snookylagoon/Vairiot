import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';

interface LoginForm { email: string; password: string; tenantId: string; }

export function LoginPage() {
  const { login } = useAuthStore();
  const navigate   = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    try {
      setError('');
      await login(data.email, data.password, data.tenantId);
      navigate('/dashboard');
    } catch {
      setError('Invalid email, password, or organisation ID.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Gradient header band */}
      <div className="h-2 bg-v-gradient" />

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Logo area */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold text-v-charcoal tracking-tight font-sans">
              VAIR<span className="v-gradient-text">IOT</span>
            </h1>
            <p className="mt-2 text-sm text-gray-500">Enhanced Asset Management</p>
          </div>

          {/* Login card */}
          <div className="bg-white rounded-2xl shadow-v-card border border-gray-100 p-8 space-y-5">
            <h2 className="text-lg font-bold text-v-charcoal">Sign in to your account</h2>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Organisation ID"
                placeholder="your-organisation"
                error={errors.tenantId?.message}
                {...register('tenantId', { required: 'Organisation ID is required' })}
              />
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email', { required: 'Email is required' })}
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                error={errors.password?.message}
                {...register('password', { required: 'Password is required' })}
              />
              <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">
                Sign in
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            RFID &amp; IoT Solutions &mdash; Vairiot &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
