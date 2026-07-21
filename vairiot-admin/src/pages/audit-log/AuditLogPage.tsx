import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { useAuditLog, exportAuditCsv } from '@/hooks/useAuditLog';
import { useUrlTableState } from '@/hooks/useUrlTableState';


const ENTITY_TYPES = ['', 'user', 'asset', 'licence', 'audit_campaign', 'checkout', 'maintenance', 'transfer', 'api_key'];

interface AuditEvent {
  id: string;
  occurredAt: string;
  actor?: { name?: string };
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
}

export function AuditLogPage() {
  const url = useUrlTableState(['entityType', 'from', 'to']);
  const { search, searchInput, setSearchInput, sortBy, sortOrder, toggleSort, extras, setExtra } = url;
  const { entityType, from, to } = extras;
  const [exporting, setExporting] = useState(false);

  const params: Record<string, string | number> = { limit: 200 };
  if (entityType) params.entityType = entityType;
  if (search) params.search = search;
  if (from) params.from = from;
  if (to) params.to = to;
  if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }

  const { data: events = [], isLoading } = useAuditLog(params);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAuditCsv({ entityType: entityType || undefined, from: from || undefined, to: to || undefined });
      toast.success('CSV downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<AuditEvent>[] = [
    {
      key: 'occurredAt', label: 'Time',
      render: e => (
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {new Date(e.occurredAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actor', label: 'Actor', sortable: false,
      render: e => <span className="text-v-charcoal">{e.actor?.name ?? e.actorId ?? 'System'}</span>,
    },
    { key: 'action', label: 'Action', render: e => <Badge variant="default">{e.action}</Badge> },
    { key: 'entityType', label: 'Entity', render: e => <Badge variant="gray">{e.entityType}</Badge> },
    {
      key: 'entityId', label: 'Entity ID',
      render: e => <span className="text-xs font-mono text-gray-400 truncate max-w-[200px] inline-block">{e.entityId}</span>,
    },
  ];

  const toolbar = (
    <>
      <select
        value={entityType}
        onChange={e => setExtra('entityType', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink"
      >
        <option value="">All entities</option>
        {ENTITY_TYPES.filter(Boolean).map(t => (
          <option key={t} value={t}>{t.replace('_', ' ')}</option>
        ))}
      </select>
      <input
        type="date"
        value={from}
        onChange={e => setExtra('from', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink"
      />
      <input
        type="date"
        value={to}
        onChange={e => setExtra('to', e.target.value)}
        className="text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink"
      />
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Audit Log</h1>
        <Button size="sm" variant="secondary" loading={exporting} onClick={handleExport}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>

      <DataTable<AuditEvent>
        columns={columns}
        rows={events as AuditEvent[]}
        getRowKey={e => e.id}
        isLoading={isLoading}
        emptyMessage="No audit events found"
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search actions…' }}
        sort={{ sortBy, sortOrder, onToggle: toggleSort }}
        toolbar={toolbar}
      />
    </div>
  );
}
