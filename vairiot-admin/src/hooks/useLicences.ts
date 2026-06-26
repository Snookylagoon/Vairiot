import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMutationWithToast } from './useMutationWithToast';

export function useLicences(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['admin', 'licences', params],
    queryFn: () => api.get('/api/v1/licences/all', { params }).then(r => r.data),
  });
}

export function useRenewLicence() {
  return useMutationWithToast<unknown, { licenceId: string; durationMonths?: number }>({
    mutationFn: ({ licenceId, durationMonths }) =>
      api.post(`/api/v1/licences/${licenceId}/renew`, durationMonths ? { durationMonths } : {}).then(r => r.data),
    invalidate: ['admin', 'licences'],
    success: 'Licence renewed',
    error: 'Failed to renew licence',
  });
}

export function useSuspendLicence() {
  return useMutationWithToast<unknown, { licenceId: string; reason?: string }>({
    mutationFn: ({ licenceId, reason }) =>
      api.post(`/api/v1/licences/${licenceId}/suspend`, { reason }).then(r => r.data),
    invalidate: ['admin', 'licences'],
    success: 'Licence suspended',
    error: 'Failed to suspend licence',
  });
}

export function useRevokeLicence() {
  return useMutationWithToast<unknown, { licenceId: string; reason?: string }>({
    mutationFn: ({ licenceId, reason }) =>
      api.post(`/api/v1/licences/${licenceId}/revoke`, { reason }).then(r => r.data),
    invalidate: ['admin', 'licences'],
    success: 'Licence revoked',
    error: 'Failed to revoke licence',
  });
}

export function useReactivateLicence() {
  return useMutationWithToast<unknown, string>({
    mutationFn: (licenceId) =>
      api.post(`/api/v1/licences/${licenceId}/reactivate`).then(r => r.data),
    invalidate: ['admin', 'licences'],
    success: 'Licence reactivated',
    error: 'Failed to reactivate licence',
  });
}

export function useChangeDuration() {
  return useMutationWithToast<unknown, { licenceId: string; durationMonths: number }>({
    mutationFn: ({ licenceId, durationMonths }) =>
      api.patch(`/api/v1/licences/${licenceId}/duration`, { durationMonths }).then(r => r.data),
    invalidate: ['admin', 'licences'],
    success: 'Duration updated',
    error: 'Failed to change duration',
  });
}

export function useAddDeviceSlot() {
  return useMutationWithToast<unknown, string>({
    mutationFn: (licenceId) =>
      api.post(`/api/v1/licences/${licenceId}/device-slots`).then(r => r.data),
    invalidate: ['admin', 'licences'],
    success: 'Device slot added',
    error: 'Failed to add device slot',
  });
}

export function useLicenceDevices(licenceId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'licence-devices', licenceId],
    queryFn: () => api.get(`/api/v1/licences/${licenceId}/devices`).then(r => r.data),
    enabled: !!licenceId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useActivateDevice() {
  return useMutationWithToast<unknown, { licenceId: string; deviceId: string }>({
    mutationFn: ({ licenceId, deviceId }) =>
      api.patch(`/api/v1/licences/${licenceId}/devices/${deviceId}/activate`).then(r => r.data),
    invalidate: ['admin', 'licence-devices'],
    success: 'Device activated',
    error: 'Failed to activate device',
  });
}

export function useDeactivateDevice() {
  return useMutationWithToast<unknown, { licenceId: string; deviceId: string }>({
    mutationFn: ({ licenceId, deviceId }) =>
      api.patch(`/api/v1/licences/${licenceId}/devices/${deviceId}/deactivate`).then(r => r.data),
    invalidate: ['admin', 'licence-devices'],
    success: 'Device deactivated',
    error: 'Failed to deactivate device',
  });
}

export function useDeleteDevice() {
  return useMutationWithToast<unknown, { licenceId: string; deviceId: string }>({
    mutationFn: ({ licenceId, deviceId }) =>
      api.delete(`/api/v1/licences/${licenceId}/devices/${deviceId}`).then(r => r.data),
    invalidate: ['admin', 'licence-devices'],
    success: 'Device removed',
    error: 'Failed to remove device',
  });
}
