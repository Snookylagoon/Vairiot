import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface OnboardingProgress {
  steps: Record<string, { completed: boolean; completedAt?: string }>;
  nextStep: string | null;
  allComplete: boolean;
}

export function useOnboardingProgress() {
  return useQuery<OnboardingProgress>({
    queryKey: ['onboarding', 'progress'],
    queryFn: () => api.get('/api/v1/onboarding/progress').then(r => r.data),
  });
}

export function useCompleteUserStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; phone?: string }) =>
      api.post('/api/v1/onboarding/user', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}

export interface Company {
  id: string;
  legalName: string;
  tradingName?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode?: string | null;
  country: string;
  primaryContactEmail: string;
  primaryContactPhone?: string | null;
}

export function useCompany() {
  return useQuery<Company | null>({
    queryKey: ['onboarding', 'company'],
    queryFn: () => api.get('/api/v1/onboarding/company').then(r => r.data),
  });
}

export function useCompleteCompanyStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyName: string; registrationNumber?: string; address: string; city: string; country: string }) =>
      api.post('/api/v1/onboarding/company', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}

export function useCompleteClientStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientName: string; contactEmail: string; signatoryName: string; signatoryEmail: string }) =>
      api.post('/api/v1/onboarding/client', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}

export function useActivateLicence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tierName: string }) =>
      api.post('/api/v1/onboarding/licence', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}

export function useFinaliseOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/v1/onboarding/complete').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}
