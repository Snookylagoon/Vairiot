import { recordAssetEvent } from './asset-event.service';
import { recordPositionEvent } from './asset-geo.service';
import { recordConditionEvent } from './condition.service';

type AssetState = {
  latitude: number | null; longitude: number | null; geoAccuracyMeters?: number | null; geoSource?: string | null;
  condition?: string | null; conditionGrade?: number | null; custodian?: string | null;
};

/**
 * Ledger events for what changed on an asset write: POSITION_CAPTURED /
 * POSITION_CORRECTED (stage 1.5), CONDITION_ASSESSED (stage 1.13) and
 * CUSTODIAN_CHANGED (stage 2.7).
 */
export async function recordAssetChanges(
  tenantId: string, assetId: string, actorId: string, before: AssetState | null, after: AssetState,
): Promise<void> {
  await recordPositionEvent(tenantId, assetId, actorId, before, after);
  await recordConditionEvent(tenantId, assetId, actorId, before, after);
  await recordCustodianEvent(tenantId, assetId, actorId, before?.custodian ?? null, after.custodian ?? null);
}

/** CUSTODIAN_CHANGED when the accountable person or unit changes, or is first named. */
export async function recordCustodianEvent(
  tenantId: string, assetId: string, actorId: string | null, from: string | null, to: string | null,
): Promise<void> {
  if (from === to) return;
  await recordAssetEvent({ tenantId, assetId, eventType: 'CUSTODIAN_CHANGED', actor: actorId, source: 'API', payload: { from, to } });
}
