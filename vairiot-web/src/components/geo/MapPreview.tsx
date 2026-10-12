import { openStreetMapEmbedUrl, type GeoPosition } from 'vairiot-shared';

/** Key-less OpenStreetMap embed with a marker on the position. */
export function MapPreview({ position, height = 220 }: { position: GeoPosition; height?: number }) {
  return (
    <iframe
      title={`Map at ${position.latitude}, ${position.longitude}`}
      src={openStreetMapEmbedUrl(position)}
      className="w-full rounded-lg border border-gray-200"
      style={{ height }}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
