import { useQuery } from '@tanstack/react-query';
import { Camera, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCoordinates, openStreetMapUrl } from 'vairiot-shared';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { api } from '@/lib/api';

/** A photo bound to an audit scan (stage 1.9), as GET /audits/:id/photos returns it. */
export interface ScanPhoto {
  id: string;
  hasThumb: boolean;
  tagValue: string | null;
  photoType: string;
  result: string | null;
  latitude: number | null;
  longitude: number | null;
  geoAccuracyMeters: number | null;
  capturedAt: string | null;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Time not recorded';

/** Where and when the photo was taken: the evidence the burned-in stamp would carry. */
export function stampText(p: ScanPhoto): string {
  const position = p.latitude != null && p.longitude != null
    ? `${formatCoordinates({ latitude: p.latitude, longitude: p.longitude })}${p.geoAccuracyMeters != null ? ` ±${Math.round(p.geoAccuracyMeters)} m` : ''}`
    : 'No position';
  return `${p.tagValue ?? 'Unknown tag'} · ${when(p.capturedAt)} · ${position}`;
}

function useBlob(id: string, thumb: boolean) {
  return useQuery<string>({
    queryKey: [thumb ? 'photo-blob' : 'photo-full', id, thumb],
    queryFn: async () => {
      const r = await api.get(`/api/v1/photos/${id}/download${thumb ? '?thumb=1' : ''}`, { responseType: 'blob' });
      return URL.createObjectURL(r.data);
    },
    staleTime: 60 * 1000,
  }).data;
}

function Thumb({ photo, onOpen }: { photo: ScanPhoto; onOpen: () => void }) {
  const src = useBlob(photo.id, photo.hasThumb);
  return (
    <button onClick={onOpen} title={stampText(photo)}
      className="aspect-square rounded-lg overflow-hidden border border-gray-100 bg-gray-50 hover:ring-2 hover:ring-v-violet">
      {src ? <img src={src} alt={stampText(photo)} className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
    </button>
  );
}

function Lightbox({ photo, onClose }: { photo: ScanPhoto; onClose: () => void }) {
  const src = useBlob(photo.id, false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const placed = photo.latitude != null && photo.longitude != null;
  return (
    <div role="dialog" aria-label="Scan photo" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80" onClick={onClose}>
      <button onClick={onClose} title="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white">
        <X size={24} />
      </button>
      <div className="max-w-[90vw] max-h-[80vh]" onClick={e => e.stopPropagation()}>
        {src ? <img src={src} alt="" className="max-w-full max-h-[80vh] object-contain rounded-lg" /> : <div className="w-64 h-64 animate-pulse bg-white/10 rounded-lg" />}
      </div>
      <p className="text-sm text-white font-mono" onClick={e => e.stopPropagation()}>
        {stampText(photo)}
        {placed && (
          <a className="ml-2 underline" target="_blank" rel="noreferrer"
            href={openStreetMapUrl({ latitude: photo.latitude!, longitude: photo.longitude! })}>map</a>
        )}
      </p>
    </div>
  );
}

/** Scan photos of a campaign, optionally one zone; renders nothing until there are some. */
export function ScanPhotoGallery({ campaignId, locationId }: { campaignId: string; locationId?: string }) {
  const [open, setOpen] = useState<ScanPhoto | null>(null);
  const { data: photos = [] } = useQuery<ScanPhoto[]>({
    queryKey: ['audit-photos', campaignId, locationId ?? ''],
    queryFn: () => api.get(`/api/v1/audits/${campaignId}/photos`, { params: locationId ? { locationId } : {} }).then(r => r.data),
    enabled: !!campaignId,
    staleTime: 30 * 1000,
  });
  if (photos.length === 0) return null;
  return (
    <Card>
      <CardHeader className="font-semibold text-v-charcoal text-sm flex items-center gap-2">
        <Camera size={15} /> Scan photos ({photos.length})
      </CardHeader>
      <CardBody className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {photos.map(p => <Thumb key={p.id} photo={p} onOpen={() => setOpen(p)} />)}
      </CardBody>
      {open && <Lightbox photo={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}
