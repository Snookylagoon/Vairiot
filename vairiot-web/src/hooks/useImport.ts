import { useQuery } from '@tanstack/react-query';
import type { ImportMappingInput } from 'vairiot-shared';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';

// The staged register import (Phase 2, S2.5, stage 2.14). Each step answers at
// once and the worker does the work; the batch is polled while it works.

export type BatchStatus = 'UPLOADED' | 'PARSING' | 'PARSED' | 'VALIDATING' | 'VALIDATED' | 'COMMITTING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';
export type RowStatus = 'PENDING' | 'VALID' | 'WARNING' | 'ERROR' | 'COMMITTED';

export interface ImportBatch {
  id: string;
  fileName: string;
  mode: 'CREATE' | 'UPDATE';
  status: BatchStatus;
  columns: string[];
  mapping?: ImportMappingInput | null;
  rowCount: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  committedCount: number;
  jobError: string | null;
  createdAt: string;
}

export interface ImportRow {
  id: string;
  rowNumber: number;
  raw: Record<string, string | number | null>;
  status: RowStatus;
  messages: Array<{ level: 'error' | 'warning'; field?: string; message: string }>;
  assetId: string | null;
}

export const WORKING: BatchStatus[] = ['UPLOADED', 'PARSING', 'VALIDATING', 'COMMITTING'];
const err = (fallback: string) => (e: { response?: { data?: { error?: string } } }) => e.response?.data?.error ?? fallback;

export function useImportBatches() {
  return useQuery<ImportBatch[]>({ queryKey: ['imports'], queryFn: () => api.get('/api/v1/imports').then(r => r.data) });
}

/** A batch, polled every 3 s while the worker is on it (the API allows 100 requests a minute per address). */
export function useImportBatch(id: string | null) {
  return useQuery<ImportBatch>({
    queryKey: ['imports', id],
    queryFn: () => api.get(`/api/v1/imports/${id}`).then(r => r.data),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && WORKING.includes(q.state.data.status) ? 3000 : false),
  });
}

export function useImportRows(id: string | null, status: RowStatus | '', page: number, enabled = true) {
  return useQuery<{ rows: ImportRow[]; total: number; page: number; pageSize: number }>({
    queryKey: ['imports', id, 'rows', status, page],
    queryFn: () => api.get(`/api/v1/imports/${id}/rows`, { params: { ...(status && { status }), page, pageSize: 50 } }).then(r => r.data),
    enabled: !!id && enabled,
  });
}

export function useSavedMappings() {
  return useQuery<Array<{ id: string; name: string; mapping: ImportMappingInput }>>({ queryKey: ['imports', 'mappings'], queryFn: () => api.get('/api/v1/imports/mappings').then(r => r.data) });
}

export function useUploadImport() {
  return useMutationWithToast<ImportBatch, { file: File; mode: 'CREATE' | 'UPDATE' }>({
    mutationFn: ({ file, mode }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('mode', mode);
      return api.post('/api/v1/imports', form).then(r => r.data);
    },
    invalidate: ['imports'], success: 'Uploaded: reading the file', error: err('Could not upload the file'),
  });
}

export function useSetMapping(id: string) {
  return useMutationWithToast<ImportBatch, { mapping?: ImportMappingInput; profile?: unknown }>({
    mutationFn: (body) => api.put(`/api/v1/imports/${id}/mapping`, body).then(r => r.data),
    invalidate: ['imports'], success: 'Checking the rows', error: err('Could not use the mapping'),
  });
}

export function useSaveMapping() {
  return useMutationWithToast<unknown, { name: string; mapping: ImportMappingInput }>({
    mutationFn: (body) => api.put('/api/v1/imports/mappings', body).then(r => r.data),
    invalidate: ['imports', 'mappings'], success: 'Mapping saved', error: err('Could not save the mapping'),
  });
}

export function useEditRow(id: string) {
  return useMutationWithToast<ImportRow, { rowId: string; cells: Record<string, string> }>({
    mutationFn: ({ rowId, cells }) => api.patch(`/api/v1/imports/${id}/rows/${rowId}`, { cells }).then(r => r.data),
    invalidate: ['imports', id], success: 'Row corrected: check the rows again before importing', error: err('Could not correct the row'),
  });
}

/** validate, commit or cancel. */
export function useBatchAction(id: string) {
  return useMutationWithToast<ImportBatch, 'validate' | 'commit' | 'cancel'>({
    mutationFn: (action) => api.post(`/api/v1/imports/${id}/${action}`).then(r => r.data),
    invalidate: ['imports'], success: 'Done', error: err('Could not complete the action'),
  });
}

/** Downloads one of the batch's workbooks with the user's session. */
export async function downloadWorkbook(id: string, kind: 'errors' | 'reconciliation') {
  const r = await api.get(`/api/v1/imports/${id}/${kind}.xlsx`, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-${kind === 'errors' ? 'rows-to-fix' : 'reconciliation'}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
