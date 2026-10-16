import { FAIR_VALUE_ACQUISITIONS, type AcquisitionType } from 'vairiot-shared';

// Asset form ↔ API for the IPSAS fields (stage 2.3).

export interface AccountingFormFields {
  assetClassId?: string;
  acquisitionType?: string;
  fairValueAtRecognition?: string;
  sourceEntity?: string;
  recognitionDate?: string;
}

export const ACQUISITION_LABELS: Record<AcquisitionType, string> = {
  PURCHASE: 'Purchase',
  DONATION: 'Donation',
  TRANSFER_IN: 'Transfer from another entity',
  CONSTRUCTION: 'Own construction',
  FINANCE_LEASE: 'Finance lease',
  OTHER: 'Other',
};

export const RECOGNITION_LABELS = {
  RECOGNISED: 'Recognised',
  EXPENSED: 'Expensed (below threshold)',
  PENDING_REVIEW: 'Waiting for Finance',
} as const;

export const isFairValueAcquisition = (t?: string) => FAIR_VALUE_ACQUISITIONS.includes(t as AcquisitionType);

/**
 * The accounting part of an asset request. Always sets every key, so the form's
 * strings never reach the API: nothing at all with the IPSAS ledger off; an
 * empty class becomes null, which falls back to the category's class.
 */
export function accountingPayload(data: AccountingFormFields, ipsas: boolean) {
  if (!ipsas) {
    return { assetClassId: undefined, acquisitionType: undefined, fairValueAtRecognition: undefined, sourceEntity: undefined, recognitionDate: undefined };
  }
  const fairValue = isFairValueAcquisition(data.acquisitionType);
  return {
    assetClassId: data.assetClassId || null,
    acquisitionType: (data.acquisitionType || 'PURCHASE') as AcquisitionType,
    fairValueAtRecognition: fairValue && data.fairValueAtRecognition ? Number(data.fairValueAtRecognition) : null,
    sourceEntity: fairValue ? data.sourceEntity?.trim() || null : null,
    recognitionDate: data.recognitionDate || null,
  };
}

/** Form defaults from an asset. */
export function accountingDefaults(asset: {
  assetClassId?: string | null; acquisitionType?: string | null; fairValueAtRecognition?: string | null;
  sourceEntity?: string | null; recognitionDate?: string | null;
}): AccountingFormFields {
  return {
    assetClassId: asset.assetClassId ?? '',
    acquisitionType: asset.acquisitionType ?? 'PURCHASE',
    fairValueAtRecognition: asset.fairValueAtRecognition ?? '',
    sourceEntity: asset.sourceEntity ?? '',
    recognitionDate: asset.recognitionDate ? asset.recognitionDate.slice(0, 10) : '',
  };
}
