export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ConfidenceThresholds {
  highReadCount: number;
  highRssiDbm: number;
  mediumReadCount: number;
  mediumRssiDbm: number;
  minDwellMs: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  highReadCount: 8,
  highRssiDbm: -55,
  mediumReadCount: 3,
  mediumRssiDbm: -65,
  minDwellMs: 1500,
};

/** Spec §10.2 — observation confidence scoring. */
export function scoreConfidence(
  o: {
    readCount: number;
    rssiDbm: number | null;
    dwellMs: number | null;
    confirmingCloseRange: boolean;
    seenInOtherLocation: boolean;
  },
  t: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceBand {
  if (o.confirmingCloseRange) return 'HIGH';
  if (o.seenInOtherLocation) return 'LOW';
  const strong = (o.rssiDbm ?? -99) >= t.highRssiDbm;
  const many = o.readCount >= t.highReadCount;
  const dwelt = (o.dwellMs ?? 0) >= t.minDwellMs;
  if (strong && many && dwelt) return 'HIGH';
  if ((o.rssiDbm ?? -99) >= t.mediumRssiDbm && o.readCount >= t.mediumReadCount) return 'MEDIUM';
  return 'LOW';
}

export type ReaderProfileName = 'SWEEP' | 'PROBE' | 'WRITE';

/** Starting values only — tuned per site during the pilot (spec §7.4). */
export const DEFAULT_READER_PROFILES: Record<
  ReaderProfileName,
  {
    txPowerDbm: number;
    readRssiFilterDbm: number | null;
    writeRssiFilterDbm: number | null;
    readTid: boolean;
  }
> = {
  SWEEP: { txPowerDbm: 20, readRssiFilterDbm: -70, writeRssiFilterDbm: null, readTid: false },
  PROBE: { txPowerDbm: 10, readRssiFilterDbm: -45, writeRssiFilterDbm: null, readTid: true },
  WRITE: { txPowerDbm: 27, readRssiFilterDbm: null, writeRssiFilterDbm: -40, readTid: true },
};
