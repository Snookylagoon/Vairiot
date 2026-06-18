import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useMaintenanceEvents, useCreateMaintenanceEvent, useUpdateMaintenanceEvent } from '@/hooks/useMaintenance';
import { useAssets } from '@/hooks/useAssets';
import { hasPermission, useAuthStore } from '@/stores/auth.store';

const PAGE_SIZE = 25;

const maintenanceSchema = z.object({
  assetId: z.string().min(1, 'Select an asset'),
  maintenanceType: z.string().min(1, 'Type is required'),
  vendor: z.string().optional(),
  workOrderNumber: z.string().optional(),
  cost: z.string().optional(),
  description: z.string().optional(),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
  notes: z.string().optional(),
});
type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export function MaintenancePage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const canWrite = hasPermission(user, 'asset:write');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useMaintenanceEvents({ page, pageSize: PAGE_SIZE, status: statusFilter || undefined });
  const { data: assetsData } = useAssets({ pageSize: 200 });
  const createEvent = useCreateMaintenanceEvent();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
  });

  const onSubmit = async (fd: MaintenanceFormData) => {
    await createEvent.mutateAsync({
      ...fd,
      cost: fd.cost ? Number(fd.cost) : undefined,
    });
    reset();
    setShowForm(false);
  };

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Maintenance</h1>
          <p className="text-sm text-gray-500 mt-1">{total} events</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {canWrite && (
            <Button onClick={() => setShowForm(f => !f)}>
              <Plus size={16} className="mr-1.5" /> New Event
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-v-charcoal">New Maintenance Event</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Asset *</label>
                <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
                  {...register('assetId')}>
                  <option value="">-- Select asset --</option>
                  {assetsData?.assets.map(a => <option key={a.id} value={a.id}>{a.assetNumber} — {a.name}</option>)}
                </select>
                {errors.assetId && <p className="text-xs text-red-500 mt-1">{errors.assetId.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Type *</label>
                <select className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-v-pink"
                  {...register('maintenanceType')}>
                  <option value="">-- Select --</option>
                  <option value="preventive">Preventive</option>
                  <option value="corrective">Corrective</option>
                  <option value="inspection">Inspection</option>
                  <option value="calibration">Calibration</option>
                  <option value="upgrade">Upgrade</option>
                </select>
                {errors.maintenanceType && <p className="text-xs text-red-500 mt-1">{errors.maintenanceType.message}</p>}
              </div>
              <Input label="Vendor" {...register('vendor')} />
              <Input label="Work Order #" {...register('workOrderNumber')} />
              <Input label="Cost (£)" type="number" step="0.01" {...register('cost')} />
              <Input label="Scheduled Date" type="date" {...register('scheduledDate')} />
              <Input label="Completed Date" type="date" {...register('completedDate')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-1">Description</label>
              <textarea rows={2} className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink resize-none"
                {...register('description')} />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
              <Button type="submit" loading={createEvent.isPending}>Create Event</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Scheduled</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cost</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {data?.events.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center">
                  <Wrench size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm">No maintenance events</p>
                </td></tr>
              )}
              {data?.events.map(evt => (
                <tr key={evt.id} className="border-b border-gray-50 hover:bg-v-wash transition-colors last:border-0"
                  onClick={() => evt.asset && navigate(`/assets/${evt.asset.id}`)}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-v-violet">{evt.asset?.assetNumber}</span>
                    <span className="ml-2 text-v-charcoal">{evt.asset?.name}</span>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">{evt.maintenanceType}</td>
                  <td className="px-4 py-3 text-gray-500">{evt.vendor ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{evt.scheduledDate ? new Date(evt.scheduledDate).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[evt.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {evt.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{evt.cost ? `£${Number(evt.cost).toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
