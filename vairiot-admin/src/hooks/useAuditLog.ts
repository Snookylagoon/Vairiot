import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

interface AuditLogParams {
  entityType?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export function useAuditLog(params: AuditLogParams = {}) {
  return useQuery({
    queryKey: ['admin', 'audit-log', params],
    queryFn: () => api.get('/api/v1/audit-events', { params }).then(r => r.data),
  });
}

export function exportAuditCsv(params: { entityType?: string; from?: string; to?: string }) {
  return api.get('/api/v1/audit-events/export.csv', {
    params,
    responseType: 'blob',
  }).then(r => {
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
