import { useQuery } from '@tanstack/react-query';
import type { ApprovalActionKey } from 'vairiot-shared';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';

// Maker-checker approvals (Phase 3, S3.1, stage 3.3, D22). Decimals arrive as strings.

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FAILED';

export interface ApprovalRequest {
  id: string;
  action: ApprovalActionKey;
  status: ApprovalStatus;
  assetId: string | null;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  amount: string | null;
  summary: string;
  requestedBy: string;
  requestedByName: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
  error: string | null;
  approverRole: string | null;
  canDecide: boolean;
  createdAt: string;
}

export interface ApprovalInbox {
  requests: ApprovalRequest[];
  runs: Array<{ id: string; assetCount: number; totalCharge: string; period: { id: string; year: number; month: number }; preparedBy: string; createdAt: string }>;
  impairments: Array<{ id: string; kind: string; loss: string; asset: { id: string; assetNumber: string; name: string }; assessedBy: string; assessedAt: string | null }>;
  count: number;
}

export interface ApprovalRule {
  id?: string;
  action: ApprovalActionKey;
  minAmount: string | number;
  approverRoleId: string | null;
  requireDifferentUser: boolean;
  active: boolean;
  role?: { id: string; name: string } | null;
}

export const ACTION_LABELS: Record<ApprovalActionKey, string> = {
  CAPITALISE: 'Capitalisation', TRANSFER: 'Transfer', DISPOSE: 'Disposal', WRITE_OFF: 'Write-off', REGISTER_NEW: 'Register a found asset',
};

/** A gated action answers 202 with the request instead of making the change. */
export type MaybeAwaiting<T> = T & { approvalRequest?: ApprovalRequest };
export const awaiting = (data: unknown): ApprovalRequest | undefined =>
  (data as { approvalRequest?: ApprovalRequest } | undefined)?.approvalRequest;
export const SENT_FOR_APPROVAL = 'Sent for approval: nothing changes until it is approved';

const apiError = (fallback: string) => (err: { response?: { data?: { error?: string } } }) => err.response?.data?.error ?? fallback;

export function useApprovalInbox(enabled = true) {
  return useQuery<ApprovalInbox>({
    queryKey: ['approvals', 'inbox'],
    queryFn: () => api.get('/api/v1/approvals/inbox').then(r => r.data),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useApprovals(filters: { status?: ApprovalStatus; assetId?: string } = {}, enabled = true) {
  return useQuery<ApprovalRequest[]>({
    queryKey: ['approvals', 'list', filters],
    queryFn: () => api.get('/api/v1/approvals', { params: filters }).then(r => r.data),
    enabled,
  });
}

export function useMyApprovals(status?: ApprovalStatus) {
  return useQuery<ApprovalRequest[]>({
    queryKey: ['approvals', 'mine', status ?? 'all'],
    queryFn: () => api.get('/api/v1/approvals/mine', { params: status ? { status } : {} }).then(r => r.data),
  });
}

export function useDecideApproval() {
  return useMutationWithToast<ApprovalRequest, { id: string; decision: 'approve' | 'reject'; reason?: string }>({
    mutationFn: ({ id, decision, reason }) => api.post(`/api/v1/approvals/${id}/${decision}`, reason ? { reason } : {}).then(r => r.data),
    invalidate: [], // an approval changes whatever it was about: refresh everything
    success: (r) => r.status === 'APPROVED' ? 'Approved and done' : r.status === 'FAILED' ? `Approved, but it could not be made: ${r.error ?? 'see the request'}` : 'Rejected',
    error: apiError('Could not record the decision'),
  });
}

export function useCancelApproval() {
  return useMutationWithToast<ApprovalRequest, string>({
    mutationFn: (id) => api.post(`/api/v1/approvals/${id}/cancel`).then(r => r.data),
    invalidate: ['approvals'], success: 'Request withdrawn', error: apiError('Could not withdraw the request'),
  });
}

export function useApprovalRules(enabled = true) {
  return useQuery<ApprovalRule[]>({
    queryKey: ['approvals', 'rules'],
    queryFn: () => api.get('/api/v1/approvals/rules').then(r => r.data),
    enabled,
  });
}

export function useSaveApprovalRules() {
  return useMutationWithToast<ApprovalRule[], ApprovalRule[]>({
    mutationFn: (rules) => api.put('/api/v1/approvals/rules', {
      rules: rules.map(({ action, minAmount, approverRoleId, requireDifferentUser, active }) => ({ action, minAmount: Number(minAmount), approverRoleId, requireDifferentUser, active })),
    }).then(r => r.data),
    invalidate: ['approvals', 'rules'], success: 'Approval rules saved', error: apiError('Could not save the rules'),
  });
}
