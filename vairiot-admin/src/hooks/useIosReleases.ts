import { useMutation, useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useMutationWithToast } from './useMutationWithToast';

export interface IosRelease {
  id: string;
  versionCode: number;
  versionName: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  releaseNotes: string | null;
  isCurrent: boolean;
  uploadedByUserId: string | null;
  uploadedAt: string;
}

export interface IosDevice {
  id: string;
  udid: string;
  product: string | null;
  osVersion: string | null;
  serial: string | null;
  name: string | null;
  registered: boolean;
  createdAt: string;
}

export function useIosReleases() {
  return useQuery<IosRelease[]>({
    queryKey: ['admin', 'ios-releases'],
    queryFn: () => api.get('/api/v1/admin/ios-releases').then(r => r.data),
  });
}

export interface UploadIosReleaseInput {
  ipa: File;
  versionCode: number;
  versionName: string;
  releaseNotes?: string;
  setCurrent?: boolean;
}

export function useUploadIosRelease() {
  return useMutationWithToast<IosRelease, UploadIosReleaseInput>({
    mutationFn: (input) => {
      const fd = new FormData();
      fd.append('ipa', input.ipa);
      fd.append('versionCode', String(input.versionCode));
      fd.append('versionName', input.versionName);
      if (input.releaseNotes) fd.append('releaseNotes', input.releaseNotes);
      if (input.setCurrent === false) fd.append('setCurrent', 'false');
      return api.post('/api/v1/admin/ios-releases', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    invalidate: ['admin', 'ios-releases'],
    success: 'iOS release uploaded',
    error: 'Failed to upload iOS release',
  });
}

export interface PatchIosReleaseInput {
  id: string;
  isCurrent?: boolean;
  releaseNotes?: string;
}

export function usePatchIosRelease() {
  return useMutationWithToast<IosRelease, PatchIosReleaseInput>({
    mutationFn: ({ id, ...rest }) =>
      api.patch(`/api/v1/admin/ios-releases/${id}`, rest).then(r => r.data),
    invalidate: ['admin', 'ios-releases'],
    success: 'Release updated',
    error: 'Failed to update release',
  });
}

// Same pattern as APK downloads: buffer the blob client-side and track
// isPending per-mutation so the button can show a spinner.
export function useDownloadIosRelease() {
  return useMutation<void, AxiosError<{ error?: string }>, IosRelease>({
    mutationFn: async (release) => {
      const res = await api.get(`/api/v1/admin/ios-releases/${release.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vairiot-${release.versionName}.ipa`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error ?? 'Failed to download release');
    },
  });
}

export function useDeleteIosRelease() {
  return useMutationWithToast<{ message: string }, string>({
    mutationFn: (id) => api.delete(`/api/v1/admin/ios-releases/${id}`).then(r => r.data),
    invalidate: ['admin', 'ios-releases'],
    success: 'Release deleted',
    error: 'Failed to delete release',
  });
}

export function useIosDevices() {
  return useQuery<IosDevice[]>({
    queryKey: ['admin', 'ios-devices'],
    queryFn: () => api.get('/api/v1/admin/ios-releases/devices').then(r => r.data),
  });
}

export interface PatchIosDeviceInput {
  id: string;
  name?: string;
  registered?: boolean;
}

export function usePatchIosDevice() {
  return useMutationWithToast<IosDevice, PatchIosDeviceInput>({
    mutationFn: ({ id, ...rest }) =>
      api.patch(`/api/v1/admin/ios-releases/devices/${id}`, rest).then(r => r.data),
    invalidate: ['admin', 'ios-devices'],
    success: 'Device updated',
    error: 'Failed to update device',
  });
}

export function useDeleteIosDevice() {
  return useMutationWithToast<{ message: string }, string>({
    mutationFn: (id) => api.delete(`/api/v1/admin/ios-releases/devices/${id}`).then(r => r.data),
    invalidate: ['admin', 'ios-devices'],
    success: 'Device deleted',
    error: 'Failed to delete device',
  });
}
