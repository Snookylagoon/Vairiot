import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CONDITION_SCALE } from 'vairiot-shared';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConditionScale } from '@/hooks/useCondition';
import { api } from '@/lib/api';

interface LedgerEvent {
  id: string;
  eventType: string;
  occurredAt: string;
  payload: { fromGrade?: number | null; toGrade?: number };
}

/** Condition assessments from the asset's ledger (stage 1.14), newest first. */
export function ConditionHistory({ assetId, categoryId }: { assetId: string; categoryId?: string | null }) {
  const { data: scale } = useConditionScale(categoryId ?? null);
  const { data: events = [] } = useQuery<LedgerEvent[]>({
    queryKey: ['asset-gs1', assetId, 'condition-events'],
    queryFn: () => api.get(`/api/v1/assets/${assetId}/gs1`).then(r =>
      (r.data.events as LedgerEvent[]).filter(e => e.eventType === 'CONDITION_ASSESSED')),
  });
  if (events.length === 0) return null;
  const entries = scale?.entries ?? DEFAULT_CONDITION_SCALE;
  const label = (g?: number | null) => (g ? `${g} · ${entries.find(e => e.grade === g)?.label ?? ''}` : 'Not graded');
  const colour = (g?: number) => entries.find(e => e.grade === g)?.colour ?? '#9ca3af';
  return (
    <Card>
      <CardHeader className="font-semibold text-v-charcoal text-sm">Condition history</CardHeader>
      <CardBody className="space-y-2">
        {events.map(e => (
          <div key={e.id} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colour(e.payload.toGrade) }} />
              <span className="text-gray-400">{label(e.payload.fromGrade)} →</span>
              <span className="font-medium text-v-charcoal">{label(e.payload.toGrade)}</span>
            </span>
            <span className="text-xs text-gray-400">
              {new Date(e.occurredAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
