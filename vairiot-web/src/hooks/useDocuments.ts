import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Document } from '@/types';

export function useDocuments(assetId: string) {
  return useQuery<Document[]>({
    queryKey: ['documents', assetId],
    queryFn: () => api.get(`/api/v1/assets/${assetId}/documents`).then(r => r.data),
    enabled: Boolean(assetId),
  });
}

export function useUploadDocument(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.post(`/api/v1/assets/${assetId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', assetId] }); toast.success('Document uploaded'); },
    onError: () => { toast.error('Failed to upload document'); },
  });
}

export function useDeleteDocument(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => api.delete(`/api/v1/documents/${docId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', assetId] }); toast.success('Document deleted'); },
    onError: () => { toast.error('Failed to delete document'); },
  });
}
