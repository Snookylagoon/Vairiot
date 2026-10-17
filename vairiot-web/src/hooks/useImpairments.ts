import { useQuery } from '@tanstack/react-query';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';

// Impairment (Phase 2, S2.4, stage 2.12). Decimals arrive as strings.

export type ImpairmentStatus = 'DRAFT' | 'POSTED' | 'REVERSED' | 'DISMISSED';

export interface Impairment {
  id: string;
  assetId: string;
  kind: 'IMPAIRMENT' | 'REVERSAL';
  status: ImpairmentStatus;
  indicator: string;
  indicatorNotes: string | null;
  conditionGrade: number | null;
  standard: string | null;
  method: string | null;
  carryingAmount: string | null;
  recoverableAmount: string | null;
  loss: string | null;
  assessmentNotes: string | null;
  correctionOfId: string | null;
  raisedBy: string | null;
  assessedBy: string | null;
  postedBy: string | null;
  postedAt: string | null;
  createdAt: string;
  asset: { id: string; assetNumber: string; name: string };
  period: { year: number; month: number } | null;
}

export interface ImpairmentRegister {
  rows: Array<{ id: string; period: string; assetNumber: string; assetName: string; classCode: string; kind: string; status: string; indicator: string; standard: string; method: string; carryingAmount: string; recoverableAmount: string; loss: string; postedBy: string }>;
  totals: { count: number; losses: string; reversals: string; net: string };
}

export const INDICATORS: Record<string, string> = {
  CONDITION: 'Condition', DAMAGE: 'Physical damage', OBSOLESCENCE: 'Obsolescence', IDLE: 'Idle or out of use', LEGAL: 'Legal or regulatory', OTHER: 'Other',
};
export const STANDARDS: Record<string, string> = { IPSAS_21: 'IPSAS 21 (non-cash-generating)', IPSAS_26: 'IPSAS 26 (cash-generating)' };
export const METHODS: Record<string, string> = {
  DRC: 'Depreciated replacement cost', RESTORATION_COST: 'Restoration cost', SERVICE_UNITS: 'Service units', FVLCS: 'Fair value less costs to sell',
};

const apiError = (fallback: string) => (err: { response?: { data?: { error?: string } } }) => err.response?.data?.error ?? fallback;

export function useImpairments(filters: { status?: ImpairmentStatus; assetId?: string } = {}) {
  return useQuery<Impairment[]>({
    queryKey: ['accounting', 'impairments', filters],
    queryFn: () => api.get('/api/v1/accounting/impairments', { params: filters }).then(r => r.data),
  });
}

export function useImpairmentRegister() {
  return useQuery<ImpairmentRegister>({
    queryKey: ['accounting', 'impairment-register'],
    queryFn: () => api.get('/api/v1/accounting/impairment-register').then(r => r.data),
  });
}

export function useRaiseImpairment() {
  return useMutationWithToast<Impairment, { assetId: string; indicator: string; indicatorNotes?: string }>({
    mutationFn: (body) => api.post('/api/v1/accounting/impairments', body).then(r => r.data),
    invalidate: ['accounting'], success: 'Impairment raised for assessment', error: apiError('Could not raise the impairment'),
  });
}

export function useAssessImpairment(id: string) {
  return useMutationWithToast<Impairment, { standard: string; method: string; recoverableAmount: number; assessmentNotes?: string }>({
    mutationFn: (body) => api.put(`/api/v1/accounting/impairments/${id}/assessment`, body).then(r => r.data),
    invalidate: ['accounting'], success: 'Assessment saved', error: apiError('Could not save the assessment'),
  });
}

/** Dismiss, post or correct: `path` is the action, `body` its period and notes. */
export function useImpairmentAction() {
  return useMutationWithToast<unknown, { id: string; action: 'dismiss' | 'post' | 'correct'; body?: Record<string, unknown>; done: string }>({
    mutationFn: ({ id, action, body }) => api.post(`/api/v1/accounting/impairments/${id}/${action}`, body ?? {}).then(r => r.data),
    invalidate: ['accounting'], success: 'Done', error: apiError('Could not complete the action'),
  });
}
