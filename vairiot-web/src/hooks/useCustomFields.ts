import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import type { CustomFieldDefinition } from '@/types';

export function useCustomFields() {
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-fields'],
    queryFn: () => api.get('/api/v1/custom-fields').then(r => r.data),
  });
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; label: string; fieldType: string; required?: boolean; options?: string[] }) =>
      api.post('/api/v1/custom-fields', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); toast.success('Custom field created'); },
    onError: () => { toast.error('Failed to create custom field'); },
  });
}

export function useUpdateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; label?: string; fieldType?: string; required?: boolean; options?: string[]; sortOrder?: number }) =>
      api.patch(`/api/v1/custom-fields/${id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); toast.success('Custom field updated'); },
    onError: () => { toast.error('Failed to update custom field'); },
  });
}

export function useDeleteCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/custom-fields/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); toast.success('Custom field removed'); },
    onError: () => { toast.error('Failed to remove custom field'); },
  });
}
