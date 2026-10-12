import { Copy, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { formatCoordinates, googleMapsUrl, openStreetMapUrl } from 'vairiot-shared';

import { MapPreview } from '@/components/geo/MapPreview';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { assetPosition } from '@/lib/geo';
import type { Asset } from '@/types';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Entered manually',
  device: 'Captured from device',
  import: 'Imported',
};

/** Detail-page card for an asset's GIS position. */
export function AssetGeoPosition({ asset }: { asset: Asset }) {
  const position = assetPosition(asset);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex items-center gap-2">
        <Globe size={16} className="text-v-violet" />
        <span className="font-semibold text-v-charcoal text-sm">GIS Position</span>
      </CardHeader>
      <CardBody className="space-y-4">
        {!position ? (
          <p className="text-sm text-gray-400">No map position recorded. Edit the asset to add one.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Coordinates</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(formatCoordinates(position)); toast.success('Coordinates copied'); }}
                  className="mt-0.5 flex items-center gap-1.5 font-mono text-sm text-v-charcoal hover:text-v-violet transition-colors"
                  title="Copy coordinates"
                >
                  {formatCoordinates(position)} <Copy size={13} />
                </button>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Accuracy</p>
                <p className="mt-0.5 text-sm text-v-charcoal">{asset.geoAccuracyMeters != null ? `±${asset.geoAccuracyMeters} m` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Source</p>
                <p className="mt-0.5 text-sm text-v-charcoal">
                  {asset.geoSource ? SOURCE_LABELS[asset.geoSource] ?? asset.geoSource : '—'}
                  {asset.geoCapturedAt && (
                    <span className="block text-xs text-gray-400">{new Date(asset.geoCapturedAt).toLocaleString('en-GB')}</span>
                  )}
                </p>
              </div>
            </div>
            <MapPreview position={position} height={260} />
            <div className="flex gap-4 text-xs">
              <a href={openStreetMapUrl(position)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-v-violet hover:text-v-pink transition-colors">
                <ExternalLink size={13} /> Open in OpenStreetMap
              </a>
              <a href={googleMapsUrl(position)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-v-violet hover:text-v-pink transition-colors">
                <ExternalLink size={13} /> Open in Google Maps
              </a>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
