import { useQuery } from '@tanstack/react-query';
import type { ConditionScaleEntry } from 'vairiot-shared';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';

// Condition scale and photo rules (Phase 1 W5, stage 1.14).

export interface ConditionScale {
  source: 'category' | 'tenant' | 'default';
  entries: ConditionScaleEntry[];
}

export interface PhotoRules {
  defaultMinPhotos: number;
  categories: Array<{ categoryId: string; minPhotosAtInventory: number }>;
}

/** The scale for a category (its own, else the tenant's, else the default). */
export function useConditionScale(categoryId?: string | null) {
  return useQuery<ConditionScale>({
    queryKey: ['condition-scale', categoryId ?? ''],
    queryFn: () => api.get('/api/v1/condition/scale', { params: categoryId ? { categoryId } : {} }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveConditionScale() {
  return useMutationWithToast<ConditionScale, { categoryId: string | null; entries: ConditionScaleEntry[] | null }>({
    mutationFn: (body) => api.put('/api/v1/condition/scale', body).then(r => r.data),
    invalidate: ['condition-scale'],
    success: 'Condition scale saved',
    error: 'Could not save the condition scale',
  });
}

export function usePhotoRules() {
  return useQuery<PhotoRules>({
    queryKey: ['photo-rules'],
    queryFn: () => api.get('/api/v1/condition/photo-rules').then(r => r.data),
  });
}

export function useSavePhotoRules() {
  return useMutationWithToast<PhotoRules, PhotoRules>({
    mutationFn: (body) => api.put('/api/v1/condition/photo-rules', body).then(r => r.data),
    invalidate: ['photo-rules'],
    success: 'Photo rules saved',
    error: 'Could not save the photo rules',
  });
}
