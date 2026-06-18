import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { AlertSubscription } from '@/types';

export function useAlertSubscriptions() {
  return useQuery<AlertSubscription[]>({
    queryKey: ['alerts', 'subscriptions'],
    queryFn: () => api.get('/api/v1/alerts/subscriptions').then(r => r.data),
  });
}

export function useSubscribeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { exceptionType: string; frequency?: string }) =>
      api.post('/api/v1/alerts/subscriptions', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); toast.success('Subscribed'); },
    onError: () => { toast.error('Failed to subscribe'); },
  });
}

export function useToggleAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, active }: { type: string; active: boolean }) =>
      api.patch(`/api/v1/alerts/subscriptions/${type}/toggle`, { active }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); },
    onError: () => { toast.error('Failed to update'); },
  });
}

export function useUnsubscribeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: string) =>
      api.delete(`/api/v1/alerts/subscriptions/${type}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); toast.success('Unsubscribed'); },
    onError: () => { toast.error('Failed to unsubscribe'); },
  });
}
