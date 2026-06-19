import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface LicenceStatus {
  licence: {
    id: string;
    tierName: string;
    status: string;
    startDate: string;
    expiryDate: string | null;
    isPerpetual: boolean;
  } | null;
  tier: { maxAssets: number; pricePerYear: number } | null;
  usage: { assetCount: number; deviceCount: number; deviceAllowance: number };
  daysRemaining: number | null;
}

export interface DeviceInfo {
  id: string;
  deviceName: string;
  deviceType: string;
  fingerprint: string;
  lastSeenAt: string;
  active: boolean;
}

export function useLicenceStatus() {
  return useQuery<LicenceStatus>({
    queryKey: ['licence', 'status'],
    queryFn: () => api.get('/api/v1/licences/status').then(r => r.data),
  });
}

export function useDevices() {
  return useQuery<DeviceInfo[]>({
    queryKey: ['licence', 'devices'],
    queryFn: () => api.get('/api/v1/licences/devices').then(r => r.data),
  });
}

export function useRegisterDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { deviceName: string; deviceType: string; fingerprint: string }) =>
      api.post('/api/v1/licences/devices', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

// ── Licensing Authority routes ───────────────────────────────────────────────

export function useAllLicences() {
  return useQuery<unknown[]>({
    queryKey: ['licence', 'all'],
    queryFn: () => api.get('/api/v1/licences/all').then(r => r.data),
  });
}

export function useRenewLicence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, durationMonths }: { id: string; durationMonths?: number }) =>
      api.post(`/api/v1/licences/${id}/renew`, { durationMonths }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

export function useChangeDuration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, durationMonths }: { id: string; durationMonths: number }) =>
      api.patch(`/api/v1/licences/${id}/duration`, { durationMonths }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

export function useSuspendLicence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/licences/${id}/suspend`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

export function useRevokeLicence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/licences/${id}/revoke`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

export function useReactivateLicence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/licences/${id}/reactivate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

export function useAddDeviceSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/licences/${id}/device-slots`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}
