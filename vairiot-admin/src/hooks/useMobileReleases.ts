import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMutationWithToast } from './useMutationWithToast';

export interface MobileRelease {
  id: string;
  versionCode: number;
  versionName: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  releaseNotes: string | null;
  mandatory: boolean;
  isCurrent: boolean;
  uploadedByUserId: string | null;
  uploadedAt: string;
}

export function useMobileReleases() {
  return useQuery<MobileRelease[]>({
    queryKey: ['admin', 'mobile-releases'],
    queryFn: () => api.get('/api/v1/admin/mobile-releases').then(r => r.data),
  });
}

export interface UploadReleaseInput {
  apk: File;
  versionCode: number;
  versionName: string;
  releaseNotes?: string;
  mandatory?: boolean;
  setCurrent?: boolean;
}

export function useUploadMobileRelease() {
  return useMutationWithToast<MobileRelease, UploadReleaseInput>({
    mutationFn: (input) => {
      const fd = new FormData();
      fd.append('apk', input.apk);
      fd.append('versionCode', String(input.versionCode));
      fd.append('versionName', input.versionName);
      if (input.releaseNotes) fd.append('releaseNotes', input.releaseNotes);
      if (input.mandatory)   fd.append('mandatory', 'true');
      if (input.setCurrent === false) fd.append('setCurrent', 'false');
      return api.post('/api/v1/admin/mobile-releases', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    invalidate: ['admin', 'mobile-releases'],
    success: 'Release uploaded',
    error: 'Failed to upload release',
  });
}

export interface PatchReleaseInput {
  id: string;
  isCurrent?: boolean;
  mandatory?: boolean;
  releaseNotes?: string;
}

export function usePatchMobileRelease() {
  return useMutationWithToast<MobileRelease, PatchReleaseInput>({
    mutationFn: ({ id, ...rest }) =>
      api.patch(`/api/v1/admin/mobile-releases/${id}`, rest).then(r => r.data),
    invalidate: ['admin', 'mobile-releases'],
    success: 'Release updated',
    error: 'Failed to update release',
  });
}

export function downloadMobileRelease(release: MobileRelease) {
  return api.get(`/api/v1/admin/mobile-releases/${release.id}/download`, {
    responseType: 'blob',
  }).then(r => {
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vairiot-${release.versionName}.apk`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function useDeleteMobileRelease() {
  return useMutationWithToast<{ message: string }, string>({
    mutationFn: (id) => api.delete(`/api/v1/admin/mobile-releases/${id}`).then(r => r.data),
    invalidate: ['admin', 'mobile-releases'],
    success: 'Release deleted',
    error: 'Failed to delete release',
  });
}
