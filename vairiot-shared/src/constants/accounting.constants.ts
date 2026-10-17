// IPSAS ledger vocabulary (Phase 2, S2.1). The values match the Prisma enums
// of the same names; the Accounting Policy Manual (TOR D2) sets the figures.

/** The IPSAS 45 class of property, plant and equipment an asset class belongs to. */
export const IpsasClass = {
  Infrastructure:  'INFRASTRUCTURE',
  Operational:     'OPERATIONAL',
  OfficeEquipment: 'OFFICE_EQUIPMENT',
  Furniture:       'FURNITURE',
  Vehicles:        'VEHICLES',
  Land:            'LAND',
  Buildings:       'BUILDINGS',
  Other:           'OTHER',
} as const;
export type IpsasClass = (typeof IpsasClass)[keyof typeof IpsasClass];

/** How the entity obtained the asset (fit-gap 7). */
export const AcquisitionType = {
  Purchase:     'PURCHASE',
  Donation:     'DONATION',
  TransferIn:   'TRANSFER_IN',
  Construction: 'CONSTRUCTION',
  FinanceLease: 'FINANCE_LEASE',
  Other:        'OTHER',
} as const;
export type AcquisitionType = (typeof AcquisitionType)[keyof typeof AcquisitionType];

/** Non-exchange acquisitions, recognised at fair value (IPSAS 23 / 45). */
export const FAIR_VALUE_ACQUISITIONS: readonly AcquisitionType[] = [AcquisitionType.Donation, AcquisitionType.TransferIn];

/**
 * RECOGNISED: on the register as an asset. EXPENSED: below its class's
 * capitalisation threshold, so expensed and never depreciated. PENDING_REVIEW:
 * no class or no cost yet, for Finance to resolve (D20).
 */
export const RecognitionStatus = {
  Recognised:    'RECOGNISED',
  Expensed:      'EXPENSED',
  PendingReview: 'PENDING_REVIEW',
} as const;
export type RecognitionStatus = (typeof RecognitionStatus)[keyof typeof RecognitionStatus];

/** Why an asset is PENDING_REVIEW. */
export const PendingReviewReason = {
  NoClass: 'no_class',
  NoCost:  'no_cost',
} as const;
export type PendingReviewReason = (typeof PendingReviewReason)[keyof typeof PendingReviewReason];

/** Suggested component roles (S2.2); any short label is accepted. */
export const COMPONENT_ROLES = ['controller', 'pole', 'head', 'detector', 'cabinet', 'other'] as const;
