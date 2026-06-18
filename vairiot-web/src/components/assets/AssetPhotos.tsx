import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2, ImagePlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface PhotoMeta {
  id:        string;
  mimeType:  string;
  sizeBytes: number;
  createdAt: string;
}

export function AssetPhotos({ assetId }: { assetId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: photos = [], isLoading } = useQuery<PhotoMeta[]>({
    queryKey: ['photos', assetId],
    queryFn:  () => api.get(`/api/v1/assets/${assetId}/photos`).then(r => r.data),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('photo', file);
      return api.post(`/api/v1/assets/${assetId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos', assetId] }),
    onError:   (e: Error) => setError(e.message ?? 'Upload failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/photos/${id}`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['photos', assetId] }),
  });

  function pick() { inputRef.current?.click(); }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = '';
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-v-violet" />
          <span className="font-semibold text-v-charcoal text-sm">Photos ({photos.length})</span>
        </div>
        <Button size="sm" variant="secondary" onClick={pick} loading={upload.isPending}>
          <ImagePlus size={14} className="mr-1.5" /> Add
        </Button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden" onChange={onChange} />
      </CardHeader>
      <CardBody>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        {isLoading && <p className="text-sm text-gray-400">Loading photos…</p>}
        {!isLoading && photos.length === 0 && (
          <p className="text-sm text-gray-400">No photos yet. Click <span className="font-semibold">Add</span> to upload one.</p>
        )}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map(p => (
            <div key={p.id} className="relative group aspect-square overflow-hidden rounded-md border border-gray-100 bg-gray-50">
              <PhotoThumb id={p.id} />
              <button
                onClick={() => remove.mutate(p.id)}
                className="absolute top-1 right-1 p-1 rounded bg-white/80 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete photo"
              ><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/* Authorised <img> using a blob URL so the Bearer token is sent. */
function PhotoThumb({ id }: { id: string }) {
  const { data: src } = useQuery<string>({
    queryKey: ['photo-blob', id],
    queryFn: async () => {
      const r = await api.get(`/api/v1/photos/${id}/download`, { responseType: 'blob' });
      return URL.createObjectURL(r.data);
    },
    staleTime: 60 * 1000,
  });
  if (!src) return <div className="w-full h-full animate-pulse bg-gray-100" />;
  return <img src={src} alt="" className="w-full h-full object-cover" />;
}
