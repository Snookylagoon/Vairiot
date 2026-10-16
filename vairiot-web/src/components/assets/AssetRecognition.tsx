import { useState } from 'react';
import type { Asset } from 'vairiot-shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAssetClasses, useOverrideRecognition } from '@/hooks/useAccounting';
import { useCurrency } from '@/hooks/useCurrency';
import { ACQUISITION_LABELS, RECOGNITION_LABELS } from '@/lib/accounting';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const VARIANT = { RECOGNISED: 'green', EXPENSED: 'gray', PENDING_REVIEW: 'yellow' } as const;

/**
 * How the asset stands under IPSAS (stage 2.3): class, acquisition, capitalised
 * cost and recognition. An approver can override the threshold rule with a
 * reason, or clear the override.
 */
export function AssetRecognition({ asset }: { asset: Asset }) {
  const { data: classes = [] } = useAssetClasses();
  const { fmt } = useCurrency();
  const canApprove = useAuthStore(s => hasAnyPermission(s.user, 'accounting:approve'));
  const override = useOverrideRecognition(asset.id);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const cls = classes.find(c => c.id === asset.assetClassId);
  const status = asset.recognitionStatus ?? 'PENDING_REVIEW';
  const other = status === 'EXPENSED' ? 'RECOGNISED' : 'EXPENSED';

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="font-semibold text-v-charcoal text-sm">Accounting (IPSAS)</span>
        <Badge variant={VARIANT[status]} label={RECOGNITION_LABELS[status] + (asset.recognitionOverride ? ' · set by Finance' : '')} />
      </CardHeader>
      <CardBody className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-gray-400">Class</dt>
          <dd>{cls ? `${cls.code} · ${cls.name}` : 'None yet'}</dd>
          <dt className="text-gray-400">Acquired by</dt>
          <dd>{ACQUISITION_LABELS[(asset.acquisitionType ?? 'PURCHASE') as keyof typeof ACQUISITION_LABELS]}{asset.sourceEntity ? ` · ${asset.sourceEntity}` : ''}</dd>
          <dt className="text-gray-400">Capitalised cost</dt>
          <dd>{asset.capitalisedCost != null ? fmt(asset.capitalisedCost) : 'Not entered'}</dd>
          {cls && <><dt className="text-gray-400">Threshold</dt><dd>{fmt(cls.capitalisationThreshold)}</dd></>}
        </dl>
        {asset.recognitionOverride && asset.recognitionOverrideReason && (
          <p className="text-xs text-gray-500">Reason: {asset.recognitionOverrideReason}</p>
        )}
        {canApprove && !editing && (
          <div className="flex gap-2">
            {status !== 'PENDING_REVIEW' && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Mark as {RECOGNITION_LABELS[other].toLowerCase()}
              </Button>
            )}
            {asset.recognitionOverride && (
              <Button size="sm" variant="secondary" loading={override.isPending} onClick={() => override.mutate({ status: null })}>
                Apply the threshold again
              </Button>
            )}
          </div>
        )}
        {editing && (
          <div className="space-y-2">
            <label htmlFor="override-reason" className="block text-xs font-medium text-v-charcoal">Reason (kept with the asset and in the audit log)</label>
            <textarea id="override-reason" rows={2} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={reason} onChange={e => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" disabled={reason.trim().length < 5} loading={override.isPending}
                onClick={() => override.mutate({ status: other, reason: reason.trim() }, { onSuccess: () => { setEditing(false); setReason(''); } })}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
