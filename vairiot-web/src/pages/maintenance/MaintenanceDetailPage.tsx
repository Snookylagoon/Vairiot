import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Wrench, Trash2, ImagePlus, Save, Camera } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useMaintenanceEvent, useUpdateMaintenanceEvent, useDeleteMaintenanceEvent } from '@/hooks/useMaintenance';
import { useCurrency } from '@/hooks/useCurrency';
import { api } from '@/lib/api';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

interface FormData {
  maintenanceType: string;
  vendor:          string;
  workOrderNumber: string;
  cost:            string;
  status:          string;
  scheduledDate:   string;
  completedDate:   string;
  description:     string;
  notes:           string;
}

function toDateInput(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { symbol: currencySymbol } = useCurrency();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'asset:write');
  const canDelete = hasAnyPermission(user, 'asset:delete');

  const { data: evt, isLoading, error } = useMaintenanceEvent(id);
  const update = useUpdateMaintenanceEvent(id ?? '');
  const remove = useDeleteMaintenanceEvent();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { register, handleSubmit, reset } = useForm<FormData>();

  useEffect(() => {
    if (!evt) return;
    reset({
      maintenanceType: evt.maintenanceType ?? '',
      vendor:          evt.vendor ?? '',
      workOrderNumber: evt.workOrderNumber ?? '',
      cost:            evt.cost ?? '',
      status:          evt.status ?? 'scheduled',
      scheduledDate:   toDateInput(evt.scheduledDate),
      completedDate:   toDateInput(evt.completedDate),
      description:     evt.description ?? '',
      notes:           evt.notes ?? '',
    });
  }, [evt, reset]);

  const onSubmit = async (fd: FormData) => {
    await update.mutateAsync({
      maintenanceType: fd.maintenanceType,
      vendor:          fd.vendor || null,
      cost:            fd.cost ? Number(fd.cost) : null,
      status:          fd.status,
      scheduledDate:   fd.scheduledDate || null,
      completedDate:   fd.completedDate || null,
      description:     fd.description || null,
      notes:           fd.notes || null,
    });
  };

  if (isLoading) return <p className="p-6 text-sm text-gray-400">Loading…</p>;
  if (error || !evt) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-red-600">Could not load this maintenance event.</p>
        <Button variant="secondary" onClick={() => navigate('/maintenance')}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to Maintenance
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/maintenance')}
            className="text-gray-400 hover:text-v-charcoal">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Wrench size={18} className="text-v-violet" />
              <h1 className="text-2xl font-bold text-v-charcoal">
                {evt.workOrderNumber ?? 'Maintenance Event'}
              </h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[evt.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {evt.status.replace('_', ' ')}
              </span>
            </div>
            {evt.asset && (
              <p className="text-sm text-gray-500 mt-0.5">
                Asset:{' '}
                <Link to={`/assets/${evt.asset.id}`} className="text-v-violet hover:underline">
                  {evt.asset.assetNumber} — {evt.asset.name}
                </Link>
              </p>
            )}
          </div>
        </div>
        {canDelete && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} className="mr-1.5" /> Delete
          </Button>
        )}
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-v-charcoal">Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Type *</label>
              <select disabled={!canWrite}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-v-pink disabled:bg-gray-50"
                {...register('maintenanceType')}>
                <option value="repair">Repair</option>
                <option value="preventive">Preventive</option>
                <option value="corrective">Corrective</option>
                <option value="inspection">Inspection</option>
                <option value="service">Service</option>
                <option value="calibration">Calibration</option>
                <option value="upgrade">Upgrade</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Status *</label>
              <select disabled={!canWrite}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-v-pink disabled:bg-gray-50"
                {...register('status')}>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <Input label="Work Order #" disabled {...register('workOrderNumber')} />
            <Input label="Vendor" disabled={!canWrite} {...register('vendor')} />
            <Input label={`Cost (${currencySymbol})`} type="number" step="0.01" disabled={!canWrite} {...register('cost')} />
            <div />
            <Input label="Scheduled Date" type="date" disabled={!canWrite} {...register('scheduledDate')} />
            <Input label="Completed Date" type="date" disabled={!canWrite} {...register('completedDate')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Description</label>
            <textarea rows={2} disabled={!canWrite}
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none disabled:bg-gray-50"
              {...register('description')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-v-charcoal mb-1">Notes</label>
            <textarea rows={4} disabled={!canWrite}
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none disabled:bg-gray-50"
              {...register('notes')} />
          </div>

          {canWrite && (
            <div className="flex justify-end gap-2">
              <Button type="submit" loading={update.isPending}>
                <Save size={14} className="mr-1.5" /> Save changes
              </Button>
            </div>
          )}
        </form>
      </Card>

      <MaintenancePhotosCard eventId={evt.id} canWrite={canWrite} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete maintenance event?"
        description={`This will remove ${evt.workOrderNumber ?? 'the work order'} and any attached photos.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await remove.mutateAsync(evt.id);
          navigate('/maintenance');
        }}
      />
    </div>
  );
}

interface PhotoMeta { id: string; mimeType: string; sizeBytes: number; hasThumb?: boolean; caption?: string; createdAt: string; }

function MaintenancePhotosCard({ eventId, canWrite }: { eventId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: photos = [], isLoading } = useQuery<PhotoMeta[]>({
    queryKey: ['maintenance-photos', eventId],
    queryFn:  () => api.get(`/api/v1/maintenance/${eventId}/photos`).then(r => r.data),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('photo', file);
      return api.post(`/api/v1/maintenance/${eventId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-photos', eventId] }),
    onError:   (e: Error) => setError(e.message ?? 'Upload failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/photos/${id}`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['maintenance-photos', eventId] }),
  });

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
        {canWrite && (
          <>
            <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}
              loading={upload.isPending}>
              <ImagePlus size={14} className="mr-1.5" /> Add
            </Button>
            <input ref={inputRef} type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden" onChange={onChange} />
          </>
        )}
      </CardHeader>
      <CardBody>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        {isLoading && <p className="text-sm text-gray-400">Loading photos…</p>}
        {!isLoading && photos.length === 0 && (
          <p className="text-sm text-gray-400">No photos attached yet.</p>
        )}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map(p => (
            <div key={p.id} className="relative group aspect-square overflow-hidden rounded-md border border-gray-100 bg-gray-50">
              <PhotoThumb id={p.id} hasThumb={p.hasThumb} />
              {canWrite && (
                <button onClick={() => remove.mutate(p.id)}
                  className="absolute top-1 right-1 p-1 rounded bg-white/80 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete photo">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function PhotoThumb({ id, hasThumb }: { id: string; hasThumb?: boolean }) {
  const { data: src } = useQuery<string>({
    queryKey: ['photo-blob', id, hasThumb],
    queryFn: async () => {
      const url = hasThumb ? `/api/v1/photos/${id}/download?thumb=1` : `/api/v1/photos/${id}/download`;
      const r = await api.get(url, { responseType: 'blob' });
      return URL.createObjectURL(r.data);
    },
    staleTime: 60 * 1000,
  });
  if (!src) return <div className="w-full h-full animate-pulse bg-gray-100" />;
  return <img src={src} alt="" className="w-full h-full object-cover" />;
}
