import { recordPositionEvent } from './asset-geo.service';
import { recordConditionEvent } from './condition.service';

type AssetState = {
  latitude: number | null; longitude: number | null; geoAccuracyMeters?: number | null; geoSource?: string | null;
  condition?: string | null; conditionGrade?: number | null;
};

/**
 * Ledger events for what changed on an asset write: POSITION_CAPTURED /
 * POSITION_CORRECTED (stage 1.5) and CONDITION_ASSESSED (stage 1.13).
 */
export async function recordAssetChanges(
  tenantId: string, assetId: string, actorId: string, before: AssetState | null, after: AssetState,
): Promise<void> {
  await recordPositionEvent(tenantId, assetId, actorId, before, after);
  await recordConditionEvent(tenantId, assetId, actorId, before, after);
}
