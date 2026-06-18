import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  DepreciationRow, FixedAssetRow, DisposalReport,
  AgingReport, MaintenanceCostReport,
} from '@/types';

export function useDepreciationRegister(filters?: Record<string, string>) {
  return useQuery<DepreciationRow[]>({
    queryKey: ['reports', 'depreciation', filters],
    queryFn: () => api.get('/api/v1/reports/depreciation', { params: filters }).then(r => r.data),
  });
}

export function useFixedAssetRegister(filters?: Record<string, string>) {
  return useQuery<FixedAssetRow[]>({
    queryKey: ['reports', 'fixed-assets', filters],
    queryFn: () => api.get('/api/v1/reports/fixed-assets', { params: filters }).then(r => r.data),
  });
}

export function useDisposalReport(filters?: Record<string, string>) {
  return useQuery<DisposalReport>({
    queryKey: ['reports', 'disposals', filters],
    queryFn: () => api.get('/api/v1/reports/disposals', { params: filters }).then(r => r.data),
  });
}

export function useAgingReport(filters?: Record<string, string>) {
  return useQuery<AgingReport>({
    queryKey: ['reports', 'aging', filters],
    queryFn: () => api.get('/api/v1/reports/aging', { params: filters }).then(r => r.data),
  });
}

export function useMaintenanceCostReport(filters?: Record<string, string>) {
  return useQuery<MaintenanceCostReport>({
    queryKey: ['reports', 'maintenance-costs', filters],
    queryFn: () => api.get('/api/v1/reports/maintenance-costs', { params: filters }).then(r => r.data),
  });
}
