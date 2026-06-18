import { useState } from 'react';
import { KeyRound, Copy, Trash2, Plus } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const AVAILABLE_SCOPES: Array<{ value: string; label: string; group: string }> = [
  { group: 'Assets',     value: 'asset:read',    label: 'Read assets' },
  { group: 'Assets',     value: 'asset:write',   label: 'Create / update assets, photos, checkouts' },
  { group: 'Assets',     value: 'asset:delete',  label: 'Delete assets and photos' },
  { group: 'Audits',     value: 'audit:read',    label: 'Read audit campaigns' },
  { group: 'Audits',     value: 'audit:write',   label: 'Create / run / complete audits' },
  { group: 'Categories', value: 'category:read', label: 'Read categories' },
  { group: 'Categories', value: 'category:write',label: 'Create / update categories' },
  { group: 'Sites',      value: 'site:read',     label: 'Read sites and locations' },
  { group: 'Sites',      value: 'site:write',    label: 'Create sites and locations' },
];

export function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const toggleScope = (s: string) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleCreate = async () => {
    if (!name.trim())  { setError('Name is required'); return; }
    if (scopes.length === 0) { setError('Pick at least one scope'); return; }
    try {
      setError('');
      const result = await create.mutateAsync({ name: name.trim(), scopes });
      setNewToken(result.token);
      setName('');
      setScopes([]);
    } catch { setError('Failed to create API key'); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-charcoal">API Keys</h1>
        <p className="text-sm text-gray-500 mt-1">Issue keys for integrations. Revoke when no longer needed.</p>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-semibold text-v-charcoal text-sm">Create API Key</h3>
          <Input label="Name *" placeholder="e.g. Warehouse scanner integration"
            value={name} onChange={e => setName(e.target.value)} />

          <div>
            <p className="text-xs font-semibold text-v-charcoal mb-2">Scopes *</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {AVAILABLE_SCOPES.map(s => (
                <label key={s.value} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-1">
                  <input type="checkbox" className="mt-0.5"
                    checked={scopes.includes(s.value)}
                    onChange={() => toggleScope(s.value)} />
                  <span>
                    <code className="font-mono text-v-mauve">{s.value}</code>
                    <span className="text-gray-500 block">{s.label}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">{scopes.length} selected</p>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button onClick={handleCreate} loading={create.isPending}>
            <Plus size={15} className="mr-1.5" /> Create Key
          </Button>

          {newToken && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                Copy this key now — it will not be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-2 py-1 break-all">{newToken}</code>
                <Button size="sm" variant="secondary"
                  onClick={() => { navigator.clipboard.writeText(newToken); }}>
                  <Copy size={12} className="mr-1" /> Copy
                </Button>
              </div>
              <button className="text-xs text-amber-700 underline" onClick={() => setNewToken(null)}>Dismiss</button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>}
          {keys.length === 0 && !isLoading && (
            <div className="py-8 text-center">
              <KeyRound size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No API keys yet.</p>
            </div>
          )}
          {keys.map(k => (
            <div key={k.id} className="flex items-center justify-between py-3 gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-v-charcoal truncate">{k.name}</p>
                <p className="text-xs text-gray-500 font-mono">{k.prefix}…</p>
                {k.scopes?.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{k.scopes.join(' · ')}</p>
                )}
                <p className="text-xs text-v-mauve mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` • Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  {k.revokedAt && ' • Revoked'}
                </p>
              </div>
              {!k.revokedAt && (
                <Button size="sm" variant="danger" onClick={() => setRevokeId(k.id)}>
                  <Trash2 size={12} className="mr-1" /> Revoke
                </Button>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={revokeId !== null}
        title="Revoke API Key"
        description="This API key will be permanently revoked. Any integrations using it will stop working immediately."
        confirmLabel="Revoke"
        loading={revoke.isPending}
        onConfirm={() => { if (revokeId) { revoke.mutate(revokeId); setRevokeId(null); } }}
        onCancel={() => setRevokeId(null)}
      />
    </div>
  );
}
