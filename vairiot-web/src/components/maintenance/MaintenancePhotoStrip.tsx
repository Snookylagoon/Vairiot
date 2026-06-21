import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PhotoMeta {
  id: string;
  hasThumb?: boolean;
}

export function MaintenancePhotoStrip({ eventId, max = 3 }: { eventId: string; max?: number }) {
  const { data: photos = [], isLoading } = useQuery<PhotoMeta[]>({
    queryKey: ['maintenance-photos', eventId],
    queryFn:  () => api.get(`/api/v1/maintenance/${eventId}/photos`).then(r => r.data),
    staleTime: 30 * 1000,
  });

  if (isLoading) return <span className="text-xs text-gray-300">…</span>;
  if (photos.length === 0) return <span className="text-xs text-gray-300">—</span>;

  const shown = photos.slice(0, max);
  const extra = photos.length - shown.length;

  return (
    <div className="flex items-center gap-1">
      {shown.map(p => <Thumb key={p.id} id={p.id} hasThumb={p.hasThumb} />)}
      {extra > 0 && (
        <span className="text-xs text-gray-500 ml-1">+{extra}</span>
      )}
    </div>
  );
}

function Thumb({ id, hasThumb }: { id: string; hasThumb?: boolean }) {
  const { data: src } = useQuery<string>({
    queryKey: ['photo-blob', id, hasThumb],
    queryFn: async () => {
      const url = hasThumb ? `/api/v1/photos/${id}/download?thumb=1` : `/api/v1/photos/${id}/download`;
      const r = await api.get(url, { responseType: 'blob' });
      return URL.createObjectURL(r.data);
    },
    staleTime: 60 * 1000,
  });
  if (!src) return <div className="w-8 h-8 rounded bg-gray-100 animate-pulse" />;
  return <img src={src} alt="" className="w-8 h-8 rounded object-cover border border-gray-100" />;
}
