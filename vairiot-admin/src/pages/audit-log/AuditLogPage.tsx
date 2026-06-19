import { useState } from 'react';
import { useAuditLog, exportAuditCsv } from '@/hooks/useAuditLog';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Download, Search } from 'lucide-react';
import { toast } from 'sonner';

const ENTITY_TYPES = ['', 'user', 'asset', 'licence', 'audit_campaign', 'checkout', 'maintenance', 'transfer', 'api_key'];

export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const params: Record<string, string | number> = { limit: 200 };
  if (entityType) params.entityType = entityType;
  if (search) params.search = search;
  if (from) params.from = from;
  if (to) params.to = to;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Audit Log</h1>
        <Button size="sm" variant="secondary" loading={exporting} onClick={handleExport}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search actions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink"
          />
        </div>
        <select
          value={entityType}
          onChange={e => setEntityType(e.target.value)}
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
          onChange={e => setFrom(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink"
          placeholder="From"
        />
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink"
          placeholder="To"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Time</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Actor</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Action</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Entity</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e: any) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(e.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-v-charcoal">
                      {e.actor?.name ?? e.actorId ?? 'System'}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="default">{e.action}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant="gray">{e.entityType}</Badge>
                    </td>
                    <td className="px-6 py-3 text-xs font-mono text-gray-400 truncate max-w-[200px]">
                      {e.entityId}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No audit events found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
