import { useState, useMemo } from 'react';
import { ScrollText, User as UserIcon, KeyRound, Search, Download, Package } from 'lucide-react';
import { useAuditEvents, type AuditEvent } from '@/hooks/useAdmin';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

const FILTERS: { label: string; value?: string }[] = [
  { label: 'All' },
  { label: 'Assets',   value: 'asset' },
  { label: 'Users',    value: 'user' },
  { label: 'API Keys', value: 'api-key' },
];

const ACTION_LABEL: Record<string, string> = {
  invite:        'invited',
  enable:        'enabled',
  disable:       'disabled',
  'role-change': 'changed role of',
  create:        'created',
  created:       'created',
  updated:       'updated',
  disposed:      'disposed',
  archived:      'archived',
  revoke:        'revoked',
  login:         'logged in',
};

function actorLabel(ev: AuditEvent): string {
  if (ev.actor?.name) return ev.actor.name;
  if (ev.metadata?.actorKey) return `API key ${ev.metadata.actorKey.slice(0, 8)}…`;
  if (ev.actorId) return ev.actorId;
  return 'System';
}

function entityLabel(ev: AuditEvent): string {
  if (ev.entityType === 'user') {
    const email = ev.metadata?.email
      ?? (typeof ev.after === 'object' && ev.after && 'email' in ev.after ? String((ev.after as { email: unknown }).email) : null);
    return email ?? ev.entityId;
  }
  if (ev.entityType === 'api-key') {
    const name = ev.metadata?.name
      ?? (typeof ev.after === 'object' && ev.after && 'name' in ev.after ? String((ev.after as { name: unknown }).name) : null);
    return name ?? ev.entityId;
  }
  if (ev.entityType === 'asset') {
    const name = typeof ev.after === 'object' && ev.after && 'name' in ev.after ? String((ev.after as { name: unknown }).name) : null;
    return name ?? ev.entityId.slice(0, 8);
  }
  return ev.entityId;
}

function entityIcon(ev: AuditEvent) {
  if (ev.entityType === 'api-key') return KeyRound;
  if (ev.entityType === 'asset') return Package;
  return UserIcon;
}

export function AuditLogPage() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: events = [], isLoading } = useAuditEvents(filter);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = events;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(ev =>
        actorLabel(ev).toLowerCase().includes(q) || entityLabel(ev).toLowerCase().includes(q) || ev.action.toLowerCase().includes(q));
    }
    if (from) list = list.filter(ev => new Date(ev.occurredAt) >= new Date(from));
    if (to) list = list.filter(ev => new Date(ev.occurredAt) <= new Date(to + 'T23:59:59'));
    return list;
  }, [events, search, from, to]);

  const exportCsv = async () => {
    const params: Record<string, string> = {};
    if (filter) params.entityType = filter;
    if (from) params.from = from;
    if (to) params.to = to;
    const res = await api.get('/api/v1/audit-events/export.csv', { params, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1">Who did what, and when.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, entity, or action…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button key={f.label} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-v-violet text-white' : 'bg-white text-v-charcoal border border-gray-200 hover:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white" />
          <label className="text-xs text-gray-500">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white" />
        </div>
      </div>

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {filtered.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <ScrollText size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">{search || from || to ? 'No matching events.' : 'No events yet.'}</p>
            </div>
          )}
          {filtered.map(ev => {
            const Icon = entityIcon(ev);
            const action = ACTION_LABEL[ev.action] ?? ev.action;
            return (
              <div key={ev.id} className="flex items-start gap-3 py-3">
                <div className="mt-0.5"><Icon size={16} className="text-v-mauve" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-v-charcoal">
                    <span className="font-medium">{actorLabel(ev)}</span>{' '}
                    {action}{' '}
                    <span className="font-medium">{entityLabel(ev)}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(ev.occurredAt).toLocaleString()} • {ev.entityType}
                  </p>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
