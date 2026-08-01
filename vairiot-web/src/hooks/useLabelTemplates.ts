import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';

/** Persisted label design. `config` is the full designer state (barcode
 *  standard, size, field toggles, logo scale and freeform layout). */
export interface LabelTemplate {
  id: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function useLabelTemplates() {
  return useQuery<LabelTemplate[]>({
    queryKey: ['label-templates'],
    queryFn: () => api.get('/api/v1/labels/templates').then(r => r.data),
  });
}

export function useSaveLabelTemplate() {
  const qc = useQueryClient();
  return useMutation<LabelTemplate, unknown, { name: string; config: Record<string, unknown> }>({
    mutationFn: (data) => api.post('/api/v1/labels/templates', data).then(r => r.data),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['label-templates'] });
      toast.success(`Template “${t.name}” saved`);
    },
    onError: () => toast.error('Failed to save template'),
  });
}

export function useDeleteLabelTemplate() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, string>({
    mutationFn: (id) => api.delete(`/api/v1/labels/templates/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['label-templates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });
}

/* ── Company logo ──────────────────────────────────────────────────────── */

export interface CompanyLogo {
  dataUrl: string;
  width: number;
  height: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Fetches the tenant's company logo as a data URL (safe for canvas + print
 *  windows — no CORS taint). Resolves to null when no logo is uploaded. */
export function useCompanyLogo() {
  return useQuery<CompanyLogo | null>({
    queryKey: ['company', 'logo'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/onboarding/company/logo', { responseType: 'blob' });
        const dataUrl = await blobToDataUrl(res.data);
        const { width, height } = await imageDimensions(dataUrl);
        return { dataUrl, width, height };
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUploadCompanyLogo() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, File>({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post('/api/v1/onboarding/company/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', 'logo'] });
      qc.invalidateQueries({ queryKey: ['onboarding', 'company'] });
      toast.success('Logo uploaded');
    },
    onError: () => toast.error('Failed to upload logo (JPEG, PNG or WebP, max 5 MB)'),
  });
}

export function useDeleteCompanyLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/api/v1/onboarding/company/logo').then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', 'logo'] });
      qc.invalidateQueries({ queryKey: ['onboarding', 'company'] });
      toast.success('Logo removed');
    },
    onError: () => toast.error('Failed to remove logo'),
  });
}
