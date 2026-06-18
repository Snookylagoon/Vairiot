import { useState, useMemo } from 'react';
import { ScrollText, User as UserIcon, KeyRound, Search } from 'lucide-react';
import { useAuditEvents, type AuditEvent } from '@/hooks/useAdmin';
import { Card, CardBody } from '@/components/ui/Card';

const FILTERS: { label: string; value?: string }[] = [
  { label: 'All' },
  { label: 'Users',    value: 'user' },
  { label: 'API Keys', value: 'api-key' },
];

const ACTION_LABEL: Record<string, string> = {
  invite:        'invited',
  enable:        'enabled',
  disable:       'disabled',
  'role-change': 'changed role of',
  create:        'created',
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
  return ev.entityId;
}

export function AuditLogPage() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data: events = [], isLoading } = useAuditEvents(filter);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(ev =>
      actorLabel(ev).toLowerCase().includes(q) || entityLabel(ev).toLowerCase().includes(q) || ev.action.toLowerCase().includes(q));
  }, [events, search]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">Who did what, and when.</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, entity, or action…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-v-pink" />
      </div>

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

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {filtered.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <ScrollText size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">{search ? 'No matching events.' : 'No events yet.'}</p>
            </div>
          )}
          {filtered.map(ev => {
            const Icon = ev.entityType === 'api-key' ? KeyRound : UserIcon;
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
