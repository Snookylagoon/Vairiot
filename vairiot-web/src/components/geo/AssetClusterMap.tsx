import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';

import { boundsOf, escapeHtml, statusColour } from '@/lib/assetMap';
import type { AssetMapPoint } from '@/types';

interface AssetClusterMapProps {
  points:     AssetMapPoint[];
  selectedId: string | null;
  onSelect:   (point: AssetMapPoint) => void;
  /**
   * Re-fit the view to the points whenever this changes (e.g. the filters).
   * Null while the points are stale, so the fit waits for the fresh set.
   */
  fitKey:     string | null;
  className?: string;
  /** Marker colour; defaults to the asset status colour. */
  colourOf?:  (point: AssetMapPoint) => string;
}

/** Fallback view before there's anything to fit: the whole world. */
const WORLD: L.LatLngTuple = [20, 0];

/** All-assets map: status-coloured markers, clustered where they crowd. */
export function AssetClusterMap({ points, selectedId, onSelect, fitKey, className, colourOf }: AssetClusterMapProps) {
  return (
    // `isolate` keeps Leaflet's high z-index panes below the app's dialogs.
    <div className={`isolate ${className ?? ''}`}>
      <MapContainer center={WORLD} zoom={2} className="h-full w-full rounded-xl" worldCopyJump>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <ClusterLayer points={points} selectedId={selectedId} onSelect={onSelect} colourOf={colourOf} />
        <FitToPoints points={points} fitKey={fitKey} />
      </MapContainer>
    </div>
  );
}

const BASE_STYLE = { radius: 7, color: '#ffffff', weight: 2 };
const SELECTED_STYLE = { radius: 10, color: '#1f2937', weight: 3 };

function ClusterLayer({ points, selectedId, onSelect, colourOf = (p) => statusColour(p.status) }: Pick<AssetClusterMapProps, 'points' | 'selectedId' | 'onSelect' | 'colourOf'>) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const markers = useRef(new Map<string, L.CircleMarker>());

  // Rebuilt only when the points change, so selecting a marker doesn't
  // collapse a spiderfied cluster.
  useEffect(() => {
    const byId = new Map<string, L.CircleMarker>();
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true });
    cluster.addLayers(points.map((p) => {
      const marker = L.circleMarker([p.latitude, p.longitude], {
        ...BASE_STYLE,
        fillColor: colourOf(p),
        fillOpacity: 0.95,
      });
      marker.bindTooltip(`<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.assetNumber)}`, { direction: 'top', offset: [0, -6] });
      marker.on('click', () => onSelectRef.current(p));
      byId.set(p.id, marker);
      return marker;
    }));
    markers.current = byId;
    map.addLayer(cluster);
    return () => { map.removeLayer(cluster); };
    // colourOf is chosen once per layer; points change with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, points]);

  useEffect(() => {
    const marker = selectedId ? markers.current.get(selectedId) : undefined;
    if (!marker) return;
    marker.setStyle(SELECTED_STYLE).setRadius(SELECTED_STYLE.radius).bringToFront();
    return () => { marker.setStyle(BASE_STYLE).setRadius(BASE_STYLE.radius); };
  }, [selectedId, points]);

  return null;
}

function FitToPoints({ points, fitKey }: Pick<AssetClusterMapProps, 'points' | 'fitKey'>) {
  const map = useMap();
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    // Fit once per filter set, after its data arrives — not on every refetch,
    // which would yank the view away from where the user has panned.
    if (fitKey === null) return;
    const key = `${fitKey}|${points.length > 0}`;
    if (fitted.current === key) return;
    const bounds = boundsOf(points);
    if (!bounds) return;
    fitted.current = key;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }, [map, points, fitKey]);

  return null;
}
