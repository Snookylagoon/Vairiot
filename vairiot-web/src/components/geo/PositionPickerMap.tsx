import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { GeoPosition } from 'vairiot-shared';

import { useBaseMap } from '@/hooks/useBaseMap';

// "Set position" on the map (Phase 1 W4, stage 1.11): click the map or drag
// the pin. A div icon avoids Leaflet's default marker images, which Vite
// does not bundle.
const PIN = L.divIcon({
  className: '',
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#ff0dcc;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function ClickToPlace({ onPick }: { onPick: (p: GeoPosition) => void }) {
  useMapEvents({ click: (e) => onPick({ latitude: e.latlng.lat, longitude: e.latlng.lng }) });
  return null;
}

function FollowPosition({ position }: { position: GeoPosition | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo([position.latitude, position.longitude]);
  }, [map, position]);
  return null;
}

export function PositionPickerMap({ position, onPick, height = 280 }: {
  position: GeoPosition | null;
  onPick: (p: GeoPosition) => void;
  height?: number;
}) {
  const base = useBaseMap();
  const centre: L.LatLngTuple = position ? [position.latitude, position.longitude] : [base.centreLatitude, base.centreLongitude];
  return (
    <div className="isolate" style={{ height }} data-testid="position-picker">
      <MapContainer center={centre} zoom={position ? 17 : base.zoom} className="h-full w-full rounded-lg border border-gray-200">
        <TileLayer url={base.tileUrl} attribution={base.attribution} maxZoom={19} />
        <ClickToPlace onPick={onPick} />
        <FollowPosition position={position} />
        {position && (
          <Marker
            position={[position.latitude, position.longitude]}
            icon={PIN}
            draggable
            eventHandlers={{ dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onPick({ latitude: ll.lat, longitude: ll.lng });
            } }}
          />
        )}
      </MapContainer>
    </div>
  );
}
