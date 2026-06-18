import { useState } from 'react';
import { Webhook as WebhookIcon, Plus, Trash2, Power } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useWebhooks, useWebhookEvents, useCreateWebhook, useToggleWebhook, useDeleteWebhook } from '@/hooks/useWebhooks';

export function WebhooksPage() {
  const { data: webhooks = [], isLoading } = useWebhooks();
  const { data: validEvents = [] } = useWebhookEvents();
  const createWh = useCreateWebhook();
  const toggleWh = useToggleWebhook();
  const deleteWh = useDeleteWebhook();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const handleCreate = () => {
    if (!name || !url || selectedEvents.length === 0) return;
    createWh.mutate({ name, url, events: selectedEvents }, {
      onSuccess: () => { setShowForm(false); setName(''); setUrl(''); setSelectedEvents([]); },
    });
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-charcoal">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">Receive HTTP callbacks when asset events occur</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} className="mr-1" /> New Webhook
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="My webhook"
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink" />
              </div>
              <div>
                <label className="block text-sm font-medium text-v-charcoal mb-1">URL</label>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/webhook"
                  className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-v-pink" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-v-charcoal mb-2">Events</label>
              <div className="flex flex-wrap gap-2">
                {validEvents.map(ev => (
                  <button key={ev} onClick={() => toggleEvent(ev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedEvents.includes(ev)
                        ? 'bg-v-violet text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} loading={createWh.isPending}>Create</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center gap-2">
          <WebhookIcon size={16} className="text-v-violet" />
          <span className="font-semibold text-v-charcoal text-sm">Configured Webhooks</span>
        </CardHeader>
        <CardBody className="divide-y divide-gray-50">
          {isLoading && <p className="text-sm text-gray-400 text-center py-4">Loading...</p>}
          {!isLoading && webhooks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No webhooks configured.</p>}
          {webhooks.map(wh => (
            <div key={wh.id} className="flex items-start justify-between py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-v-charcoal">{wh.name}</p>
                  <Badge label={wh.active ? 'active' : 'paused'} variant={wh.active ? 'active' : 'inactive'} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{wh.url}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {wh.events.map(ev => (
                    <span key={ev} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{ev}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-4">
                <button onClick={() => toggleWh.mutate({ id: wh.id, active: !wh.active })}
                  className={`p-1.5 rounded-lg transition-colors ${wh.active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}
                  title={wh.active ? 'Pause' : 'Activate'}>
                  <Power size={16} />
                </button>
                <button onClick={() => deleteWh.mutate(wh.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
