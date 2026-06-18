import { useState } from 'react';
import { KeyRound, Copy, Trash2, Plus } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';

export function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();

  const [name, setName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    try {
      setError('');
      const result = await create.mutateAsync({ name: name.trim() });
      setNewToken(result.token);
      setName('');
    } catch { setError('Failed to create API key'); }
  };

  const handleRevoke = (id: string) => {
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
    revoke.mutate(id);
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
            value={name} onChange={e => setName(e.target.value)} error={error} />
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
                <p className="text-xs text-v-mauve mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` • Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  {k.revokedAt && ' • Revoked'}
                </p>
              </div>
              {!k.revokedAt && (
                <Button size="sm" variant="danger" onClick={() => handleRevoke(k.id)}>
                  <Trash2 size={12} className="mr-1" /> Revoke
                </Button>
              )}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
