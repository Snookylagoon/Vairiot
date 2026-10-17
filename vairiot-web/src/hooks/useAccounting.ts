import { useQuery } from '@tanstack/react-query';
import type { AssetClassInput, AssetClassUpdateInput, IpsasClass, RecognitionOverrideInput } from 'vairiot-shared';

import { useMutationWithToast } from '@/hooks/useMutationWithToast';
import { api } from '@/lib/api';
import { hasFeature, useAuthStore } from '@/stores/auth.store';

// IPSAS ledger: asset classes and recognition (Phase 2, stage 2.3).

/** Decimals arrive as strings (Prisma). */
export interface AssetClass {
  id: string;
  code: string;
  name: string;
  ipsasClass: IpsasClass;
  capitalisationThreshold: string;
  defaultUsefulLifeMonths: number | null;
  defaultDepreciationMethod: string;
  defaultResidualPct: string;
  componentisationRequired: boolean;
  glAssetAccount: string | null;
  glDepreciationAccount: string | null;
  glAccumulatedDepreciationAccount: string | null;
  glImpairmentAccount: string | null;
  toBeConfirmed: boolean;
  active: boolean;
  assetCount: number;
  categoryCount: number;
}

export interface PendingReviewAsset {
  id: string;
  assetNumber: string;
  name: string;
  reason: 'no_class' | 'no_cost';
  category: { id: string; name: string } | null;
}

/** The tenant's classes; idle with the IPSAS ledger off. */
export function useAssetClasses() {
  const ipsas = useAuthStore(s => hasFeature(s.user, 'ipsas'));
  return useQuery<AssetClass[]>({
    queryKey: ['accounting', 'classes'],
    queryFn: () => api.get('/api/v1/accounting/classes').then(r => r.data),
    enabled: ipsas,
  });
}

export function useCreateAssetClass() {
  return useMutationWithToast<AssetClass, AssetClassInput>({
    mutationFn: (body) => api.post('/api/v1/accounting/classes', body).then(r => r.data),
    invalidate: ['accounting'],
    success: 'Asset class created',
    error: 'Could not create the asset class',
  });
}

export function useUpdateAssetClass(id: string) {
  return useMutationWithToast<AssetClass, AssetClassUpdateInput>({
    mutationFn: (body) => api.patch(`/api/v1/accounting/classes/${id}`, body).then(r => r.data),
    invalidate: ['accounting'],
    success: 'Asset class saved',
    error: 'Could not save the asset class',
  });
}

export function useSetCategoryClass() {
  return useMutationWithToast<unknown, { categoryId: string; assetClassId: string | null }>({
    mutationFn: ({ categoryId, assetClassId }) =>
      api.put(`/api/v1/accounting/categories/${categoryId}/class`, { assetClassId }).then(r => r.data),
    invalidate: ['accounting'],
    success: 'Category class saved',
    error: 'Could not set the category’s class',
  });
}

export function usePendingReview() {
  return useQuery<PendingReviewAsset[]>({
    queryKey: ['accounting', 'pending-review'],
    queryFn: () => api.get('/api/v1/accounting/assets/pending-review').then(r => r.data),
  });
}

export function useOverrideRecognition(assetId: string) {
  return useMutationWithToast<unknown, RecognitionOverrideInput>({
    mutationFn: (body) => api.put(`/api/v1/accounting/assets/${assetId}/recognition`, body).then(r => r.data),
    invalidate: ['asset', assetId],
    success: 'Recognition updated',
    error: 'Could not change the recognition',
  });
}

// ── Components (stage 2.6) ────────────────────────────────────────────────────

interface GroupMember {
  id: string; assetNumber: string; name: string; status: string; componentRole: string | null;
  capitalisedCost: string | null; recognitionStatus: string | null;
  depreciation: { capitalizedCost: number; accumulatedDepreciation: number; netBookValue: number };
}

export interface ComponentGroup {
  asset: GroupMember;
  parent: { id: string; assetNumber: string; name: string } | null;
  components: GroupMember[];
  rollUp: { capitalizedCost: number; accumulatedDepreciation: number; netBookValue: number } | null;
}

export interface ComponentTemplate {
  id: string; code: string; name: string; active: boolean; toBeConfirmed: boolean;
  lines: Array<{ role: string; name: string; costSharePct: number; lifeMonths?: number | null }>;
  assetClass: { code: string; name: string } | null;
}

export function useComponentGroup(assetId: string) {
  return useQuery<ComponentGroup>({
    queryKey: ['accounting', 'components', assetId],
    queryFn: () => api.get(`/api/v1/accounting/assets/${assetId}/components`).then(r => r.data),
  });
}

export function useComponentTemplates() {
  return useQuery<ComponentTemplate[]>({
    queryKey: ['accounting', 'component-templates'],
    queryFn: () => api.get('/api/v1/accounting/component-templates').then(r => r.data),
  });
}

/** Creates from a template: a new asset with its parts, or the parts onto `parentAssetId`. */
export function useCreateFromTemplate() {
  return useMutationWithToast<ComponentGroup, { templateId: string; name: string; totalCost?: number | null; parentAssetId?: string; siteId?: string }>({
    mutationFn: ({ templateId, ...body }) => api.post(`/api/v1/accounting/component-templates/${templateId}/assets`, body).then(r => r.data),
    invalidate: ['accounting'],
    success: 'Components created',
    error: 'Could not create from the template',
  });
}

/** Attach, move or (parentAssetId null) detach a component. */
export function useSetParent(assetId: string) {
  return useMutationWithToast<unknown, { parentAssetId: string | null; componentRole?: string | null }>({
    mutationFn: (body) => api.put(`/api/v1/accounting/assets/${assetId}/parent`, body).then(r => r.data),
    invalidate: ['accounting'],
    success: 'Component updated',
    error: (err) => err.response?.data?.error ?? 'Could not change the component',
  });
}

// ── Periods and depreciation runs (stage 2.9) ─────────────────────────────────

export interface DepreciationRunSummary {
  id: string; status: 'DRAFT' | 'POSTED' | 'REVERSED' | 'DISCARDED'; assetCount: number; totalCharge: string;
  preparedBy: string; postedBy: string | null; postedAt: string | null; reversalOfRunId: string | null; createdAt: string;
  preview?: { byClass: Array<{ classCode: string; count: number; charge: string }>; skipped: Record<string, number> } | null;
}

export interface AccountingPeriod {
  id: string; year: number; month: number; status: 'OPEN' | 'CLOSED' | 'LOCKED';
  runs: DepreciationRunSummary[];
}

export interface DepreciationHistory {
  entries: Array<{ id: string; year: number; month: number; method: string; runStatus: string; openingNbv: string; charge: string; closingNbv: string; accumulated: string }>;
  accumulated: string;
  carryingAmount: string | null;
}

export interface DepreciationByClass {
  period: { year: number; month: number } | null;
  rows: Array<{ classCode: string; className: string; assetCount: number; periodCharge: string; accumulated: string; cost: string; carryingAmount: string }>;
  totals: { assetCount: number; periodCharge: string; accumulated: string; cost: string; carryingAmount: string };
}

const apiError = (fallback: string) => (err: { response?: { data?: { error?: string } } }) => err.response?.data?.error ?? fallback;

export function usePeriods() {
  return useQuery<AccountingPeriod[]>({
    queryKey: ['accounting', 'periods'],
    queryFn: () => api.get('/api/v1/accounting/periods').then(r => r.data),
  });
}

export function useOpenPeriod() {
  return useMutationWithToast<AccountingPeriod, { year: number; month: number }>({
    mutationFn: (body) => api.post('/api/v1/accounting/periods', body).then(r => r.data),
    invalidate: ['accounting'], success: 'Period opened', error: apiError('Could not open the period'),
  });
}

/** Prepare a draft run, post or discard one, reverse a posted one, reopen or lock a period. */
export function usePeriodAction() {
  return useMutationWithToast<unknown, { path: string; body?: Record<string, unknown>; done: string }>({
    mutationFn: ({ path, body }) => api.post(`/api/v1/accounting${path}`, body ?? {}).then(r => r.data),
    invalidate: ['accounting'], success: 'Done', error: apiError('Could not complete the action'),
  });
}

export function useAssetDepreciation(assetId: string) {
  return useQuery<DepreciationHistory>({
    queryKey: ['accounting', 'asset-depreciation', assetId],
    queryFn: () => api.get(`/api/v1/accounting/assets/${assetId}/depreciation`).then(r => r.data),
  });
}

export function useSetUsage(assetId: string) {
  return useMutationWithToast<unknown, { periodId: string; units: number }>({
    mutationFn: ({ periodId, units }) => api.put(`/api/v1/accounting/periods/${periodId}/usage/${assetId}`, { units }).then(r => r.data),
    invalidate: ['accounting'], success: 'Usage saved', error: apiError('Could not save the usage'),
  });
}

export function useDepreciationByClass() {
  return useQuery<DepreciationByClass>({
    queryKey: ['accounting', 'depreciation-by-class'],
    queryFn: () => api.get('/api/v1/accounting/depreciation-by-class').then(r => r.data),
  });
}
