import { Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { useAssetGs1 } from '@/hooks/useIdentification';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wider shrink-0">
        {label}
      </span>
      <span className="text-xs font-mono text-v-charcoal truncate" title={value}>{value}</span>
      <button
        type="button"
        className="text-gray-300 hover:text-v-pink shrink-0"
        title={`Copy ${label}`}
        onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

/**
 * GS1 identity block on the asset detail page: HRI, GIAI, Digital Link and
 * the current RFID tag binding. Renders nothing for assets that predate
 * identifier allocation and have no reference yet.
 */
export function AssetGs1Identity({ assetId }: { assetId: string }) {
  const { data, isLoading } = useAssetGs1(assetId);
  if (isLoading || !data?.encoding) return null;
  const e = data.encoding;
  const activeBinding = data.bindings.find((b) => !b.unboundAt && b.tag);

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-v-charcoal flex items-center gap-1">
          <Link2 size={12} className="text-v-violet" /> GS1 identity
        </span>
        <Badge variant={e.mode === 'GS1' ? 'green' : 'default'} label={e.mode === 'GS1' ? 'GS1' : 'Internal'} />
      </div>
      <Row label="Reference" value={e.hri} />
      {e.giai && <Row label="GIAI" value={e.giai} />}
      <Row label="Digital Link" value={e.digitalLink} />
      {activeBinding?.tag && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            RFID {activeBinding.tag.epcScheme ?? '—'}
            {activeBinding.tag.verifiedAt ? ' · verified' : ' · unverified'}
          </span>
          <span className="text-xs font-mono text-gray-500 truncate" title={activeBinding.tag.tidHex}>
            TID {activeBinding.tag.tidHex}
          </span>
        </div>
      )}
    </div>
  );
}
