import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDeviceFingerprint } from '@/lib/device';
import { useAuthStore } from '@/stores/auth.store';
import { DEVICE_HEARTBEAT_INTERVAL_SECONDS } from 'vairiot-shared';

export interface LicenceStatus {
  licence: {
    id: string;
    licenceNumber: string;
    tierName: string;
    status: string;
    startDate: string;
    expiryDate: string | null;
    isPerpetual: boolean;
  } | null;
  tier: { maxAssets: number; pricePerYear: number } | null;
  usage: {
    assetCount: number;
    deviceCount: number;
    deviceAllowance: number;
    deviceOnline: number;
    deviceWaiting: number;
  };
  daysRemaining: number | null;
}

export interface DeviceInfo {
  id: string;
  deviceName: string;
  deviceType: string;
  fingerprint: string | null;
  lastSeenAt: string | null;
  active: boolean;
  online: boolean;
  user: { id: string; name: string; email: string } | null;
  licence: { id: string; licenceNumber: string } | null;
}

export function useLicenceStatus() {
  return useQuery<LicenceStatus>({
    queryKey: ['licence', 'status'],
    queryFn: async () => {
      const { data: d } = await api.get('/api/v1/licences/status');
      return {
        licence: {
          id: d.licenceId,
          licenceNumber: d.licenceNumber,
          tierName: d.tierName,
          status: d.status,
          startDate: d.activatedAt,
          expiryDate: d.expiresAt,
          isPerpetual: d.expiresAt === null,
        },
        tier: { maxAssets: d.assetCap, pricePerYear: 0 },
        usage: {
          assetCount: d.assetCount,
          deviceCount: d.deviceCount,
          deviceAllowance: d.deviceAllowance,
          deviceOnline: d.deviceOnline ?? 0,
          deviceWaiting: d.deviceWaiting ?? 0,
        },
        daysRemaining: d.daysRemaining,
      };
    },
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

export function useActivateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.patch(`/api/v1/licences/devices/${deviceId}/activate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

/**
 * Keeps this browser's device row marked "connected" while the app is open by
 * pinging the heartbeat endpoint on an interval. No-op when logged out.
 */
export function useDeviceHeartbeat() {
  const user = useAuthStore(s => s.user);
  useEffect(() => {
    if (!user) return;
    const fingerprint = getDeviceFingerprint();
    const ping = () =>
      api.post('/api/v1/licences/devices/heartbeat', { fingerprint }).catch(() => {});
    ping();
    const id = setInterval(ping, DEVICE_HEARTBEAT_INTERVAL_SECONDS * 1000);
    return () => clearInterval(id);
  }, [user]);
}

export function useDeactivateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.patch(`/api/v1/licences/devices/${deviceId}/deactivate`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) =>
      api.delete(`/api/v1/licences/devices/${deviceId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['licence'] }),
  });
}

// ── Licensing Authority routes ───────────────────────────────────────────────

export function useAllLicences(params: Record<string, string> = {}) {
  return useQuery<unknown[]>({
    queryKey: ['licence', 'all', params],
    queryFn: () => api.get('/api/v1/licences/all', { params }).then(r => r.data),
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
