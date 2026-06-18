import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Category } from '@/types';

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn:  () => api.get('/api/v1/categories').then(r => r.data),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.post('/api/v1/categories', data).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category created'); },
    onError:    () => { toast.error('Failed to create category'); },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/categories/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('Category deleted'); },
    onError:    () => { toast.error('Cannot delete — category has assets assigned'); },
  });
}
