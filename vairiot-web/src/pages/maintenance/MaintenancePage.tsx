import { zodResolver } from '@hookform/resolvers/zod';
import { Wrench, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { MaintenancePhotoStrip } from '@/components/maintenance/MaintenancePhotoStrip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useAssets } from '@/hooks/useAssets';
import { useCurrency } from '@/hooks/useCurrency';
import { useMaintenanceEvents, useCreateMaintenanceEvent } from '@/hooks/useMaintenance';
import { useUrlTableState } from '@/hooks/useUrlTableState';
import { hasAnyPermission, useAuthStore } from '@/stores/auth.store';

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

interface MaintenanceRow {
  id: string;
  maintenanceType: string;
  vendor: string | null;
  scheduledDate: string | null;
  status: string;
  cost: number | null;
  asset?: { assetNumber: string; name: string };
}

export function MaintenancePage() {
  const navigate = useNavigate();
  const { symbol: currencySymbol, fmt } = useCurrency();
  const user = useAuthStore(s => s.user);
  const canWrite = hasAnyPermission(user, 'asset:write');
  const [showForm, setShowForm] = useState(false);

  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, page, setPage, extras, setExtra } =
    useUrlTableState(['status']);
  const statusFilter = extras.status;

  const { data, isLoading } = useMaintenanceEvents({
    page, pageSize: PAGE_SIZE,
    status: statusFilter || undefined,
    search: search || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
  });
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

  const columns: DataTableColumn<MaintenanceRow>[] = [
    {
      key: 'asset.assetNumber', label: 'Asset',
      render: evt => (
        <>
          <span className="font-mono text-xs text-v-violet">{evt.asset?.assetNumber}</span>
          <span className="ml-2 text-v-charcoal">{evt.asset?.name}</span>
        </>
      ),
    },
    { key: 'maintenanceType', label: 'Type', render: evt => <span className="capitalize text-gray-600">{evt.maintenanceType}</span> },
    { key: 'vendor', label: 'Vendor', render: evt => <span className="text-gray-500">{evt.vendor ?? '—'}</span> },
    {
      key: 'scheduledDate', label: 'Scheduled',
      render: evt => <span className="text-gray-500">{evt.scheduledDate ? new Date(evt.scheduledDate).toLocaleDateString('en-GB') : '—'}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: evt => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[evt.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {evt.status.replace('_', ' ')}
        </span>
      ),
    },
    { key: 'cost', label: 'Cost', render: evt => <span className="text-gray-500">{evt.cost ? fmt(evt.cost) : '—'}</span> },
    {
      key: 'photos', label: 'Photos', sortable: false,
      render: evt => <span onClick={e => e.stopPropagation()}><MaintenancePhotoStrip eventId={evt.id} /></span>,
    },
  ];

  const toolbar = (
    <select
      value={statusFilter}
      onChange={e => setExtra('status', e.target.value)}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-v-pink">
      <option value="">All statuses</option>
      <option value="scheduled">Scheduled</option>
      <option value="in_progress">In Progress</option>
      <option value="completed">Completed</option>
      <option value="cancelled">Cancelled</option>
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Maintenance</h1>
          <p className="text-sm text-gray-500 mt-1">{total} events</p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowForm(f => !f)}>
            <Plus size={16} className="mr-1.5" /> New Event
          </Button>
        )}
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
              <Input label="Work Order #" placeholder="Auto: MAINT-00000001" disabled {...register('workOrderNumber')} />
              <Input label={`Cost (${currencySymbol})`} type="number" step="0.01" {...register('cost')} />
              <Input label="Scheduled Date" type="date" {...register('scheduledDate')} />
              <Input label="Completed Date" type="date" {...register('completedDate')} />
            </div>
            <Textarea label="Description" rows={2} {...register('description')} />
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
              <Button type="submit" loading={createEvent.isPending}>Create Event</Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable<MaintenanceRow>
        columns={columns}
        rows={data?.events as MaintenanceRow[] | undefined}
        getRowKey={evt => evt.id}
        isLoading={isLoading}
        emptyMessage="No maintenance events"
        emptyIcon={<Wrench size={32} className="mx-auto text-gray-300" />}
        onRowClick={evt => navigate(`/maintenance/${evt.id}`)}
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search asset, vendor, work order…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
        pagination={{ page, totalPages, total, pageSize: PAGE_SIZE, onPageChange: setPage }}
      />
    </div>
  );
}
