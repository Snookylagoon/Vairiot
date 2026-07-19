import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { registerSchema, type RegisterFormData } from '@/lib/schemas';
import { useAuthStore } from '@/stores/auth.store';

export function RegisterPage() {
  const { hydrate } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setError('');
      const { data: result } = await api.post('/api/v1/auth/register', {
        organisationName: data.organisationName,
        name: data.name,
        email: data.email,
        password: data.password,
      });

      localStorage.setItem('vairiot_access_token', result.accessToken);
      localStorage.setItem('vairiot_refresh_token', result.refreshToken);
      await hydrate();
      navigate('/onboarding');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Registration failed. Please try again.');
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
            <h2 className="text-lg font-bold text-v-charcoal">New Registration</h2>
            <p className="text-sm text-gray-500">
              Create a new organisation to get started with Vairiot.
            </p>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input label="Organisation Name" placeholder="Acme Ltd" error={errors.organisationName?.message} {...register('organisationName')} />
              <Input label="Your Name" placeholder="Jane Smith" error={errors.name?.message} {...register('name')} />
              <Input label="Email Address" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
              <Input label="Password" type="password" placeholder="12+ characters" error={errors.password?.message} {...register('password')} />
              <Input label="Confirm Password" type="password" placeholder="Repeat password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
              <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">Create Account</Button>
            </form>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-v-violet hover:underline font-medium">Sign in</Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            RFID &amp; IoT Solutions &mdash; Vairiot &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
