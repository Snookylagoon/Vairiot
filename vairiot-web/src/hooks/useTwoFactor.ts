import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface TwoFactorStatus {
  required: boolean;
  enabled: boolean;
  needsSetup: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
}

export function useTwoFactorStatus() {
  return useQuery<TwoFactorStatus>({
    queryKey: ['2fa', 'status'],
    queryFn: () => api.get('/api/v1/2fa/status').then(r => r.data),
  });
}

export function useSetupTwoFactor() {
  return useMutation<TwoFactorSetup>({
    mutationFn: () => api.post('/api/v1/2fa/setup').then(r => r.data),
  });
}

export function useVerifyTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api.post('/api/v1/2fa/verify', { token }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['2fa'] }),
  });
}

export function useDisableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/v1/2fa/disable').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['2fa'] }),
  });
}
