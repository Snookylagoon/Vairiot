import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import type { Webhook } from '@/types';

export function useWebhooks() {
  return useQuery<Webhook[]>({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/api/v1/webhooks').then(r => r.data),
  });
}

export function useWebhookEvents() {
  return useQuery<string[]>({
    queryKey: ['webhooks', 'events'],
    queryFn: () => api.get('/api/v1/webhooks/events').then(r => r.data),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string; events: string[] }) =>
      api.post('/api/v1/webhooks', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); toast.success('Webhook created'); },
    onError: () => { toast.error('Failed to create webhook'); },
  });
}

export function useToggleWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/api/v1/webhooks/${id}/toggle`, { active }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); },
    onError: () => { toast.error('Failed to toggle webhook'); },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/webhooks/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); toast.success('Webhook deleted'); },
    onError: () => { toast.error('Failed to delete webhook'); },
  });
}
