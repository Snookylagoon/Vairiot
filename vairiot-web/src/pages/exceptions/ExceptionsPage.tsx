import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileWarning, Wrench, MapPinOff, ShieldAlert } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useExceptions } from '@/hooks/useExceptions';

function SummaryCard({ icon: Icon, label, count, color }: { icon: typeof AlertTriangle; label: string; count: number; color: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-v-charcoal">{count}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Client-side search + sort for small pre-computed lists (each exception
 * table only holds the top 20 items, so doing this in the browser is fine
 * and avoids extending the exceptions endpoint with per-list query params).
 */
function useClientTable<T>(rows: T[], searchFields: (keyof T)[]) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const visible = useMemo(() => {
    let out = rows;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(r => searchFields.some(f => {
        const v = (r as Record<string, unknown>)[f as string];
        return typeof v === 'string' && v.toLowerCase().includes(q);
      }));
    }
    if (sortBy) {
      const dir = sortOrder === 'desc' ? -1 : 1;
      out = [...out].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortBy];
        const bv = (b as Record<string, unknown>)[sortBy];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return out;
  }, [rows, search, sortBy, sortOrder, searchFields]);

  return {
    visible,
    search: { value: search, onChange: setSearch },
    sort: { sortBy, sortOrder, onToggle: toggleSort },
  };
}

interface MaintEvt {
  id: string;
  maintenanceType: string;
  scheduledDate: string;
  vendor: string | null;
  asset: { id: string; assetNumber: string; name: string };
}
interface WarrantyAsset { id: string; assetNumber: string; name: string; warrantyExpiry: string }
interface UnlocatedAsset { id: string; assetNumber: string; name: string }

// Flatten asset fields onto the row so search/sort can hit them generically.
type MaintRow = MaintEvt & { assetNumber: string; assetName: string };

export function ExceptionsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useExceptions();

  const overdueRowsRaw: MaintRow[] = useMemo(
    () => (data?.overdueMaintenanceEvents ?? []).map(e => ({
      ...(e as MaintEvt),
      assetNumber: (e as MaintEvt).asset.assetNumber,
      assetName: (e as MaintEvt).asset.name,
    })),
    [data?.overdueMaintenanceEvents],
  );
  const warrantyRowsRaw: WarrantyAsset[] = data?.expiredWarrantyAssets ?? [];
  const unlocatedRowsRaw: UnlocatedAsset[] = data?.unlocatedAssets ?? [];

  const maint = useClientTable<MaintRow>(overdueRowsRaw, ['assetNumber', 'assetName', 'maintenanceType', 'vendor'] as (keyof MaintRow)[]);
  const warranty = useClientTable<WarrantyAsset>(warrantyRowsRaw, ['assetNumber', 'name']);
  const unlocated = useClientTable<UnlocatedAsset>(unlocatedRowsRaw, ['assetNumber', 'name']);

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!data) return <div className="p-8 text-center text-gray-400">Failed to load exceptions.</div>;

  const { summary } = data;

  const overdueColumns: DataTableColumn<MaintRow>[] = [
    {
      key: 'assetNumber', label: 'Asset',
      render: e => (
        <>
          <span className="font-mono text-xs text-v-violet">{e.assetNumber}</span>
          <span className="ml-2">{e.assetName}</span>
        </>
      ),
    },
    { key: 'maintenanceType', label: 'Type', render: e => <span className="capitalize text-gray-600">{e.maintenanceType}</span> },
    {
      key: 'scheduledDate', label: 'Scheduled',
      render: e => <span className="text-red-600">{new Date(e.scheduledDate).toLocaleDateString('en-GB')}</span>,
    },
    { key: 'vendor', label: 'Vendor', render: e => <span className="text-gray-500">{e.vendor ?? '—'}</span> },
  ];

  const warrantyColumns: DataTableColumn<WarrantyAsset>[] = [
    {
      key: 'assetNumber', label: 'Asset',
      render: a => (
        <>
          <span className="font-mono text-xs text-v-violet">{a.assetNumber}</span>
          <span className="ml-2">{a.name}</span>
        </>
      ),
    },
    {
      key: 'warrantyExpiry', label: 'Warranty Expired',
      render: a => <span className="text-orange-600">{new Date(a.warrantyExpiry).toLocaleDateString('en-GB')}</span>,
    },
  ];

  const unlocatedColumns: DataTableColumn<UnlocatedAsset>[] = [
    { key: 'assetNumber', label: 'Asset Number', render: a => <span className="font-mono text-xs text-v-violet">{a.assetNumber}</span> },
    { key: 'name', label: 'Name', render: a => <span>{a.name}</span> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Exceptions Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Items requiring attention across the asset register</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={FileWarning} label="Missing Documents" count={summary.missingDocuments} color="bg-amber-500" />
        <SummaryCard icon={Wrench} label="Overdue Maintenance" count={summary.overdueMaintenanceCount} color="bg-red-500" />
        <SummaryCard icon={ShieldAlert} label="Expired Warranty" count={summary.expiredWarrantyCount} color="bg-orange-500" />
        <SummaryCard icon={MapPinOff} label="Unlocated Assets" count={summary.unlocatedAssetCount} color="bg-purple-500" />
      </div>

      {overdueRowsRaw.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-red-500" />
            <h2 className="font-semibold text-v-charcoal text-sm">Overdue Maintenance</h2>
          </div>
          <DataTable<MaintRow>
            columns={overdueColumns}
            rows={maint.visible}
            getRowKey={e => e.id}
            emptyMessage="No overdue maintenance"
            onRowClick={e => navigate(`/assets/${e.asset.id}`)}
            search={{ ...maint.search, placeholder: 'Search overdue maintenance…' }}
            sort={maint.sort}
          />
        </section>
      )}

      {warrantyRowsRaw.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-orange-500" />
            <h2 className="font-semibold text-v-charcoal text-sm">Expired Warranties</h2>
          </div>
          <DataTable<WarrantyAsset>
            columns={warrantyColumns}
            rows={warranty.visible}
            getRowKey={a => a.id}
            emptyMessage="No expired warranties"
            onRowClick={a => navigate(`/assets/${a.id}`)}
            search={{ ...warranty.search, placeholder: 'Search expired warranties…' }}
            sort={warranty.sort}
          />
        </section>
      )}

      {unlocatedRowsRaw.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <MapPinOff size={16} className="text-purple-500" />
            <h2 className="font-semibold text-v-charcoal text-sm">Unlocated Assets</h2>
          </div>
          <DataTable<UnlocatedAsset>
            columns={unlocatedColumns}
            rows={unlocated.visible}
            getRowKey={a => a.id}
            emptyMessage="No unlocated assets"
            onRowClick={a => navigate(`/assets/${a.id}`)}
            search={{ ...unlocated.search, placeholder: 'Search unlocated assets…' }}
            sort={unlocated.sort}
          />
        </section>
      )}
    </div>
  );
}
