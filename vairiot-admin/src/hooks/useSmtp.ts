import { useQuery } from '@tanstack/react-query';

import { useMutationWithToast } from './useMutationWithToast';

import { api } from '@/lib/api';

export type SmtpProvider = 'smtp' | 'resend';

export interface SmtpView {
  configured: boolean;
  provider: SmtpProvider;
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromAddress: string | null;
  active: boolean;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  updatedAt: string | null;
}

export interface SmtpInput {
  provider: SmtpProvider;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string;
  active: boolean;
}

export function useSmtp() {
  return useQuery<SmtpView>({
    queryKey: ['admin', 'smtp'],
    queryFn: () => api.get('/api/v1/admin/platform/smtp').then(r => r.data),
  });
}

export function useSaveSmtp() {
  return useMutationWithToast<SmtpView, SmtpInput>({
    mutationFn: (input) => api.put('/api/v1/admin/platform/smtp', input).then(r => r.data),
    invalidate: ['admin', 'smtp'],
    success: 'SMTP settings saved',
    error: 'Failed to save SMTP settings',
  });
}

export function useVerifySmtp() {
  return useMutationWithToast<{ ok: boolean; error?: string }, void>({
    mutationFn: () => api.post('/api/v1/admin/platform/smtp/verify').then(r => r.data),
    invalidate: ['admin', 'smtp'],
    success: 'Verify request completed',
    error: 'Failed to verify SMTP',
  });
}

export function useTestSmtp() {
  return useMutationWithToast<{ ok: boolean; error?: string; messageId?: string }, string>({
    mutationFn: (to) => api.post('/api/v1/admin/platform/smtp/test', { to }).then(r => r.data),
    invalidate: ['admin', 'smtp'],
    success: 'Test email request completed',
    error: 'Failed to send test email',
  });
}
